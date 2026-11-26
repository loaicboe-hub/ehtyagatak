import { queryAll, queryOne, runSql, withTransaction } from '../db/client.mjs';
import { getWebsiteSettings } from '../services/settings.mjs';
import {
  appendSetCookie,
  createSession,
  ensureCsrfContext,
  formatCookie,
  getClientIp,
  hasPermission,
  isStaffRole,
  logAudit,
  logSecurityEvent,
  verifyRequestCsrf
} from '../security/auth.mjs';
import { hashPassword, validatePasswordStrength, verifyPassword } from '../security/password.mjs';
import { getAppRateLimiter } from '../security/rate-limit.mjs';
import { getSmtpStatus } from '../mail/smtp.mjs';
import { sendHtml, sendJson, sendRedirect } from '../http/response.mjs';
import { persistValidatedUpload } from '../http/body-parser.mjs';
import { getEnvConfig } from '../config/env.mjs';
import { escapeHtml, normalizeEmail, stripControlChars } from '../../foundation/security/input-sanitizer.mjs';
import { formatNumber, t } from '../i18n/index.mjs';
import { renderAdminApprovals, renderAdminInvestors, renderAdminLayout, renderAdminOverview } from '../views/admin.mjs';

function requireStaffPerm(user, perm, res, isApi) {
  if (!user) {
    if (isApi) sendJson(res, 401, { error: 'Authentication required.' });
    else sendRedirect(res, '/login');
    return false;
  }
  if (!isStaffRole(user.role)) {
    if (isApi) sendJson(res, 403, { error: 'Staff access required.' });
    else sendRedirect(res, '/portal');
    return false;
  }
  if (perm && !hasPermission(user, perm)) {
    if (isApi) sendJson(res, 403, { error: `Missing permission: ${perm}` });
    else sendHtml(res, 403, `<h1>403 Forbidden</h1><p>Missing permission: ${escapeHtml(perm)}</p>`);
    return false;
  }
  return true;
}

