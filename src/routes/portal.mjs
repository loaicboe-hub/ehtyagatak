import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getEnvConfig } from '../config/env.mjs';
import { queryAll, queryOne, runSql, withTransaction } from '../db/client.mjs';
import { getWebsiteSettings } from '../services/settings.mjs';
import {
  appendSetCookie,
  createSession,
  ensureCsrfContext,
  formatCookie,
  getClientIp,
  getSecurityHeaders,
  hasPermission,
  logAudit,
  logSecurityEvent,
  verifyRequestCsrf
} from '../security/auth.mjs';
import { hashPassword, validatePasswordStrength, verifyPassword } from '../security/password.mjs';
import { getAppRateLimiter } from '../security/rate-limit.mjs';
import { sendCsv, sendHtml, sendJson, sendRedirect } from '../http/response.mjs';
import { formatNumber, t } from '../i18n/index.mjs';
import { stripControlChars } from '../../foundation/security/input-sanitizer.mjs';
import { isValidPhone } from '../../foundation/forms/validator.mjs';
import {
  renderPortalCrops,
  renderPortalDocuments,
  renderPortalGreenhouses,
  renderPortalInstallments,
  renderPortalInvestments,
  renderPortalLayout,
  renderPortalNotifications,
  renderPortalOverview,
  renderPortalProfile,
  renderPortalProfits,
  renderPortalStatement,
  renderPortalSupport
} from '../views/portal.mjs';

function buildStatementRows(db, userId, filters, lang) {
  const rows = [];
  const contractId = filters.contract_id && /^\d+$/.test(filters.contract_id)
    ? Number.parseInt(filters.contract_id, 10)
    : null;

  if (filters.type === 'all' || filters.type === 'installment') {
    const inst = queryAll(
      db,
      `SELECT ii.*, ic.contract_number
       FROM investor_installments ii
       JOIN investor_contracts ic ON ic.id = ii.contract_id
       WHERE ii.investor_user_id = ? AND ii.approval_status = 'APPROVED'
       ORDER BY ii.due_date DESC, ii.id DESC`,
      userId
    );
    for (const i of inst) {
      const dt = i.paid_date || i.due_date;
      if (filters.from && dt < filters.from) continue;
      if (filters.to && dt > filters.to) continue;
      if (contractId && i.contract_id !== contractId) continue;
      rows.push({
        date: dt,
        entryType: 'installment',
        entryTypeLabel: lang === 'ar' ? 'قسط' : 'Installment',
        contractNumber: i.contract_number,
        description: lang === 'ar' ? `قسط رقم ${i.installment_number} (مرجع: ${i.payment_reference || '—'})` : `Installment #${i.installment_number} (Ref: ${i.payment_reference || '—'})`,
        amount: i.paid_amount_egp > 0 ? i.paid_amount_egp : i.amount_egp,
        statusLabel: t(lang, `status.${i.payment_status}`)
      });
    }
  }

  if (filters.type === 'all' || filters.type === 'profit') {
    const prof = queryAll(
      db,
      `SELECT ip.*, ic.contract_number
       FROM investor_profits ip
       JOIN investor_contracts ic ON ic.id = ip.contract_id
       WHERE ip.investor_user_id = ? AND ip.approval_status = 'APPROVED'
       ORDER BY ip.distribution_date DESC, ip.id DESC`,
      userId
    );
    for (const p of prof) {
      const dt = p.distribution_date;
      if (filters.from && dt < filters.from) continue;
      if (filters.to && dt > filters.to) continue;
      if (contractId && p.contract_id !== contractId) continue;
      rows.push({
        date: dt,
        entryType: 'profit',
        entryTypeLabel: lang === 'ar' ? 'توزيع أرباح' : 'Profit Distribution',
        contractNumber: p.contract_number,
        description: `${p.period_label} (${p.payout_reference || '—'})`,
        amount: p.net_profit_egp,
        statusLabel: t(lang, `status.${p.payout_status}`)
      });
    }
  }

  rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  return rows;
}