export async function handleAdminRequest({ req, res, url, pathname, lang, db, user }) {
  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/api/admin/');
  if (!isAdminPath) return false;

  const isApi = pathname.startsWith('/api/');
  const cfg = getEnvConfig();
  const settings = getWebsiteSettings(db);

  // POST Endpoints
  if (req.method === 'POST') {
    if (!requireStaffPerm(user, null, res, isApi)) return true;
    const body = req._parsedBody || { fields: {}, files: {} };
    const f = body.fields;
    if (!verifyRequestCsrf(req, user, f._csrf)) {
      return sendJson(res, 403, { error: t(lang, 'forms.csrfInvalid') }), true;
    }
    const ip = getClientIp(req);

    // 1. Approval Workflow Review
    if (pathname === '/api/admin/approvals/review') {
      if (!requireStaffPerm(user, 'approvals.review', res, isApi)) return true;
      const entityType = String(f.entity_type || '');
      const entityId = Number.parseInt(f.entity_id, 10);
      const decision = f.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
      const tableMap = {
        greenhouse: 'greenhouses',
        crop_update: 'crop_updates',
        installment: 'investor_installments',
        profit: 'investor_profits'
      };
      const table = tableMap[entityType];
      if (!table || !Number.isFinite(entityId)) return sendJson(res, 400, { error: 'Invalid approval target.' }), true;

      const existing = queryOne(db, `SELECT * FROM ${table} WHERE id = ?`, entityId);
      if (!existing) return sendJson(res, 404, { error: 'Record not found.' }), true;

      withTransaction(db, () => {
        if (decision === 'APPROVED' && existing.pending_erp_payload_json) {
          const patch = JSON.parse(existing.pending_erp_payload_json);
          if (entityType === 'greenhouse') {
            runSql(
              db,
              `UPDATE greenhouses SET operational_status = COALESCE(?, operational_status), current_crop_ar = COALESCE(?, current_crop_ar), current_crop_en = COALESCE(?, current_crop_en),
               approval_status = 'APPROVED', pending_erp_payload_json = NULL, approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
              patch.operational_status || null,
              patch.current_crop_ar || null,
              patch.current_crop_en || null,
              user.id,
              entityId
            );
          } else if (entityType === 'installment') {
            runSql(
              db,
              `UPDATE investor_installments SET paid_amount_egp = COALESCE(?, paid_amount_egp), paid_date = COALESCE(?, paid_date), payment_status = COALESCE(?, payment_status),
               payment_reference = COALESCE(?, payment_reference), approval_status = 'APPROVED', pending_erp_payload_json = NULL, approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
              patch.paid_amount_egp ?? null,
              patch.paid_date || null,
              patch.payment_status || null,
              patch.payment_reference || null,
              user.id,
              entityId
            );
          } else if (entityType === 'profit') {
            runSql(
              db,
              `UPDATE investor_profits SET gross_revenue_egp = COALESCE(?, gross_revenue_egp), operating_costs_egp = COALESCE(?, operating_costs_egp), net_profit_egp = COALESCE(?, net_profit_egp),
               payout_status = COALESCE(?, payout_status), payout_reference = COALESCE(?, payout_reference), approval_status = 'APPROVED', pending_erp_payload_json = NULL, approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
              patch.gross_revenue_egp ?? null,
              patch.operating_costs_egp ?? null,
              patch.net_profit_egp ?? null,
              patch.payout_status || null,
              patch.payout_reference || null,
              user.id,
              entityId
            );
          }
        } else {
          runSql(
            db,
            `UPDATE ${table} SET approval_status = ?, pending_erp_payload_json = NULL, approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
            decision,
            user.id,
            entityId
          );
        }

        if (decision === 'APPROVED') {
          runSql(
            db,
            `INSERT INTO investor_notifications (investor_user_id, title_ar, title_en, body_ar, body_en, category)
             VALUES (?, ?, ?, ?, ?, ?)`,
            existing.investor_user_id,
            'تحديث جديد معتمد في حسابك',
            'New Approved Account Update',
            `تم اعتماد تحديث جديد (${entityType} #${entityId}) وإتاحته في بوابة المستثمر.`,
            `A new ${entityType} update (#${entityId}) has been approved and is now visible in your Investor Portal.`,
            entityType
          );
        }

        logAudit(db, {
          actorUserId: user.id,
          actorRole: user.role,
          action: `approval.${decision.toLowerCase()}`,
          entityType,
          entityId,
          before: { approval_status: existing.approval_status },
          after: { approval_status: decision },
          ipAddress: ip,
          source: 'admin'
        });
      });

      if (body.isJson) return sendJson(res, 200, { ok: true, decision }), true;
      return sendRedirect(res, '/admin/approvals?saved=1'), true;
    }

    // 2. Investor & Operational Creation
    if (pathname === '/api/admin/investors/create') {
      if (!requireStaffPerm(user, 'investors.manage', res, isApi)) return true;
      const email = normalizeEmail(f.email || '');
      const fullName = stripControlChars(f.full_name || '');
      const mobile = stripControlChars(f.mobile_number || '');
      const investorCode = stripControlChars(f.investor_code || '').toUpperCase();
      const password = String(f.password || '');
      const pwCheck = validatePasswordStrength(password, { minLength: cfg.passwordMinLength });
      if (!email || !fullName || !investorCode || !pwCheck.valid) {
        return sendRedirect(res, '/admin/investors?error=validation'), true;
      }
      const role = queryOne(db, "SELECT id FROM roles WHERE slug = 'investor'");
      let newUserId;
      withTransaction(db, () => {
        newUserId = runSql(
          db,
          `INSERT INTO users (full_name, email, mobile_number, password_hash, role_id, preferred_language, is_active, email_verified_at)
           VALUES (?, ?, ?, ?, ?, 'ar', 1, datetime('now'))`,
          fullName,
          email,
          mobile,
          hashPassword(password),
          role.id
        ).lastInsertRowid;
        runSql(
          db,
          'INSERT INTO investor_profiles (user_id, investor_code, city, created_by) VALUES (?, ?, ?, ?)',
          newUserId,
          investorCode,
          stripControlChars(f.city || ''),
          user.id
        );
        logAudit(db, { actorUserId: user.id, actorRole: user.role, action: 'investor.create', entityType: 'user', entityId: newUserId, after: { email, investorCode }, ipAddress: ip });
      });
      if (body.isJson) return sendJson(res, 201, { ok: true, userId: Number(newUserId) }), true;
      return sendRedirect(res, '/admin/investors?saved=1'), true;
    }

    if (pathname === '/api/admin/contracts/create') {
      if (!requireStaffPerm(user, 'investors.manage', res, isApi)) return true;
      const invId = Number.parseInt(f.investor_user_id, 10);
      const total = Number.parseFloat(f.total_amount_egp || '0');
      const down = Number.parseFloat(f.down_payment_egp || '0');
      const rem = Math.max(0, total - down);
      const cntId = runSql(
        db,
        `INSERT INTO investor_contracts (investor_user_id, contract_number, project_id, greenhouse_count, total_amount_egp, down_payment_egp, remaining_amount_egp, start_date, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        invId,
        stripControlChars(f.contract_number || ''),
        f.project_id ? Number.parseInt(f.project_id, 10) : null,
        Number.parseInt(f.greenhouse_count || '3', 10),
        total,
        down,
        rem,
        stripControlChars(f.start_date || new Date().toISOString().slice(0, 10)),
        user.id
      ).lastInsertRowid;
      logAudit(db, { actorUserId: user.id, actorRole: user.role, action: 'contract.create', entityType: 'investor_contract', entityId: cntId, ipAddress: ip });
      return sendRedirect(res, '/admin/investors?saved=1'), true;
    }

    if (pathname === '/api/admin/greenhouses/create') {
      if (!requireStaffPerm(user, 'investors.manage', res, isApi)) return true;
      const contract = queryOne(db, 'SELECT id, investor_user_id, project_id FROM investor_contracts WHERE id = ?', Number.parseInt(f.contract_id, 10));
      if (!contract) return sendRedirect(res, '/admin/investors?error=contract'), true;
      const ghId = runSql(
        db,
        `INSERT INTO greenhouses (contract_id, investor_user_id, project_id, greenhouse_number, area_sqm, location_label, current_crop_ar, current_crop_en, operational_status, approval_status)
         VALUES (?, ?, ?, ?, 360, ?, ?, ?, ?, 'PENDING_APPROVAL')`,
        contract.id,
        contract.investor_user_id,
        contract.project_id,
        stripControlChars(f.greenhouse_number || ''),
        stripControlChars(f.location_label || ''),
        stripControlChars(f.current_crop_ar || ''),
        stripControlChars(f.current_crop_en || ''),
        f.operational_status || 'preparing'
      ).lastInsertRowid;
      logAudit(db, { actorUserId: user.id, actorRole: user.role, action: 'greenhouse.create_pending', entityType: 'greenhouse', entityId: ghId, ipAddress: ip });
      return sendRedirect(res, '/admin/approvals?saved=1'), true;
    }

    if (pathname === '/api/admin/crops/create') {
      if (!requireStaffPerm(user, 'investors.manage', res, isApi)) return true;
      const gh = queryOne(db, 'SELECT id, investor_user_id FROM greenhouses WHERE id = ?', Number.parseInt(f.greenhouse_id, 10));
      if (!gh) return sendRedirect(res, '/admin/investors?error=gh'), true;
      const cid = runSql(
        db,
        `INSERT INTO crop_updates (greenhouse_id, investor_user_id, season_name, crop_name_ar, crop_name_en, stage_ar, stage_en, yield_kg, sales_revenue_egp, recorded_date, source, approval_status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin', 'PENDING_APPROVAL', ?)`,
        gh.id,
        gh.investor_user_id,
        stripControlChars(f.season_name || ''),
        stripControlChars(f.crop_name_ar || ''),
        stripControlChars(f.crop_name_en || ''),
        'تحديث موسمي',
        'Seasonal Update',
        Number.parseFloat(f.yield_kg || '0'),
        Number.parseFloat(f.sales_revenue_egp || '0'),
        stripControlChars(f.recorded_date || new Date().toISOString().slice(0, 10)),
        user.id
      ).lastInsertRowid;
      logAudit(db, { actorUserId: user.id, actorRole: user.role, action: 'crop_update.create_pending', entityType: 'crop_update', entityId: cid, ipAddress: ip });
      return sendRedirect(res, '/admin/approvals?saved=1'), true;
    }

    if (pathname === '/api/admin/installments/create') {
      if (!requireStaffPerm(user, 'investors.manage', res, isApi)) return true;
      const contract = queryOne(db, 'SELECT id, investor_user_id FROM investor_contracts WHERE id = ?', Number.parseInt(f.contract_id, 10));
      if (!contract) return sendRedirect(res, '/admin/investors?error=contract'), true;
      const iid = runSql(
        db,
        `INSERT INTO investor_installments (contract_id, investor_user_id, installment_number, due_date, amount_egp, paid_amount_egp, payment_status, source, approval_status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'admin', 'PENDING_APPROVAL', ?)`,
        contract.id,
        contract.investor_user_id,
        Number.parseInt(f.installment_number || '1', 10),
        stripControlChars(f.due_date || ''),
        Number.parseFloat(f.amount_egp || '0'),
        Number.parseFloat(f.paid_amount_egp || '0'),
        f.payment_status || 'pending',
        user.id
      ).lastInsertRowid;
      logAudit(db, { actorUserId: user.id, actorRole: user.role, action: 'installment.create_pending', entityType: 'installment', entityId: iid, ipAddress: ip });
      return sendRedirect(res, '/admin/approvals?saved=1'), true;
    }

    if (pathname === '/api/admin/profits/create') {
      if (!requireStaffPerm(user, 'investors.manage', res, isApi)) return true;
      const contract = queryOne(db, 'SELECT id, investor_user_id FROM investor_contracts WHERE id = ?', Number.parseInt(f.contract_id, 10));
      if (!contract) return sendRedirect(res, '/admin/investors?error=contract'), true;
      const pid = runSql(
        db,
        `INSERT INTO investor_profits (contract_id, investor_user_id, period_label, gross_revenue_egp, operating_costs_egp, net_profit_egp, distribution_date, payout_status, source, approval_status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'admin', 'PENDING_APPROVAL', ?)`,
        contract.id,
        contract.investor_user_id,
        stripControlChars(f.period_label || ''),
        Number.parseFloat(f.gross_revenue_egp || '0'),
        Number.parseFloat(f.operating_costs_egp || '0'),
        Number.parseFloat(f.net_profit_egp || '0'),
        stripControlChars(f.distribution_date || ''),
        f.payout_status || 'scheduled',
        user.id
      ).lastInsertRowid;
      logAudit(db, { actorUserId: user.id, actorRole: user.role, action: 'profit.create_pending', entityType: 'profit', entityId: pid, ipAddress: ip });
      return sendRedirect(res, '/admin/approvals?saved=1'), true;
    }

    // 3. Leads & Support Updates
    if (pathname === '/api/admin/leads/update') {
      if (!requireStaffPerm(user, 'inquiries.manage', res, isApi)) return true;
      runSql(db, "UPDATE investment_leads SET status = ?, admin_notes = ?, updated_at = datetime('now') WHERE id = ?", f.status || 'new', stripControlChars(f.admin_notes || ''), Number.parseInt(f.lead_id, 10));
      logAudit(db, { actorUserId: user.id, actorRole: user.role, action: 'lead.update', entityType: 'investment_lead', entityId: f.lead_id, after: { status: f.status }, ipAddress: ip });
      return sendRedirect(res, '/admin/leads?saved=1'), true;
    }

    if (pathname === '/api/admin/support/reply') {
      if (!requireStaffPerm(user, 'support.manage', res, isApi)) return true;
      const ticketId = Number.parseInt(f.ticket_id, 10);
      const msg = stripControlChars(f.message || '');
      if (msg) {
        runSql(db, 'INSERT INTO support_ticket_replies (ticket_id, author_user_id, message, is_staff_reply) VALUES (?, ?, ?, 1)', ticketId, user.id, msg);
      }
      if (f.status) {
        runSql(db, "UPDATE support_tickets SET status = ?, updated_at = datetime('now') WHERE id = ?", f.status, ticketId);
      }
      logAudit(db, { actorUserId: user.id, actorRole: user.role, action: 'support_ticket.staff_reply', entityType: 'support_ticket', entityId: ticketId, ipAddress: ip });
      return sendRedirect(res, '/admin/support?saved=1'), true;
    }

    // 4. Projects / News / FAQs / Content / Pages CMS
    if (pathname === '/api/admin/modules/project') {
      if (!requireStaffPerm(user, 'modules.manage', res, isApi)) return true;
      withTransaction(db, () => {
        const pid = runSql(
          db,
          `INSERT INTO projects (slug, location_ar, location_en, total_greenhouses, available_greenhouses, area_per_greenhouse_sqm, unit_price_egp, status, is_featured, is_published, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1, 1, ?)`,
          stripControlChars(f.slug || `proj-${Date.now()}`),
          stripControlChars(f.location_ar || ''),
          stripControlChars(f.location_en || ''),
          Number.parseInt(f.total_greenhouses || '40', 10),
          Number.parseInt(f.available_greenhouses || '20', 10),
          Number.parseFloat(f.area_per_greenhouse_sqm || '360'),
          Number.parseFloat(f.unit_price_egp || '220000'),
          user.id
        ).lastInsertRowid;
        runSql(db, `INSERT INTO project_translations (project_id, language_code, title, summary, description, is_verified) VALUES (?, 'ar', ?, ?, ?, 0)`, pid, stripControlChars(f.title_ar || ''), stripControlChars(f.summary_ar || ''), stripControlChars(f.summary_ar || ''));
        runSql(db, `INSERT INTO project_translations (project_id, language_code, title, summary, description, is_verified) VALUES (?, 'en', ?, ?, ?, 0)`, pid, stripControlChars(f.title_en || ''), stripControlChars(f.summary_en || ''), stripControlChars(f.summary_en || ''));
      });
      return sendRedirect(res, '/admin/modules?saved=1'), true;
    }

    if (pathname === '/api/admin/modules/news') {
      if (!requireStaffPerm(user, 'modules.manage', res, isApi)) return true;
      withTransaction(db, () => {
        const nid = runSql(db, 'INSERT INTO news_posts (slug, is_published, author_id) VALUES (?, 1, ?)', stripControlChars(f.slug || `news-${Date.now()}`), user.id).lastInsertRowid;
        runSql(db, `INSERT INTO news_post_translations (post_id, language_code, title, excerpt, body, is_verified) VALUES (?, 'ar', ?, ?, ?, 0)`, nid, stripControlChars(f.title_ar || ''), stripControlChars(f.excerpt_ar || ''), stripControlChars(f.body_ar || ''));
        runSql(db, `INSERT INTO news_post_translations (post_id, language_code, title, excerpt, body, is_verified) VALUES (?, 'en', ?, ?, ?, 0)`, nid, stripControlChars(f.title_en || ''), stripControlChars(f.excerpt_en || ''), stripControlChars(f.body_en || ''));
      });
      return sendRedirect(res, '/admin/modules?saved=1'), true;
    }

    if (pathname === '/api/admin/modules/faq') {
      if (!requireStaffPerm(user, 'modules.manage', res, isApi)) return true;
      withTransaction(db, () => {
        const fid = runSql(db, 'INSERT INTO faqs (category, sort_order, is_visible) VALUES (?, 10, 1)', stripControlChars(f.category || 'investment')).lastInsertRowid;
        runSql(db, `INSERT INTO faq_translations (faq_id, language_code, question, answer, is_verified) VALUES (?, 'ar', ?, ?, 0)`, fid, stripControlChars(f.question_ar || ''), stripControlChars(f.answer_ar || ''));
        runSql(db, `INSERT INTO faq_translations (faq_id, language_code, question, answer, is_verified) VALUES (?, 'en', ?, ?, 0)`, fid, stripControlChars(f.question_en || ''), stripControlChars(f.answer_en || ''));
      });
      return sendRedirect(res, '/admin/modules?saved=1'), true;
    }

    if (pathname === '/api/admin/content/update') {
      if (!requireStaffPerm(user, 'content.edit', res, isApi)) return true;
      const sectionId = Number.parseInt(f.section_id, 10);
      const l = f.language_code === 'en' ? 'en' : 'ar';
      runSql(
        db,
        `UPDATE homepage_section_translations SET heading = ?, subheading = ?, cta_label = ?, is_verified = ?, updated_at = datetime('now')
         WHERE section_id = ? AND language_code = ?`,
        stripControlChars(f.heading || ''),
        stripControlChars(f.subheading || ''),
        stripControlChars(f.cta_label || ''),
        f.is_verified === '1' ? 1 : 0,
        sectionId,
        l
      );
      return sendRedirect(res, '/admin/content?saved=1'), true;
    }

    if (pathname === '/api/admin/pages/update') {
      if (!requireStaffPerm(user, 'pages.edit', res, isApi)) return true;
      const pageId = Number.parseInt(f.page_id, 10);
      const l = f.language_code === 'en' ? 'en' : 'ar';
      runSql(db, 'UPDATE pages SET is_visible = ?, updated_by = ? WHERE id = ?', f.is_visible === '1' ? 1 : 0, user.id, pageId);
      runSql(
        db,
        `UPDATE page_translations SET title = ?, seo_title = ?, seo_description = ?, content_json = ?, is_verified = ?, updated_by = ?, updated_at = datetime('now')
         WHERE page_id = ? AND language_code = ?`,
        stripControlChars(f.title || ''),
        stripControlChars(f.seo_title || ''),
        stripControlChars(f.seo_description || ''),
        JSON.stringify({ summary: stripControlChars(f.summary || ''), body: stripControlChars(f.body || '') }),
        f.is_verified === '1' ? 1 : 0,
        user.id,
        pageId,
        l
      );
      return sendRedirect(res, '/admin/pages?saved=1'), true;
    }

    // 5. Media Upload (enforces foundation upload-policy.mjs)
    if (pathname === '/api/admin/media/upload') {
      if (!requireStaffPerm(user, 'media.upload', res, isApi)) return true;
      const file = body.files?.file;
      if (!file) return sendRedirect(res, '/admin/media?error=nofile'), true;
      const category = ['image', 'brandIcon', 'document'].includes(f.category) ? f.category : 'image';
      const saved = persistValidatedUpload(file, category, f.folder || 'general');
      if (!saved.valid) {
        logSecurityEvent(db, { eventType: 'media.upload.rejected', severity: 'warning', userId: user.id, ipAddress: ip, details: { reason: saved.reason, name: file.originalName } });
        return sendRedirect(res, '/admin/media?error=invalid'), true;
      }
      runSql(
        db,
        `INSERT INTO media_items (original_name, stored_filename, storage_path, mime_type, extension, size_bytes, sha256_checksum, folder, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        saved.originalName,
        saved.storedFilename,
        saved.storagePath,
        saved.mimeType,
        saved.extension,
        saved.sizeBytes,
        saved.sha256Checksum,
        saved.folder,
        user.id
      );
      return sendRedirect(res, '/admin/media?saved=1'), true;
    }

    // 6. Website Settings + Calculator Defaults + Contact Info + SEO
    if (pathname === '/api/admin/settings/website') {
      if (!requireStaffPerm(user, 'settings.website.edit', res, isApi)) return true;
      const cur = settings.identity;
      const nextIdentity = {
        ...cur,
        site_name: { ar: stripControlChars(f.site_name_ar || ''), en: stripControlChars(f.site_name_en || '') },
        tagline: { ar: stripControlChars(f.tagline_ar || ''), en: stripControlChars(f.tagline_en || '') },
        copyright_text: { ar: stripControlChars(f.copyright_ar || ''), en: stripControlChars(f.copyright_en || '') }
      };
      const nextCalc = {
        ...settings.calculator,
        greenhouse_area_sqm: Number.parseFloat(f.greenhouse_area_sqm || '360'),
        greenhouse_price_egp: Number.parseFloat(f.greenhouse_price_egp || '220000'),
        min_greenhouses: Number.parseInt(f.min_greenhouses || '3', 10),
        down_payment_percent: Number.parseFloat(f.down_payment_percent || '35')
      };
      withTransaction(db, () => {
        runSql(db, "UPDATE website_settings SET value_json = ?, updated_by = ?, updated_at = datetime('now') WHERE setting_key = 'site_identity'", JSON.stringify(nextIdentity), user.id);
        runSql(db, "UPDATE website_settings SET value_json = ?, updated_by = ?, updated_at = datetime('now') WHERE setting_key = 'investment_calculator'", JSON.stringify(nextCalc), user.id);
        logAudit(db, { actorUserId: user.id, actorRole: user.role, action: 'settings.website_calculator.update', entityType: 'website_settings', after: nextCalc, ipAddress: ip });
      });
      if (body.isJson) return sendJson(res, 200, { ok: true }), true;
      return sendRedirect(res, '/admin/settings?saved=1'), true;
    }

    if (pathname === '/api/admin/settings/contact') {
      if (!requireStaffPerm(user, 'settings.contact.edit', res, isApi)) return true;
      const nextContact = {
        ...settings.contact,
        whatsapp_number: stripControlChars(f.whatsapp_number || ''),
        mobile_number: stripControlChars(f.mobile_number || ''),
        email_address: stripControlChars(f.email_address || ''),
        physical_address: { ar: stripControlChars(f.address_ar || ''), en: stripControlChars(f.address_en || '') },
        working_hours: { ar: stripControlChars(f.hours_ar || ''), en: stripControlChars(f.hours_en || '') },
        show_whatsapp_floating_cta: f.show_whatsapp_floating_cta === '1'
      };
      runSql(db, "UPDATE website_settings SET value_json = ?, updated_by = ?, updated_at = datetime('now') WHERE setting_key = 'contact_info'", JSON.stringify(nextContact), user.id);
      logAudit(db, { actorUserId: user.id, actorRole: user.role, action: 'settings.contact.update', entityType: 'website_settings', after: nextContact, ipAddress: ip });
      return sendRedirect(res, '/admin/contact?saved=1'), true;
    }

    if (pathname === '/api/admin/settings/seo') {
      if (!requireStaffPerm(user, 'seo.edit', res, isApi)) return true;
      const nextSeo = {
        ...settings.seo,
        canonical_origin: stripControlChars(f.canonical_origin || ''),
        robots_allow_indexing: f.robots_allow_indexing === '1',
        default_title: { ar: stripControlChars(f.title_ar || ''), en: stripControlChars(f.title_en || '') },
        default_description: { ar: stripControlChars(f.desc_ar || ''), en: stripControlChars(f.desc_en || '') }
      };
      runSql(db, "UPDATE website_settings SET value_json = ?, updated_by = ?, updated_at = datetime('now') WHERE setting_key = 'seo_global'", JSON.stringify(nextSeo), user.id);
      return sendRedirect(res, '/admin/seo?saved=1'), true;
    }

    // 7. Staff User Management (protecting super_admin!)
    if (pathname === '/api/admin/users/create') {
      if (!requireStaffPerm(user, 'users.create', res, isApi)) return true;
      const roleSlug = String(f.role_slug || 'editor');
      if (roleSlug === 'super_admin' && user.role !== 'super_admin') {
        return sendJson(res, 403, { error: 'Privilege escalation denied.' }), true;
      }
      const roleRow = queryOne(db, 'SELECT id FROM roles WHERE slug = ?', roleSlug);
      const pwCheck = validatePasswordStrength(String(f.password || ''), { minLength: cfg.passwordMinLength });
      if (!roleRow || !pwCheck.valid) return sendRedirect(res, '/admin/users?error=validation'), true;
      runSql(
        db,
        `INSERT INTO users (full_name, email, mobile_number, password_hash, role_id, preferred_language, is_active, email_verified_at)
         VALUES (?, ?, ?, ?, ?, 'ar', 1, datetime('now'))`,
        stripControlChars(f.full_name || ''),
        normalizeEmail(f.email || ''),
        stripControlChars(f.mobile_number || ''),
        hashPassword(String(f.password)),
        roleRow.id
      );
      logAudit(db, { actorUserId: user.id, actorRole: user.role, action: 'user.create', entityType: 'user', after: { roleSlug }, ipAddress: ip });
      return sendRedirect(res, '/admin/users?saved=1'), true;
    }

    if (pathname === '/api/admin/users/toggle') {
      if (!requireStaffPerm(user, 'users.toggle_active', res, isApi)) return true;
      const targetId = Number.parseInt(f.user_id, 10);
      const target = queryOne(db, 'SELECT u.id, u.is_active, r.slug AS role_slug FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?', targetId);
      if (!target || (target.role_slug === 'super_admin' && user.role !== 'super_admin')) {
        return sendJson(res, 403, { error: 'Cannot modify super_admin account.' }), true;
      }
      const nextActive = target.is_active ? 0 : 1;
      runSql(db, 'UPDATE users SET is_active = ? WHERE id = ?', nextActive, target.id);
      if (!nextActive) runSql(db, "UPDATE user_sessions SET revoked_at = datetime('now') WHERE user_id = ?", target.id);
      logSecurityEvent(db, { eventType: 'user.status.changed', userId: user.id, ipAddress: ip, details: { targetId, nextActive } });
      return sendRedirect(res, '/admin/users?saved=1'), true;
    }

    // 8. Personal Account Settings (Strictly separate from Website Settings)
    if (pathname === '/api/admin/account/profile') {
      if (!requireStaffPerm(user, 'account.self.manage', res, isApi)) return true;
      runSql(
        db,
        "UPDATE users SET full_name = ?, mobile_number = ?, preferred_language = ?, updated_at = datetime('now') WHERE id = ?",
        stripControlChars(f.full_name || user.fullName),
        stripControlChars(f.mobile_number || ''),
        f.preferred_language === 'en' ? 'en' : 'ar',
        user.id
      );
      return sendRedirect(res, '/admin/account?saved=1'), true;
    }

    if (pathname === '/api/admin/account/password') {
      if (!requireStaffPerm(user, 'account.self.manage', res, isApi)) return true;
      const limiter = getAppRateLimiter(db);
      const rate = await limiter.check('accountPasswordVerify', `${user.id}:${ip}`);
      if (!rate.allowed) return sendRedirect(res, '/admin/account?error=rate'), true;
      const row = queryOne(db, 'SELECT password_hash FROM users WHERE id = ?', user.id);
      if (!row || !verifyPassword(String(f.current_password || ''), row.password_hash)) {
        return sendRedirect(res, '/admin/account?error=curpw'), true;
      }
      if (String(f.new_password || '') !== String(f.confirm_password || '')) {
        return sendRedirect(res, '/admin/account?error=mismatch'), true;
      }
      const pwCheck = validatePasswordStrength(String(f.new_password || ''), { minLength: cfg.passwordMinLength });
      if (!pwCheck.valid) return sendRedirect(res, '/admin/account?error=weak'), true;
      let nextSession;
      withTransaction(db, () => {
        runSql(db, 'UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(String(f.new_password)), user.id);
        runSql(db, "UPDATE user_sessions SET revoked_at = datetime('now') WHERE user_id = ?", user.id);
        nextSession = createSession(db, { userId: user.id, ipAddress: ip, userAgent: req.headers['user-agent'] || '' });
        logSecurityEvent(db, { eventType: 'auth.password.change', userId: user.id, ipAddress: ip });
      });
      const cookieStr = formatCookie(cfg.authCookieName, nextSession.rawToken, { httpOnly: true, sameSite: 'Lax', secure: cfg.cookieSecure, maxAge: nextSession.ttlSeconds });
      res.setHeader('Set-Cookie', appendSetCookie(res.getHeader('Set-Cookie'), cookieStr));
      return sendRedirect(res, '/admin/account?saved=1'), true;
    }

    if (pathname === '/api/admin/account/revoke-sessions') {
      if (!requireStaffPerm(user, 'account.self.manage', res, isApi)) return true;
      runSql(db, "UPDATE user_sessions SET revoked_at = datetime('now') WHERE user_id = ? AND id != ?", user.id, user.sessionId);
      logSecurityEvent(db, { eventType: 'auth.sessions.revoke_others', userId: user.id, ipAddress: ip });
      return sendRedirect(res, '/admin/account?saved=1'), true;
    }

    return false;
  }

  // GET Views
  if (req.method !== 'GET') return false;
  if (!requireStaffPerm(user, null, res, isApi)) return true;

  const csrfToken = ensureCsrfContext(req, res, user);
  let flash = null;
  if (url.searchParams.get('saved') === '1') flash = { type: 'success', message: lang === 'ar' ? 'تم الحفظ بنجاح.' : 'Saved successfully.' };
  if (url.searchParams.get('error')) flash = { type: 'danger', message: lang === 'ar' ? 'تعذر تنفيذ العملية، يرجى مراجعة المدخلات.' : 'Action failed, please check your input.' };

  if (pathname === '/admin') {
    if (!requireStaffPerm(user, 'dashboard.overview.view', res, false)) return true;
    const pendingApprovals =
      queryOne(db, "SELECT COUNT(*) AS cnt FROM greenhouses WHERE approval_status = 'PENDING_APPROVAL'").cnt +
      queryOne(db, "SELECT COUNT(*) AS cnt FROM crop_updates WHERE approval_status = 'PENDING_APPROVAL'").cnt +
      queryOne(db, "SELECT COUNT(*) AS cnt FROM investor_installments WHERE approval_status = 'PENDING_APPROVAL'").cnt +
      queryOne(db, "SELECT COUNT(*) AS cnt FROM investor_profits WHERE approval_status = 'PENDING_APPROVAL'").cnt;

    const metrics = {
      pendingApprovals,
      activeInvestors: queryOne(db, "SELECT COUNT(*) AS cnt FROM users u JOIN roles r ON r.id = u.role_id WHERE r.slug = 'investor' AND u.is_active = 1").cnt,
      approvedGreenhouses: queryOne(db, "SELECT COUNT(*) AS cnt FROM greenhouses WHERE approval_status = 'APPROVED'").cnt,
      newLeads: queryOne(db, "SELECT COUNT(*) AS cnt FROM investment_leads WHERE status = 'new'").cnt,
      publishedPages: queryOne(db, 'SELECT COUNT(*) AS cnt FROM pages WHERE is_visible = 1').cnt,
      openTickets: queryOne(db, "SELECT COUNT(*) AS cnt FROM support_tickets WHERE status IN ('open', 'in_progress')").cnt,
      mediaItems: queryOne(db, 'SELECT COUNT(*) AS cnt FROM media_items').cnt,
      unverifiedTranslations: queryOne(db, 'SELECT COUNT(*) AS cnt FROM page_translations WHERE is_verified = 0').cnt
    };
    const recentSecurity = queryAll(db, 'SELECT * FROM security_events ORDER BY id DESC LIMIT 8');
    const recentAudit = queryAll(db, 'SELECT * FROM audit_logs ORDER BY id DESC LIMIT 8');
    return sendHtml(res, 200, renderAdminLayout({
      lang, title: t(lang, 'admin.nav.overview'), activeNav: 'overview', settings, user, csrfToken, flash,
      bodyHtml: renderAdminOverview({ lang, metrics, smtpStatus: getSmtpStatus(), recentSecurity, recentAudit })
    })), true;
  }

  if (pathname === '/admin/approvals') {
    if (!requireStaffPerm(user, 'approvals.view', res, false)) return true;
    const queues = {
      greenhouses: queryAll(db, "SELECT g.*, u.full_name AS investor_name FROM greenhouses g JOIN users u ON u.id = g.investor_user_id WHERE g.approval_status = 'PENDING_APPROVAL' ORDER BY g.id DESC"),
      crops: queryAll(db, "SELECT c.*, g.greenhouse_number, u.full_name AS investor_name FROM crop_updates c JOIN greenhouses g ON g.id = c.greenhouse_id JOIN users u ON u.id = c.investor_user_id WHERE c.approval_status = 'PENDING_APPROVAL' ORDER BY c.id DESC"),
      installments: queryAll(db, "SELECT i.*, ic.contract_number, u.full_name AS investor_name FROM investor_installments i JOIN investor_contracts ic ON ic.id = i.contract_id JOIN users u ON u.id = i.investor_user_id WHERE i.approval_status = 'PENDING_APPROVAL' ORDER BY i.id DESC"),
      profits: queryAll(db, "SELECT p.*, ic.contract_number, u.full_name AS investor_name FROM investor_profits p JOIN investor_contracts ic ON ic.id = p.contract_id JOIN users u ON u.id = p.investor_user_id WHERE p.approval_status = 'PENDING_APPROVAL' ORDER BY p.id DESC")
    };
    return sendHtml(res, 200, renderAdminLayout({
      lang, title: t(lang, 'admin.nav.approvals'), activeNav: 'approvals', settings, user, csrfToken, flash,
      bodyHtml: renderAdminApprovals({ lang, queues, canReview: hasPermission(user, 'approvals.review'), csrfToken })
    })), true;
  }

  if (pathname === '/admin/investors') {
    if (!requireStaffPerm(user, 'investors.view', res, false)) return true;
    const investors = queryAll(db, "SELECT u.id, u.full_name, u.email, u.mobile_number, u.is_active, ip.investor_code, ip.city FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN investor_profiles ip ON ip.user_id = u.id WHERE r.slug = 'investor' ORDER BY u.id DESC");
    const contracts = queryAll(db, 'SELECT ic.*, u.full_name AS investor_name FROM investor_contracts ic JOIN users u ON u.id = ic.investor_user_id ORDER BY ic.id DESC');
    const projects = queryAll(db, 'SELECT id, slug FROM projects ORDER BY id DESC');
    const greenhouses = queryAll(db, 'SELECT g.id, g.greenhouse_number, u.full_name AS investor_name FROM greenhouses g JOIN users u ON u.id = g.investor_user_id ORDER BY g.id DESC');
    return sendHtml(res, 200, renderAdminLayout({
      lang, title: t(lang, 'admin.nav.investors'), activeNav: 'investors', settings, user, csrfToken, flash,
      bodyHtml: renderAdminInvestors({ lang, investors, contracts, projects, greenhouses, canManage: hasPermission(user, 'investors.manage'), csrfToken })
    })), true;
  }

  if (pathname === '/admin/leads') {
    if (!requireStaffPerm(user, 'inquiries.view', res, false)) return true;
    const leads = queryAll(db, 'SELECT * FROM investment_leads ORDER BY id DESC');
    const html = `<section class="card stack"><h2 class="card__title">${escapeHtml(t(lang, 'admin.nav.leads'))}</h2><div class="table-responsive"><table class="table"><thead><tr><th>ID</th><th>Type</th><th>Name</th><th>Phone</th><th>Details</th><th>Status</th><th>Action</th></tr></thead><tbody>${leads.map((l) => `<tr><td>#${l.id}</td><td><span class="badge">${escapeHtml(l.lead_type)}</span></td><td>${escapeHtml(l.full_name)}</td><td>${escapeHtml(l.phone)}</td><td>${escapeHtml(l.greenhouse_count ? `${l.greenhouse_count} units / ${formatNumber(lang, l.estimated_total_egp)} EGP` : `${l.preferred_date || ''} ${l.notes || ''}`)}</td><td><span class="badge badge--info">${escapeHtml(l.status)}</span></td><td><form class="cluster" method="post" action="/api/admin/leads/update"><input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}"><input type="hidden" name="lead_id" value="${l.id}"><select class="form-control" name="status">${['new', 'contacted', 'qualified', 'converted', 'closed'].map((s) => `<option value="${s}"${l.status === s ? ' selected' : ''}>${s}</option>`).join('')}</select><button class="btn btn--secondary btn--sm" type="submit">${escapeHtml(t(lang, 'common.save'))}</button></form></td></tr>`).join('')}</tbody></table></div></section>`;
    return sendHtml(res, 200, renderAdminLayout({ lang, title: t(lang, 'admin.nav.leads'), activeNav: 'leads', settings, user, csrfToken, flash, bodyHtml: html })), true;
  }

  if (pathname === '/admin/support') {
    if (!requireStaffPerm(user, 'support.view', res, false)) return true;
    const tickets = queryAll(db, 'SELECT st.*, u.full_name AS investor_name FROM support_tickets st JOIN users u ON u.id = st.investor_user_id ORDER BY st.updated_at DESC');
    const html = tickets.map((tk) => `
      <article class="card stack">
        <div class="cluster" style="justify-content: space-between;">
          <strong>${escapeHtml(tk.ticket_number)} — ${escapeHtml(tk.subject)} (${escapeHtml(tk.investor_name)})</strong>
          <span class="badge badge--info">${escapeHtml(tk.status)}</span>
        </div>
        <form class="cluster" method="post" action="/api/admin/support/reply">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
          <input type="hidden" name="ticket_id" value="${tk.id}">
          <input class="form-control" name="message" type="text" placeholder="Staff reply..." style="flex: 1;">
          <select class="form-control" name="status" style="inline-size: auto;">${['open', 'in_progress', 'resolved', 'closed'].map((s) => `<option value="${s}"${tk.status === s ? ' selected' : ''}>${s}</option>`).join('')}</select>
          <button class="btn btn--primary btn--sm" type="submit">${escapeHtml(t(lang, 'common.save'))}</button>
        </form>
      </article>`).join('') || `<div class="card"><p>${escapeHtml(t(lang, 'common.noRecords'))}</p></div>`;
    return sendHtml(res, 200, renderAdminLayout({ lang, title: t(lang, 'admin.nav.support'), activeNav: 'support', settings, user, csrfToken, flash, bodyHtml: html })), true;
  }

  if (pathname === '/admin/modules') {
    if (!requireStaffPerm(user, 'modules.manage', res, false)) return true;
    const html = `
    <section class="grid grid--cols-3">
      <div class="card stack">
        <h2 class="card__title">Add Project</h2>
        <form class="form-grid" method="post" action="/api/admin/modules/project">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
          <input class="form-control" name="slug" placeholder="slug" required>
          <input class="form-control" name="title_ar" placeholder="Title AR" required>
          <input class="form-control" name="title_en" placeholder="Title EN" required>
          <input class="form-control" name="location_ar" placeholder="Location AR" required>
          <input class="form-control" name="location_en" placeholder="Location EN" required>
          <textarea class="form-control" name="summary_ar" placeholder="Summary AR" required></textarea>
          <textarea class="form-control" name="summary_en" placeholder="Summary EN" required></textarea>
          <button class="btn btn--primary" type="submit">${escapeHtml(t(lang, 'common.create'))}</button>
        </form>
      </div>
      <div class="card stack">
        <h2 class="card__title">Add News</h2>
        <form class="form-grid" method="post" action="/api/admin/modules/news">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
          <input class="form-control" name="slug" placeholder="slug" required>
          <input class="form-control" name="title_ar" placeholder="Title AR" required>
          <input class="form-control" name="title_en" placeholder="Title EN" required>
          <textarea class="form-control" name="excerpt_ar" placeholder="Excerpt AR" required></textarea>
          <textarea class="form-control" name="excerpt_en" placeholder="Excerpt EN" required></textarea>
          <textarea class="form-control" name="body_ar" placeholder="Body AR" required></textarea>
          <textarea class="form-control" name="body_en" placeholder="Body EN" required></textarea>
          <button class="btn btn--primary" type="submit">${escapeHtml(t(lang, 'common.create'))}</button>
        </form>
      </div>
      <div class="card stack">
        <h2 class="card__title">Add FAQ</h2>
        <form class="form-grid" method="post" action="/api/admin/modules/faq">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
          <input class="form-control" name="question_ar" placeholder="Question AR" required>
          <input class="form-control" name="question_en" placeholder="Question EN" required>
          <textarea class="form-control" name="answer_ar" placeholder="Answer AR" required></textarea>
          <textarea class="form-control" name="answer_en" placeholder="Answer EN" required></textarea>
          <button class="btn btn--primary" type="submit">${escapeHtml(t(lang, 'common.create'))}</button>
        </form>
      </div>
    </section>`;
    return sendHtml(res, 200, renderAdminLayout({ lang, title: t(lang, 'admin.nav.modules'), activeNav: 'modules', settings, user, csrfToken, flash, bodyHtml: html })), true;
  }

  if (pathname === '/admin/content') {
    if (!requireStaffPerm(user, 'content.view', res, false)) return true;
    const rows = queryAll(db, 'SELECT hs.id, hs.section_key, hst.language_code, hst.heading, hst.subheading, hst.cta_label, hst.is_verified FROM homepage_sections hs JOIN homepage_section_translations hst ON hst.section_id = hs.id ORDER BY hs.sort_order, hst.language_code');
    const html = rows.map((r) => `
      <form class="card form-grid" method="post" action="/api/admin/content/update">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <input type="hidden" name="section_id" value="${r.id}">
        <input type="hidden" name="language_code" value="${escapeHtml(r.language_code)}">
        <strong>${escapeHtml(r.section_key)} (${escapeHtml(r.language_code.toUpperCase())})</strong>
        <input class="form-control" name="heading" value="${escapeHtml(r.heading || '')}">
        <textarea class="form-control" name="subheading">${escapeHtml(r.subheading || '')}</textarea>
        <input class="form-control" name="cta_label" value="${escapeHtml(r.cta_label || '')}">
        <label class="cluster"><input type="checkbox" name="is_verified" value="1"${r.is_verified ? ' checked' : ''}><span>Human Verified</span></label>
        <div><button class="btn btn--primary btn--sm" type="submit">${escapeHtml(t(lang, 'common.save'))}</button></div>
      </form>`).join('');
    return sendHtml(res, 200, renderAdminLayout({ lang, title: t(lang, 'admin.nav.content'), activeNav: 'content', settings, user, csrfToken, flash, bodyHtml: html })), true;
  }

  if (pathname === '/admin/pages') {
    if (!requireStaffPerm(user, 'pages.view', res, false)) return true;
    const rows = queryAll(db, 'SELECT p.id, p.page_key, p.is_visible, pt.language_code, pt.title, pt.seo_title, pt.seo_description, pt.content_json, pt.is_verified FROM pages p JOIN page_translations pt ON pt.page_id = p.id ORDER BY p.sort_order, pt.language_code');
    const html = rows.map((r) => {
      let c = {}; try { c = JSON.parse(r.content_json || '{}'); } catch { c = {}; }
      return `<form class="card form-grid" method="post" action="/api/admin/pages/update">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <input type="hidden" name="page_id" value="${r.id}">
        <input type="hidden" name="language_code" value="${escapeHtml(r.language_code)}">
        <strong>/${escapeHtml(r.page_key)} (${escapeHtml(r.language_code.toUpperCase())})</strong>
        <div class="grid grid--cols-2">
          <input class="form-control" name="title" value="${escapeHtml(r.title)}">
          <input class="form-control" name="seo_title" value="${escapeHtml(r.seo_title || '')}">
        </div>
        <input class="form-control" name="seo_description" value="${escapeHtml(r.seo_description || '')}">
        <input class="form-control" name="summary" value="${escapeHtml(c.summary || '')}">
        <textarea class="form-control" name="body">${escapeHtml(c.body || '')}</textarea>
        <div class="cluster">
          <label class="cluster"><input type="checkbox" name="is_visible" value="1"${r.is_visible ? ' checked' : ''}><span>Visible</span></label>
          <label class="cluster"><input type="checkbox" name="is_verified" value="1"${r.is_verified ? ' checked' : ''}><span>Verified</span></label>
          <button class="btn btn--primary btn--sm" type="submit">${escapeHtml(t(lang, 'common.save'))}</button>
        </div>
      </form>`;
    }).join('');
    return sendHtml(res, 200, renderAdminLayout({ lang, title: t(lang, 'admin.nav.pages'), activeNav: 'pages', settings, user, csrfToken, flash, bodyHtml: html })), true;
  }

  if (pathname === '/admin/media') {
    if (!requireStaffPerm(user, 'media.view', res, false)) return true;
    const items = queryAll(db, 'SELECT * FROM media_items ORDER BY id DESC');
    const html = `
    <form class="card form-grid" method="post" action="/api/admin/media/upload?_csrf=${encodeURIComponent(csrfToken)}" enctype="multipart/form-data">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
      <div class="grid grid--cols-3">
        <input class="form-control" type="file" name="file" required>
        <select class="form-control" name="category"><option value="image">image</option><option value="document">document</option><option value="brandIcon">brandIcon</option></select>
        <input class="form-control" type="text" name="folder" value="general">
      </div>
      <div><button class="btn btn--primary" type="submit">Upload Verified Asset</button></div>
    </form>
    <div class="card table-responsive"><table class="table"><thead><tr><th>ID</th><th>Original Name</th><th>MIME</th><th>Size</th><th>SHA-256</th></tr></thead><tbody>${items.map((m) => `<tr><td>#${m.id}</td><td>${escapeHtml(m.original_name)}</td><td>${escapeHtml(m.mime_type)}</td><td>${m.size_bytes} B</td><td><code>${escapeHtml(m.sha256_checksum.slice(0, 12))}</code></td></tr>`).join('')}</tbody></table></div>`;
    return sendHtml(res, 200, renderAdminLayout({ lang, title: t(lang, 'admin.nav.media'), activeNav: 'media', settings, user, csrfToken, flash, bodyHtml: html })), true;
  }

  if (pathname === '/admin/settings') {
    if (!requireStaffPerm(user, 'settings.website.view', res, false)) return true;
    const id = settings.identity;
    const c = settings.calculator;
    const html = `<form class="card form-grid" method="post" action="/api/admin/settings/website">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
      <h2 class="card__title">Site Identity &amp; Calculator Reference Constants</h2>
      <div class="grid grid--cols-2">
        <div class="form-field"><label class="form-label">Site Name (AR)</label><input class="form-control" name="site_name_ar" value="${escapeHtml(id.site_name?.ar || '')}" required></div>
        <div class="form-field"><label class="form-label">Site Name (EN)</label><input class="form-control" name="site_name_en" value="${escapeHtml(id.site_name?.en || '')}" required></div>
        <div class="form-field"><label class="form-label">Tagline (AR)</label><input class="form-control" name="tagline_ar" value="${escapeHtml(id.tagline?.ar || '')}"></div>
        <div class="form-field"><label class="form-label">Tagline (EN)</label><input class="form-control" name="tagline_en" value="${escapeHtml(id.tagline?.en || '')}"></div>
        <div class="form-field"><label class="form-label">Copyright (AR)</label><input class="form-control" name="copyright_ar" value="${escapeHtml(id.copyright_text?.ar || '')}"></div>
        <div class="form-field"><label class="form-label">Copyright (EN)</label><input class="form-control" name="copyright_en" value="${escapeHtml(id.copyright_text?.en || '')}"></div>
      </div>
      <div class="grid grid--cols-4">
        <div class="form-field"><label class="form-label">Greenhouse Area (m²)</label><input class="form-control" name="greenhouse_area_sqm" type="number" value="${escapeHtml(c.greenhouse_area_sqm)}"></div>
        <div class="form-field"><label class="form-label">Unit Price (EGP)</label><input class="form-control" name="greenhouse_price_egp" type="number" value="${escapeHtml(c.greenhouse_price_egp)}"></div>
        <div class="form-field"><label class="form-label">Min Greenhouses</label><input class="form-control" name="min_greenhouses" type="number" value="${escapeHtml(c.min_greenhouses)}"></div>
        <div class="form-field"><label class="form-label">Down Payment (%)</label><input class="form-control" name="down_payment_percent" type="number" value="${escapeHtml(c.down_payment_percent)}"></div>
      </div>
      <div><button class="btn btn--primary" type="submit">${escapeHtml(t(lang, 'common.save'))}</button></div>
    </form>`;
    return sendHtml(res, 200, renderAdminLayout({ lang, title: t(lang, 'admin.nav.settings'), activeNav: 'settings', settings, user, csrfToken, flash, bodyHtml: html })), true;
  }

  if (pathname === '/admin/contact') {
    if (!requireStaffPerm(user, 'settings.contact.view', res, false)) return true;
    const c = settings.contact;
    const html = `<form class="card form-grid" method="post" action="/api/admin/settings/contact">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
      <div class="grid grid--cols-3">
        <div class="form-field"><label class="form-label">WhatsApp Digits</label><input class="form-control" name="whatsapp_number" value="${escapeHtml(c.whatsapp_number || '')}"></div>
        <div class="form-field"><label class="form-label">Mobile Number</label><input class="form-control" name="mobile_number" value="${escapeHtml(c.mobile_number || '')}"></div>
        <div class="form-field"><label class="form-label">Email Address</label><input class="form-control" name="email_address" value="${escapeHtml(c.email_address || '')}"></div>
      </div>
      <div class="grid grid--cols-2">
        <div class="form-field"><label class="form-label">Address (AR)</label><input class="form-control" name="address_ar" value="${escapeHtml(c.physical_address?.ar || '')}"></div>
        <div class="form-field"><label class="form-label">Address (EN)</label><input class="form-control" name="address_en" value="${escapeHtml(c.physical_address?.en || '')}"></div>
        <div class="form-field"><label class="form-label">Hours (AR)</label><input class="form-control" name="hours_ar" value="${escapeHtml(c.working_hours?.ar || '')}"></div>
        <div class="form-field"><label class="form-label">Hours (EN)</label><input class="form-control" name="hours_en" value="${escapeHtml(c.working_hours?.en || '')}"></div>
      </div>
      <label class="cluster"><input type="checkbox" name="show_whatsapp_floating_cta" value="1"${c.show_whatsapp_floating_cta ? ' checked' : ''}><span>Show Floating WhatsApp CTA</span></label>
      <div><button class="btn btn--primary" type="submit">${escapeHtml(t(lang, 'common.save'))}</button></div>
    </form>`;
    return sendHtml(res, 200, renderAdminLayout({ lang, title: t(lang, 'admin.nav.contact'), activeNav: 'contact', settings, user, csrfToken, flash, bodyHtml: html })), true;
  }

  if (pathname === '/admin/seo') {
    if (!requireStaffPerm(user, 'seo.view', res, false)) return true;
    const s = settings.seo;
    const html = `<form class="card form-grid" method="post" action="/api/admin/settings/seo">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
      <div class="form-field"><label class="form-label">Canonical Origin</label><input class="form-control" name="canonical_origin" value="${escapeHtml(s.canonical_origin || '')}"></div>
      <div class="grid grid--cols-2">
        <div class="form-field"><label class="form-label">Default Title (AR)</label><input class="form-control" name="title_ar" value="${escapeHtml(s.default_title?.ar || '')}"></div>
        <div class="form-field"><label class="form-label">Default Title (EN)</label><input class="form-control" name="title_en" value="${escapeHtml(s.default_title?.en || '')}"></div>
        <div class="form-field"><label class="form-label">Default Desc (AR)</label><textarea class="form-control" name="desc_ar">${escapeHtml(s.default_description?.ar || '')}</textarea></div>
        <div class="form-field"><label class="form-label">Default Desc (EN)</label><textarea class="form-control" name="desc_en">${escapeHtml(s.default_description?.en || '')}</textarea></div>
      </div>
      <label class="cluster"><input type="checkbox" name="robots_allow_indexing" value="1"${s.robots_allow_indexing !== false ? ' checked' : ''}><span>Allow Search Engine Indexing</span></label>
      <div><button class="btn btn--primary" type="submit">${escapeHtml(t(lang, 'common.save'))}</button></div>
    </form>`;
    return sendHtml(res, 200, renderAdminLayout({ lang, title: t(lang, 'admin.nav.seo'), activeNav: 'seo', settings, user, csrfToken, flash, bodyHtml: html })), true;
  }

  if (pathname === '/admin/translations') {
    if (!requireStaffPerm(user, 'translations.view', res, false)) return true;
    const stats = queryAll(db, 'SELECT language_code, COUNT(*) AS total, SUM(CASE WHEN is_verified = 1 THEN 1 ELSE 0 END) AS verified FROM page_translations GROUP BY language_code');
    const html = `<section class="card stack"><h2 class="card__title">Active Languages Translation Status (AR &amp; EN Only)</h2><div class="table-responsive"><table class="table"><thead><tr><th>Language</th><th>Direction</th><th>Pages Total</th><th>Human Verified</th></tr></thead><tbody>${stats.map((s) => `<tr><td>${escapeHtml(s.language_code.toUpperCase())}</td><td>${s.language_code === 'ar' ? 'RTL' : 'LTR'}</td><td>${s.total}</td><td>${s.verified}</td></tr>`).join('')}</tbody></table></div></section>`;
    return sendHtml(res, 200, renderAdminLayout({ lang, title: t(lang, 'admin.nav.translations'), activeNav: 'translations', settings, user, csrfToken, flash, bodyHtml: html })), true;
  }

  if (pathname === '/admin/users') {
    if (!requireStaffPerm(user, 'users.view', res, false)) return true;
    const users = queryAll(db, 'SELECT u.id, u.full_name, u.email, u.is_active, r.slug AS role_slug FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.id DESC');
    const roles = queryAll(db, "SELECT slug, name FROM roles WHERE slug != 'investor'");
    const html = `
    <form class="card form-grid" method="post" action="/api/admin/users/create">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
      <h2 class="card__title">Create Staff User</h2>
      <div class="grid grid--cols-4">
        <input class="form-control" name="full_name" placeholder="Full Name" required>
        <input class="form-control" name="email" type="email" placeholder="Email" required>
        <select class="form-control" name="role_slug">${roles.filter((r) => user.role === 'super_admin' || r.slug !== 'super_admin').map((r) => `<option value="${escapeHtml(r.slug)}">${escapeHtml(r.name)}</option>`).join('')}</select>
        <input class="form-control" name="password" type="password" placeholder="Strong Password" required minlength="10">
      </div>
      <div><button class="btn btn--primary btn--sm" type="submit">${escapeHtml(t(lang, 'common.create'))}</button></div>
    </form>
    <div class="card table-responsive"><table class="table"><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>${users.map((u) => `<tr><td>#${u.id}</td><td>${escapeHtml(u.full_name)}</td><td>${escapeHtml(u.email)}</td><td><span class="badge">${escapeHtml(u.role_slug)}</span></td><td>${u.is_active ? 'Active' : 'Disabled'}</td><td><form method="post" action="/api/admin/users/toggle"><input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}"><input type="hidden" name="user_id" value="${u.id}"><button class="btn btn--secondary btn--sm" type="submit">Toggle Active</button></form></td></tr>`).join('')}</tbody></table></div>`;
    return sendHtml(res, 200, renderAdminLayout({ lang, title: t(lang, 'admin.nav.users'), activeNav: 'users', settings, user, csrfToken, flash, bodyHtml: html })), true;
  }

  if (pathname === '/admin/roles') {
    if (!requireStaffPerm(user, 'roles.view', res, false)) return true;
    const roles = queryAll(db, 'SELECT * FROM roles');
    const html = `<div class="card stack">${roles.map((r) => {
      const perms = queryAll(db, 'SELECT permission_key FROM role_permissions WHERE role_id = ?', r.id).map((p) => p.permission_key);
      return `<div><strong>${escapeHtml(r.name)} (<code>${escapeHtml(r.slug)}</code>)</strong><p class="form-hint">${escapeHtml(perms.join(', '))}</p></div>`;
    }).join('')}</div>`;
    return sendHtml(res, 200, renderAdminLayout({ lang, title: t(lang, 'admin.nav.roles'), activeNav: 'roles', settings, user, csrfToken, flash, bodyHtml: html })), true;
  }

  if (pathname === '/admin/audit') {
    if (!requireStaffPerm(user, 'audit.logs.view', res, false)) return true;
    const logs = queryAll(db, 'SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100');
    const html = `<div class="card table-responsive"><table class="table"><thead><tr><th>ID</th><th>Actor</th><th>Role</th><th>Action</th><th>Entity</th><th>Source</th><th>IP</th><th>Time</th></tr></thead><tbody>${logs.map((l) => `<tr><td>#${l.id}</td><td>${l.actor_user_id || '—'}</td><td>${escapeHtml(l.actor_role || '—')}</td><td>${escapeHtml(l.action)}</td><td>${escapeHtml(l.entity_type)} #${escapeHtml(l.entity_id || '')}</td><td>${escapeHtml(l.source)}</td><td>${escapeHtml(l.ip_address || '')}</td><td>${escapeHtml(l.created_at)}</td></tr>`).join('')}</tbody></table></div>`;
    return sendHtml(res, 200, renderAdminLayout({ lang, title: t(lang, 'admin.nav.audit'), activeNav: 'audit', settings, user, csrfToken, flash, bodyHtml: html })), true;
  }

  if (pathname === '/admin/erp') {
    if (!requireStaffPerm(user, 'erp.logs.view', res, false)) return true;
    const logs = queryAll(db, 'SELECT * FROM erp_sync_logs ORDER BY id DESC LIMIT 50');
    const html = `<div class="card table-responsive"><table class="table"><thead><tr><th>ID</th><th>Endpoint</th><th>Batch</th><th>Received</th><th>Queued</th><th>Status</th><th>Time</th></tr></thead><tbody>${logs.map((l) => `<tr><td>#${l.id}</td><td><code>${escapeHtml(l.endpoint)}</code></td><td>${escapeHtml(l.external_batch_id || '')}</td><td>${l.records_received}</td><td>${l.records_queued_pending}</td><td><span class="badge">${escapeHtml(l.status)}</span></td><td>${escapeHtml(l.created_at)}</td></tr>`).join('')}</tbody></table></div>`;
    return sendHtml(res, 200, renderAdminLayout({ lang, title: t(lang, 'admin.nav.erp'), activeNav: 'erp', settings, user, csrfToken, flash, bodyHtml: html })), true;
  }

  if (pathname === '/admin/account') {
    if (!requireStaffPerm(user, 'account.self.manage', res, false)) return true;
    const sessions = queryAll(db, "SELECT id, ip_address, user_agent, last_seen_at, expires_at FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > datetime('now')", user.id);
    const html = `
    <div class="alert alert--info">${escapeHtml(lang === 'ar' ? 'إعدادات حسابك الشخصي منفصلة تماماً عن إعدادات الموقع العامة.' : 'Personal Account Settings are strictly separate from Website Settings.')}</div>
    <form class="card form-grid" method="post" action="/api/admin/account/profile">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
      <div class="grid grid--cols-3">
        <input class="form-control" name="full_name" value="${escapeHtml(user.fullName)}" required>
        <input class="form-control" name="mobile_number" value="${escapeHtml(user.mobileNumber || '')}">
        <select class="form-control" name="preferred_language"><option value="ar"${user.preferredLanguage === 'ar' ? ' selected' : ''}>العربية</option><option value="en"${user.preferredLanguage === 'en' ? ' selected' : ''}>English</option></select>
      </div>
      <div><button class="btn btn--primary btn--sm" type="submit">${escapeHtml(t(lang, 'common.save'))}</button></div>
    </form>
    <form class="card form-grid" method="post" action="/api/admin/account/password">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
      <div class="grid grid--cols-3">
        <input class="form-control" name="current_password" type="password" placeholder="Current Password" required>
        <input class="form-control" name="new_password" type="password" placeholder="New Password" required minlength="10">
        <input class="form-control" name="confirm_password" type="password" placeholder="Confirm Password" required minlength="10">
      </div>
      <div><button class="btn btn--secondary btn--sm" type="submit">Change Password</button></div>
    </form>
    <section class="card stack">
      <div class="cluster" style="justify-content: space-between;">
        <h2 class="card__title">Active Sessions</h2>
        <form method="post" action="/api/admin/account/revoke-sessions"><input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}"><button class="btn btn--danger btn--sm" type="submit">Revoke Other Sessions</button></form>
      </div>
      <div class="table-responsive"><table class="table"><thead><tr><th>Session</th><th>IP</th><th>Last Seen</th><th>Expires</th></tr></thead><tbody>${sessions.map((s) => `<tr><td><code>${escapeHtml(s.id.slice(0, 12))}...</code> ${s.id === user.sessionId ? '(Current)' : ''}</td><td>${escapeHtml(s.ip_address || '')}</td><td>${escapeHtml(s.last_seen_at)}</td><td>${escapeHtml(s.expires_at)}</td></tr>`).join('')}</tbody></table></div>
    </section>`;
    return sendHtml(res, 200, renderAdminLayout({ lang, title: t(lang, 'admin.nav.account'), activeNav: 'account', settings, user, csrfToken, flash, bodyHtml: html })), true;
  }

  return false;
}