export async function handlePortalRequest({ req, res, url, pathname, lang, db, user }) {
  const isPortalPath = pathname === '/portal' || pathname.startsWith('/portal/') || pathname.startsWith('/api/portal/');
  if (!isPortalPath) return false;

  const isApi = pathname.startsWith('/api/');
  if (!user) {
    if (isApi) return sendJson(res, 401, { error: 'Authentication required.' }), true;
    return sendRedirect(res, '/login'), true;
  }

  // Strictly enforce investor portal role permission
  if (!hasPermission(user, 'portal.access') || user.role !== 'investor') {
    if (isApi) return sendJson(res, 403, { error: 'Investor portal access denied.' }), true;
    return sendRedirect(res, '/admin'), true;
  }

  const cfg = getEnvConfig();
  const settings = getWebsiteSettings(db);
  const csrfToken = ensureCsrfContext(req, res, user);

  // JSON Summary API (Mobile-App Ready + strictly row-isolated + APPROVED only)
  if (pathname === '/api/portal/summary' && req.method === 'GET') {
    const contracts = queryAll(db, 'SELECT * FROM investor_contracts WHERE investor_user_id = ? ORDER BY id DESC', user.id);
    const greenhouses = queryAll(db, "SELECT * FROM greenhouses WHERE investor_user_id = ? AND approval_status = 'APPROVED'", user.id);
    const crops = queryAll(db, "SELECT * FROM crop_updates WHERE investor_user_id = ? AND approval_status = 'APPROVED'", user.id);
    const installments = queryAll(db, "SELECT * FROM investor_installments WHERE investor_user_id = ? AND approval_status = 'APPROVED'", user.id);
    const profits = queryAll(db, "SELECT * FROM investor_profits WHERE investor_user_id = ? AND approval_status = 'APPROVED'", user.id);
    return sendJson(res, 200, { contracts, greenhouses, crops, installments, profits }), true;
  }

  // Authenticated Document Download (strict ownership + APPROVED gate)
  const docMatch = pathname.match(/^\/api\/portal\/documents\/(\d+)\/download$/);
  if (docMatch && req.method === 'GET') {
    const docId = Number.parseInt(docMatch[1], 10);
    const doc = queryOne(
      db,
      `SELECT d.id, d.approval_status, m.original_name, m.storage_path, m.mime_type
       FROM investor_documents d
       JOIN media_items m ON m.id = d.media_id
       WHERE d.id = ? AND d.investor_user_id = ? AND d.approval_status = 'APPROVED'`,
      docId,
      user.id
    );
    if (!doc) return sendJson(res, 404, { error: 'Document not found.' }), true;
    const absPath = path.resolve(cfg.uploadDir, doc.storage_path);
    if (!absPath.startsWith(path.resolve(cfg.uploadDir)) || !fs.existsSync(absPath)) {
      return sendJson(res, 404, { error: 'Stored file missing.' }), true;
    }
    const bytes = fs.readFileSync(absPath);
    res.writeHead(200, {
      ...getSecurityHeaders(),
      'Content-Type': doc.mime_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${doc.original_name.replace(/[^a-zA-Z0-9._-]/g, '_')}"`
    });
    res.end(bytes);
    return true;
  }

  // CSV Account Statement Export (APPROVED only)
  if (pathname === '/api/portal/statement/export.csv' && req.method === 'GET') {
    const filters = {
      from: url.searchParams.get('from') || '',
      to: url.searchParams.get('to') || '',
      type: url.searchParams.get('type') || 'all',
      contract_id: url.searchParams.get('contract_id') || ''
    };
    const rows = buildStatementRows(db, user.id, filters, lang);
    const csvRows = [
      [
        lang === 'ar' ? 'التاريخ' : 'Date',
        lang === 'ar' ? 'النوع' : 'Type',
        lang === 'ar' ? 'رقم العقد' : 'Contract',
        lang === 'ar' ? 'البيان' : 'Description',
        lang === 'ar' ? 'القيمة (ج.م)' : 'Amount (EGP)',
        lang === 'ar' ? 'الحالة' : 'Status'
      ],
      ...rows.map((r) => [r.date, r.entryTypeLabel, r.contractNumber, r.description, r.amount, r.statusLabel])
    ];
    return sendCsv(res, `statement_${user.id}.csv`, csvRows), true;
  }

  // Mark notifications read
  if (pathname === '/api/portal/notifications/read' && req.method === 'POST') {
    const body = req._parsedBody || { fields: {} };
    if (!verifyRequestCsrf(req, user, body.fields._csrf)) {
      return sendJson(res, 403, { error: t(lang, 'forms.csrfInvalid') }), true;
    }
    runSql(db, 'UPDATE investor_notifications SET is_read = 1 WHERE investor_user_id = ?', user.id);
    if (body.isJson) return sendJson(res, 200, { ok: true }), true;
    return sendRedirect(res, '/portal/notifications?saved=1'), true;
  }

  // Create Support Ticket
  if (pathname === '/api/portal/support/tickets' && req.method === 'POST') {
    const body = req._parsedBody || { fields: {} };
    const f = body.fields;
    if (!verifyRequestCsrf(req, user, f._csrf)) {
      return sendJson(res, 403, { error: t(lang, 'forms.csrfInvalid') }), true;
    }
    const subject = stripControlChars(f.subject || '').slice(0, 255);
    const message = stripControlChars(f.message || '').slice(0, 2000);
    if (!subject || !message) {
      return sendRedirect(res, '/portal/support?error=validation'), true;
    }
    const category = ['general', 'financial', 'agricultural', 'technical', 'complaint'].includes(f.category) ? f.category : 'general';
    const priority = ['low', 'normal', 'high'].includes(f.priority) ? f.priority : 'normal';
    const ticketNo = `TK-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    withTransaction(db, () => {
      const tkId = runSql(
        db,
        `INSERT INTO support_tickets (ticket_number, investor_user_id, subject, category, priority, status)
         VALUES (?, ?, ?, ?, ?, 'open')`,
        ticketNo,
        user.id,
        subject,
        category,
        priority
      ).lastInsertRowid;

      runSql(
        db,
        `INSERT INTO support_ticket_replies (ticket_id, author_user_id, message, is_staff_reply)
         VALUES (?, ?, ?, 0)`,
        tkId,
        user.id,
        message
      );
      logAudit(db, {
        actorUserId: user.id,
        actorRole: user.role,
        action: 'support_ticket.create',
        entityType: 'support_ticket',
        entityId: tkId,
        after: { ticketNo, category, priority },
        ipAddress: getClientIp(req),
        source: 'portal'
      });
    });

    if (body.isJson) return sendJson(res, 201, { ok: true, ticketNumber: ticketNo }), true;
    return sendRedirect(res, '/portal/support?saved=1'), true;
  }

  // Reply to own Support Ticket (row-isolated!)
  const replyMatch = pathname.match(/^\/api\/portal\/support\/tickets\/(\d+)\/reply$/);
  if (replyMatch && req.method === 'POST') {
    const body = req._parsedBody || { fields: {} };
    const f = body.fields;
    if (!verifyRequestCsrf(req, user, f._csrf)) {
      return sendJson(res, 403, { error: t(lang, 'forms.csrfInvalid') }), true;
    }
    const ticketId = Number.parseInt(replyMatch[1], 10);
    const ticket = queryOne(db, 'SELECT id FROM support_tickets WHERE id = ? AND investor_user_id = ?', ticketId, user.id);
    if (!ticket) return sendJson(res, 404, { error: 'Ticket not found.' }), true;

    const msg = stripControlChars(f.message || '').slice(0, 2000);
    if (msg) {
      runSql(db, 'INSERT INTO support_ticket_replies (ticket_id, author_user_id, message, is_staff_reply) VALUES (?, ?, ?, 0)', ticket.id, user.id, msg);
      runSql(db, "UPDATE support_tickets SET updated_at = datetime('now') WHERE id = ?", ticket.id);
    }
    if (body.isJson) return sendJson(res, 200, { ok: true }), true;
    return sendRedirect(res, '/portal/support?saved=1'), true;
  }

  // Update Profile (strictly ONLY mobile_number & preferred_language — contract/financial fields locked)
  if (pathname === '/api/portal/profile' && req.method === 'POST') {
    const body = req._parsedBody || { fields: {} };
    const f = body.fields;
    if (!verifyRequestCsrf(req, user, f._csrf)) {
      return sendJson(res, 403, { error: t(lang, 'forms.csrfInvalid') }), true;
    }
    const mobile = stripControlChars(f.mobile_number || '');
    const prefLang = f.preferred_language === 'en' ? 'en' : 'ar';
    if (!isValidPhone(mobile)) {
      return sendRedirect(res, '/portal/profile?error=phone'), true;
    }
    runSql(db, "UPDATE users SET mobile_number = ?, preferred_language = ?, updated_at = datetime('now') WHERE id = ?", mobile, prefLang, user.id);
    logAudit(db, {
      actorUserId: user.id,
      actorRole: user.role,
      action: 'portal.profile.update',
      entityType: 'user',
      entityId: user.id,
      after: { mobile, prefLang },
      ipAddress: getClientIp(req),
      source: 'portal'
    });
    const langCookie = formatCookie('site_lang', prefLang, { httpOnly: false, sameSite: 'Lax', secure: cfg.cookieSecure, maxAge: 31536000 });
    res.setHeader('Set-Cookie', appendSetCookie(res.getHeader('Set-Cookie'), langCookie));
    if (body.isJson) return sendJson(res, 200, { ok: true }), true;
    return sendRedirect(res, '/portal/profile?saved=1'), true;
  }

  // Change Password (with current-password verification + rate limit + session rotation)
  if (pathname === '/api/portal/password' && req.method === 'POST') {
    const body = req._parsedBody || { fields: {} };
    const f = body.fields;
    if (!verifyRequestCsrf(req, user, f._csrf)) {
      return sendJson(res, 403, { error: t(lang, 'forms.csrfInvalid') }), true;
    }
    const ip = getClientIp(req);
    const limiter = getAppRateLimiter(db);
    const rate = await limiter.check('accountPasswordVerify', `${user.id}:${ip}`);
    if (!rate.allowed) {
      return sendRedirect(res, '/portal/profile?error=rate'), true;
    }

    const row = queryOne(db, 'SELECT password_hash FROM users WHERE id = ?', user.id);
    if (!row || !verifyPassword(String(f.current_password || ''), row.password_hash)) {
      return sendRedirect(res, '/portal/profile?error=curpw'), true;
    }
    if (String(f.new_password || '') !== String(f.confirm_password || '')) {
      return sendRedirect(res, '/portal/profile?error=mismatch'), true;
    }
    const pwCheck = validatePasswordStrength(String(f.new_password || ''), { minLength: cfg.passwordMinLength });
    if (!pwCheck.valid) {
      return sendRedirect(res, '/portal/profile?error=weakpw'), true;
    }

    let nextSession;
    withTransaction(db, () => {
      runSql(db, 'UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(String(f.new_password)), user.id);
      runSql(db, "UPDATE user_sessions SET revoked_at = datetime('now') WHERE user_id = ?", user.id);
      nextSession = createSession(db, { userId: user.id, ipAddress: ip, userAgent: req.headers['user-agent'] || '' });
      logSecurityEvent(db, { eventType: 'auth.password.change', userId: user.id, ipAddress: ip });
    });

    const cookieStr = formatCookie(cfg.authCookieName, nextSession.rawToken, {
      httpOnly: true,
      sameSite: cfg.cookieSameSite === 'strict' ? 'Strict' : 'Lax',
      secure: cfg.cookieSecure,
      maxAge: nextSession.ttlSeconds
    });
    res.setHeader('Set-Cookie', appendSetCookie(res.getHeader('Set-Cookie'), cookieStr));
    if (body.isJson) return sendJson(res, 200, { ok: true }), true;
    return sendRedirect(res, '/portal/profile?saved=1'), true;
  }

  if (req.method !== 'GET') return false;

  let flash = null;
  if (url.searchParams.get('saved') === '1') flash = { type: 'success', message: lang === 'ar' ? 'تم حفظ التغييرات بنجاح.' : 'Saved successfully.' };
  if (url.searchParams.get('error')) flash = { type: 'danger', message: lang === 'ar' ? 'يرجى مراجعة البيانات المدخلة.' : 'Please verify the submitted fields.' };

  if (pathname === '/portal') {
    const profile = queryOne(db, 'SELECT * FROM investor_profiles WHERE user_id = ?', user.id);
    const contractsCount = queryOne(db, "SELECT COUNT(*) AS cnt FROM investor_contracts WHERE investor_user_id = ? AND status = 'active'", user.id).cnt;
    const greenhousesCount = queryOne(db, "SELECT COUNT(*) AS cnt FROM greenhouses WHERE investor_user_id = ? AND approval_status = 'APPROVED'", user.id).cnt;
    const paidInstallmentsEgp = queryOne(db, "SELECT COALESCE(SUM(paid_amount_egp), 0) AS total FROM investor_installments WHERE investor_user_id = ? AND approval_status = 'APPROVED'", user.id).total;
    const distributedProfitsEgp = queryOne(db, "SELECT COALESCE(SUM(net_profit_egp), 0) AS total FROM investor_profits WHERE investor_user_id = ? AND approval_status = 'APPROVED'", user.id).total;
    const unreadNotifications = queryOne(db, 'SELECT COUNT(*) AS cnt FROM investor_notifications WHERE investor_user_id = ? AND is_read = 0', user.id).cnt;
    const openTickets = queryOne(db, "SELECT COUNT(*) AS cnt FROM support_tickets WHERE investor_user_id = ? AND status IN ('open', 'in_progress')", user.id).cnt;
    const notifications = queryAll(db, 'SELECT * FROM investor_notifications WHERE investor_user_id = ? ORDER BY created_at DESC LIMIT 5', user.id);

    return sendHtml(res, 200, renderPortalLayout({
      lang,
      title: t(lang, 'portal.nav.overview'),
      activeNav: 'overview',
      settings,
      user,
      csrfToken,
      flash,
      bodyHtml: renderPortalOverview({
        lang,
        user,
        profile,
        metrics: { contractsCount, greenhousesCount, paidInstallmentsEgp, distributedProfitsEgp, unreadNotifications, openTickets },
        notifications
      })
    })), true;
  }

  if (pathname === '/portal/investments') {
    const contracts = queryAll(
      db,
      `SELECT ic.*, pt.title AS project_title
       FROM investor_contracts ic
       LEFT JOIN project_translations pt ON pt.project_id = ic.project_id AND pt.language_code = ?
       WHERE ic.investor_user_id = ?
       ORDER BY ic.id DESC`,
      lang,
      user.id
    );
    return sendHtml(res, 200, renderPortalLayout({
      lang, title: t(lang, 'portal.nav.investments'), activeNav: 'investments', settings, user, csrfToken, flash,
      bodyHtml: renderPortalInvestments({ lang, contracts })
    })), true;
  }

  if (pathname === '/portal/greenhouses') {
    const greenhouses = queryAll(
      db,
      `SELECT g.*, ic.contract_number
       FROM greenhouses g
       JOIN investor_contracts ic ON ic.id = g.contract_id
       WHERE g.investor_user_id = ? AND g.approval_status = 'APPROVED'
       ORDER BY g.id DESC`,
      user.id
    );
    return sendHtml(res, 200, renderPortalLayout({
      lang, title: t(lang, 'portal.nav.greenhouses'), activeNav: 'greenhouses', settings, user, csrfToken, flash,
      bodyHtml: renderPortalGreenhouses({ lang, greenhouses })
    })), true;
  }

  if (pathname === '/portal/crops') {
    const crops = queryAll(
      db,
      `SELECT cu.*, g.greenhouse_number
       FROM crop_updates cu
       JOIN greenhouses g ON g.id = cu.greenhouse_id
       WHERE cu.investor_user_id = ? AND cu.approval_status = 'APPROVED'
       ORDER BY cu.recorded_date DESC, cu.id DESC`,
      user.id
    );
    return sendHtml(res, 200, renderPortalLayout({
      lang, title: t(lang, 'portal.nav.crops'), activeNav: 'crops', settings, user, csrfToken, flash,
      bodyHtml: renderPortalCrops({ lang, crops })
    })), true;
  }

  if (pathname === '/portal/profits') {
    const profits = queryAll(
      db,
      `SELECT ip.*, ic.contract_number
       FROM investor_profits ip
       JOIN investor_contracts ic ON ic.id = ip.contract_id
       WHERE ip.investor_user_id = ? AND ip.approval_status = 'APPROVED'
       ORDER BY ip.distribution_date DESC, ip.id DESC`,
      user.id
    );
    return sendHtml(res, 200, renderPortalLayout({
      lang, title: t(lang, 'portal.nav.profits'), activeNav: 'profits', settings, user, csrfToken, flash,
      bodyHtml: renderPortalProfits({ lang, profits })
    })), true;
  }

  if (pathname === '/portal/installments') {
    const installments = queryAll(
      db,
      `SELECT ii.*, ic.contract_number
       FROM investor_installments ii
       JOIN investor_contracts ic ON ic.id = ii.contract_id
       WHERE ii.investor_user_id = ? AND ii.approval_status = 'APPROVED'
       ORDER BY ii.due_date ASC, ii.installment_number ASC`,
      user.id
    );
    return sendHtml(res, 200, renderPortalLayout({
      lang, title: t(lang, 'portal.nav.installments'), activeNav: 'installments', settings, user, csrfToken, flash,
      bodyHtml: renderPortalInstallments({ lang, installments })
    })), true;
  }

  if (pathname === '/portal/documents') {
    const docs = queryAll(
      db,
      `SELECT d.*, ic.contract_number
       FROM investor_documents d
       LEFT JOIN investor_contracts ic ON ic.id = d.contract_id
       WHERE d.investor_user_id = ? AND d.approval_status = 'APPROVED'
       ORDER BY d.id DESC`,
      user.id
    );
    return sendHtml(res, 200, renderPortalLayout({
      lang, title: t(lang, 'portal.nav.documents'), activeNav: 'documents', settings, user, csrfToken, flash,
      bodyHtml: renderPortalDocuments({ lang, docs })
    })), true;
  }

  if (pathname === '/portal/statement') {
    const profile = queryOne(db, 'SELECT * FROM investor_profiles WHERE user_id = ?', user.id);
    const contracts = queryAll(db, 'SELECT id, contract_number FROM investor_contracts WHERE investor_user_id = ?', user.id);
    const filters = {
      from: url.searchParams.get('from') || '',
      to: url.searchParams.get('to') || '',
      type: url.searchParams.get('type') || 'all',
      contract_id: url.searchParams.get('contract_id') || ''
    };
    const rows = buildStatementRows(db, user.id, filters, lang);
    return sendHtml(res, 200, renderPortalLayout({
      lang, title: t(lang, 'portal.nav.statement'), activeNav: 'statement', settings, user, csrfToken, flash,
      bodyHtml: renderPortalStatement({ lang, user, profile, filters, contracts, rows })
    })), true;
  }

  if (pathname === '/portal/notifications') {
    const notifications = queryAll(db, 'SELECT * FROM investor_notifications WHERE investor_user_id = ? ORDER BY created_at DESC', user.id);
    return sendHtml(res, 200, renderPortalLayout({
      lang, title: t(lang, 'portal.nav.notifications'), activeNav: 'notifications', settings, user, csrfToken, flash,
      bodyHtml: renderPortalNotifications({ lang, notifications, csrfToken })
    })), true;
  }

  if (pathname === '/portal/support') {
    const tickets = queryAll(db, 'SELECT * FROM support_tickets WHERE investor_user_id = ? ORDER BY updated_at DESC', user.id);
    for (const tk of tickets) {
      tk.replies = queryAll(
        db,
        `SELECT r.*, u.full_name AS author_name
         FROM support_ticket_replies r
         JOIN users u ON u.id = r.author_user_id
         WHERE r.ticket_id = ?
         ORDER BY r.created_at ASC`,
        tk.id
      );
    }
    return sendHtml(res, 200, renderPortalLayout({
      lang, title: t(lang, 'portal.nav.support'), activeNav: 'support', settings, user, csrfToken, flash,
      bodyHtml: renderPortalSupport({ lang, tickets, csrfToken })
    })), true;
  }

  if (pathname === '/portal/profile') {
    const profile = queryOne(db, 'SELECT * FROM investor_profiles WHERE user_id = ?', user.id);
    const contractsSummary = queryOne(db, 'SELECT COALESCE(SUM(total_amount_egp), 0) AS total_amount FROM investor_contracts WHERE investor_user_id = ?', user.id);
    return sendHtml(res, 200, renderPortalLayout({
      lang, title: t(lang, 'portal.nav.profile'), activeNav: 'profile', settings, user, csrfToken, flash,
      bodyHtml: renderPortalProfile({ lang, user, profile, contractsSummary, csrfToken })
    })), true;
  }

  return false;
}
