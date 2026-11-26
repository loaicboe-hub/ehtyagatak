import { escapeHtml, sanitizeSafeUrl } from '../../foundation/security/input-sanitizer.mjs';
import { formatNumber, getProjectDirection, t } from '../i18n/index.mjs';
import { getLocalizedField } from '../services/settings.mjs';
import { hasPermission } from '../security/auth.mjs';

export function renderAdminLayout({ lang, title, activeNav, settings, user, csrfToken, flash = null, bodyHtml }) {
  const dir = getProjectDirection(lang);
  const siteName = getLocalizedField(settings.identity.site_name, lang, t(lang, 'brand.name'));
  const switchLang = lang === 'ar' ? 'en' : 'ar';

  const items = [
    { id: 'overview', href: '/admin', label: t(lang, 'admin.nav.overview'), perm: 'dashboard.overview.view' },
    { id: 'approvals', href: '/admin/approvals', label: t(lang, 'admin.nav.approvals'), perm: 'approvals.view' },
    { id: 'investors', href: '/admin/investors', label: t(lang, 'admin.nav.investors'), perm: 'investors.view' },
    { id: 'leads', href: '/admin/leads', label: t(lang, 'admin.nav.leads'), perm: 'inquiries.view' },
    { id: 'support', href: '/admin/support', label: t(lang, 'admin.nav.support'), perm: 'support.view' },
    { id: 'modules', href: '/admin/modules', label: t(lang, 'admin.nav.modules'), perm: 'modules.manage' },
    { id: 'content', href: '/admin/content', label: t(lang, 'admin.nav.content'), perm: 'content.view' },
    { id: 'pages', href: '/admin/pages', label: t(lang, 'admin.nav.pages'), perm: 'pages.view' },
    { id: 'media', href: '/admin/media', label: t(lang, 'admin.nav.media'), perm: 'media.view' },
    { id: 'settings', href: '/admin/settings', label: t(lang, 'admin.nav.settings'), perm: 'settings.website.view' },
    { id: 'contact', href: '/admin/contact', label: t(lang, 'admin.nav.contact'), perm: 'settings.contact.view' },
    { id: 'seo', href: '/admin/seo', label: t(lang, 'admin.nav.seo'), perm: 'seo.view' },
    { id: 'translations', href: '/admin/translations', label: t(lang, 'admin.nav.translations'), perm: 'translations.view' },
    { id: 'users', href: '/admin/users', label: t(lang, 'admin.nav.users'), perm: 'users.view' },
    { id: 'roles', href: '/admin/roles', label: t(lang, 'admin.nav.roles'), perm: 'roles.view' },
    { id: 'audit', href: '/admin/audit', label: t(lang, 'admin.nav.audit'), perm: 'audit.logs.view' },
    { id: 'erp', href: '/admin/erp', label: t(lang, 'admin.nav.erp'), perm: 'erp.logs.view' },
    { id: 'account', href: '/admin/account', label: t(lang, 'admin.nav.account'), perm: 'account.self.manage' }
  ];

  const navHtml = items
    .filter((it) => hasPermission(user, it.perm))
    .map((it) => `<a class="admin-nav-link" href="${it.href}"${activeNav === it.id ? ' aria-current="page"' : ''}>${escapeHtml(it.label)}</a>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — ${escapeHtml(t(lang, 'admin.title'))}</title>
  <link rel="icon" type="image/png" href="${escapeHtml(sanitizeSafeUrl(settings.identity.favicon_url || '/assets/favicon.png'))}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/foundation/design-system/tokens.css">
  <link rel="stylesheet" href="/foundation/design-system/base.css">
  <link rel="stylesheet" href="/foundation/design-system/components.css">
  <link rel="stylesheet" href="/css/theme.css">
</head>
<body>
  <div class="admin-layout">
    <div class="drawer-backdrop" data-admin-backdrop hidden></div>
    <aside id="admin-sidebar" class="admin-sidebar" aria-label="Admin Navigation" data-open="false">
      <div class="admin-sidebar__brand cluster" style="justify-content: space-between;">
        <span>${escapeHtml(t(lang, 'admin.title'))}</span>
        <button type="button" class="btn btn--ghost btn--sm admin-sidebar-toggle" data-admin-sidebar-close style="color: #fff;">&times;</button>
      </div>
      <span class="admin-sidebar__section-label">${escapeHtml(siteName)}</span>
      ${navHtml}
      <div style="margin-block-start: auto; padding-block-start: var(--space-4);">
        <a class="admin-nav-link" href="/${escapeHtml(lang)}">&larr; ${escapeHtml(t(lang, 'common.backToHome'))}</a>
        <form method="post" action="/api/auth/logout">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
          <button type="submit" class="admin-nav-link">${escapeHtml(t(lang, 'nav.logout'))}</button>
        </form>
      </div>
    </aside>

    <div class="admin-main">
      <header class="admin-topbar">
        <div class="cluster">
          <button type="button" class="btn btn--secondary btn--sm admin-sidebar-toggle" data-admin-sidebar-open aria-controls="admin-sidebar" aria-expanded="false">
            ${escapeHtml(t(lang, 'common.menu'))}
          </button>
          <strong>${escapeHtml(title)}</strong>
        </div>
        <div class="cluster">
          <span class="badge badge--info">${escapeHtml(user.fullName)} (${escapeHtml(user.role)})</span>
          <a class="btn btn--ghost btn--sm" href="${escapeHtml(activeNav === 'overview' ? '/admin' : `/admin/${activeNav}`)}?lang=${escapeHtml(switchLang)}">${escapeHtml(t(lang, 'common.switchLanguage'))}</a>
        </div>
      </header>
      <main class="admin-content stack">
        ${flash ? `<div class="alert alert--${escapeHtml(flash.type)}" role="status">${escapeHtml(flash.message)}</div>` : ''}
        ${bodyHtml}
      </main>
    </div>
  </div>
  <script type="module" src="/js/app.js"></script>
</body>
</html>`;
}

export function renderAdminOverview({ lang, metrics, smtpStatus, recentSecurity, recentAudit }) {
  return `
  ${!smtpStatus.configured ? `<div class="alert alert--warning">${escapeHtml(lang === 'ar' ? 'تنبيه: خدمة البريد SMTP غير مهيأة في ملف .env، لذا لن تُرسل رسائل استعادة كلمة المرور حتى تهيئتها.' : `SMTP Notice: ${smtpStatus.reason}`)}</div>` : ''}
  <section class="grid grid--cols-4">
    <article class="card kpi-card">
      <div class="card__subtitle">${escapeHtml(lang === 'ar' ? 'بانتظار الاعتماد' : 'Pending Approvals')}</div>
      <div class="metric-value">${escapeHtml(formatNumber(lang, metrics.pendingApprovals))}</div>
    </article>
    <article class="card kpi-card">
      <div class="card__subtitle">${escapeHtml(lang === 'ar' ? 'المستثمرون النشطون' : 'Active Investors')}</div>
      <div class="metric-value">${escapeHtml(formatNumber(lang, metrics.activeInvestors))}</div>
    </article>
    <article class="card kpi-card">
      <div class="card__subtitle">${escapeHtml(lang === 'ar' ? 'الصوب المعتمدة' : 'Approved Greenhouses')}</div>
      <div class="metric-value">${escapeHtml(formatNumber(lang, metrics.approvedGreenhouses))}</div>
    </article>
    <article class="card kpi-card kpi-card--gold">
      <div class="card__subtitle">${escapeHtml(lang === 'ar' ? 'طلبات ومواعيد جديدة' : 'New Leads')}</div>
      <div class="metric-value">${escapeHtml(formatNumber(lang, metrics.newLeads))}</div>
    </article>
    <article class="card kpi-card">
      <div class="card__subtitle">${escapeHtml(lang === 'ar' ? 'الصفحات المنشورة' : 'Published Pages')}</div>
      <div class="metric-value">${escapeHtml(formatNumber(lang, metrics.publishedPages))}</div>
    </article>
    <article class="card kpi-card">
      <div class="card__subtitle">${escapeHtml(lang === 'ar' ? 'تذاكر الدعم المفتوحة' : 'Open Support Tickets')}</div>
      <div class="metric-value">${escapeHtml(formatNumber(lang, metrics.openTickets))}</div>
    </article>
    <article class="card kpi-card">
      <div class="card__subtitle">${escapeHtml(lang === 'ar' ? 'ملفات الوسائط' : 'Media Items')}</div>
      <div class="metric-value">${escapeHtml(formatNumber(lang, metrics.mediaItems))}</div>
    </article>
    <article class="card kpi-card">
      <div class="card__subtitle">${escapeHtml(lang === 'ar' ? 'ترجمات غير موثقة' : 'Unverified Translations')}</div>
      <div class="metric-value">${escapeHtml(formatNumber(lang, metrics.unverifiedTranslations))}</div>
    </article>
  </section>

  <section class="grid grid--cols-2">
    <div class="card stack">
      <h2 class="card__title">${escapeHtml(lang === 'ar' ? 'أحدث أحداث الأمان' : 'Recent Security Events')}</h2>
      <div class="table-responsive">
        <table class="table">
          <thead><tr><th>Event</th><th>IP</th><th>Time</th></tr></thead>
          <tbody>
            ${recentSecurity.map((e) => `<tr><td>${escapeHtml(e.event_type)}</td><td>${escapeHtml(e.ip_address || '')}</td><td>${escapeHtml(e.created_at)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div class="card stack">
      <h2 class="card__title">${escapeHtml(lang === 'ar' ? 'أحدث سجلات التدقيق' : 'Recent Audit Trail')}</h2>
      <div class="table-responsive">
        <table class="table">
          <thead><tr><th>Action</th><th>Entity</th><th>Source</th><th>Time</th></tr></thead>
          <tbody>
            ${recentAudit.map((a) => `<tr><td>${escapeHtml(a.action)}</td><td>${escapeHtml(a.entity_type)} #${escapeHtml(a.entity_id || '')}</td><td>${escapeHtml(a.source)}</td><td>${escapeHtml(a.created_at)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </section>`;
}

export function renderAdminApprovals({ lang, queues, canReview, csrfToken }) {
  const renderSection = (title, entityType, rows, colsFn) => `
    <section class="card stack">
      <h2 class="card__title">${escapeHtml(title)} (${rows.length})</h2>
      <div class="table-responsive">
        <table class="table">
          <thead><tr><th>ID</th><th>${escapeHtml(lang === 'ar' ? 'المستثمر' : 'Investor')}</th><th>${escapeHtml(lang === 'ar' ? 'التفاصيل' : 'Details')}</th><th>${escapeHtml(lang === 'ar' ? 'المصدر' : 'Source')}</th><th>${escapeHtml(lang === 'ar' ? 'الإجراء' : 'Action')}</th></tr></thead>
          <tbody>
            ${rows.length === 0 ? `<tr><td colspan="5">${escapeHtml(t(lang, 'common.noRecords'))}</td></tr>` : rows.map((r) => `
              <tr>
                <td>#${r.id}</td>
                <td>${escapeHtml(r.investor_name)}</td>
                <td>${colsFn(r)}</td>
                <td><span class="badge">${escapeHtml(r.source || (r.external_erp_id ? 'erp' : 'admin'))}</span></td>
                <td>
                  ${canReview ? `
                  <div class="cluster">
                    <form method="post" action="/api/admin/approvals/review">
                      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                      <input type="hidden" name="entity_type" value="${escapeHtml(entityType)}">
                      <input type="hidden" name="entity_id" value="${r.id}">
                      <input type="hidden" name="decision" value="APPROVED">
                      <button class="btn btn--primary btn--sm" type="submit">${escapeHtml(t(lang, 'common.approve'))}</button>
                    </form>
                    <form method="post" action="/api/admin/approvals/review">
                      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                      <input type="hidden" name="entity_type" value="${escapeHtml(entityType)}">
                      <input type="hidden" name="entity_id" value="${r.id}">
                      <input type="hidden" name="decision" value="REJECTED">
                      <button class="btn btn--danger btn--sm" type="submit">${escapeHtml(t(lang, 'common.reject'))}</button>
                    </form>
                  </div>` : '—'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>`;

  return `
    ${renderSection(lang === 'ar' ? 'الصوب الزراعية المعلقة' : 'Pending Greenhouses', 'greenhouse', queues.greenhouses, (r) => `${escapeHtml(r.greenhouse_number)} — ${escapeHtml(r.location_label)} (${escapeHtml(r.operational_status)})`)}
    ${renderSection(lang === 'ar' ? 'تحديثات المحاصيل والإنتاج المعلقة' : 'Pending Crop Updates', 'crop_update', queues.crops, (r) => `${escapeHtml(r.greenhouse_number)} — ${escapeHtml(lang === 'ar' ? r.crop_name_ar : r.crop_name_en)} (${escapeHtml(formatNumber(lang, r.yield_kg))} kg)`)}
    ${renderSection(lang === 'ar' ? 'الأقساط والمدفوعات المعلقة' : 'Pending Installments', 'installment', queues.installments, (r) => `${escapeHtml(r.contract_number)} #${r.installment_number} — ${escapeHtml(formatNumber(lang, r.paid_amount_egp))}/${escapeHtml(formatNumber(lang, r.amount_egp))} EGP (${escapeHtml(r.payment_status)})`)}
    ${renderSection(lang === 'ar' ? 'توزيعات الأرباح المعلقة' : 'Pending Profit Distributions', 'profit', queues.profits, (r) => `${escapeHtml(r.contract_number)} — ${escapeHtml(r.period_label)}: ${escapeHtml(formatNumber(lang, r.net_profit_egp))} EGP`)}
  `;
}

export function renderAdminInvestors({ lang, investors, contracts, projects, greenhouses, canManage, csrfToken }) {
  const invOptions = investors.map((u) => `<option value="${u.id}">${escapeHtml(u.full_name)} (${escapeHtml(u.investor_code)})</option>`).join('');
  const projOptions = projects.map((p) => `<option value="${p.id}">${escapeHtml(p.slug)}</option>`).join('');
  const contractOptions = contracts.map((c) => `<option value="${c.id}">${escapeHtml(c.contract_number)} — ${escapeHtml(c.investor_name)}</option>`).join('');
  const ghOptions = greenhouses.map((g) => `<option value="${g.id}">${escapeHtml(g.greenhouse_number)} — ${escapeHtml(g.investor_name)}</option>`).join('');

  return `
  ${canManage ? `
  <section class="grid grid--cols-2">
    <div class="card stack">
      <h2 class="card__title">${escapeHtml(lang === 'ar' ? 'إنشاء حساب مستثمر جديد' : 'Create Investor Account')}</h2>
      <form class="form-grid" method="post" action="/api/admin/investors/create">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <input class="form-control" name="full_name" type="text" placeholder="${escapeHtml(t(lang, 'forms.fullName'))}" required>
        <input class="form-control" name="email" type="email" placeholder="${escapeHtml(t(lang, 'forms.email'))}" required>
        <input class="form-control" name="mobile_number" type="tel" placeholder="${escapeHtml(t(lang, 'forms.phone'))}" required>
        <input class="form-control" name="investor_code" type="text" placeholder="${escapeHtml(lang === 'ar' ? 'رمز المستثمر (مثال: INV-1001)' : 'Investor Code (e.g. INV-1001)')}" required>
        <input class="form-control" name="city" type="text" placeholder="${escapeHtml(lang === 'ar' ? 'المدينة' : 'City')}">
        <input class="form-control" name="password" type="password" placeholder="${escapeHtml(lang === 'ar' ? 'كلمة مرور قوية (10 أحرف فأكثر)' : 'Strong Password (10+ chars, upper/lower/num)')}" required minlength="10">
        <button class="btn btn--primary" type="submit">${escapeHtml(t(lang, 'common.create'))}</button>
      </form>
    </div>

    <div class="card stack">
      <h2 class="card__title">${escapeHtml(lang === 'ar' ? 'إنشاء عقد استثمار' : 'Create Investor Contract')}</h2>
      <form class="form-grid" method="post" action="/api/admin/contracts/create">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <select class="form-control" name="investor_user_id" required>${invOptions}</select>
        <select class="form-control" name="project_id">${projOptions}</select>
        <input class="form-control" name="contract_number" type="text" placeholder="CNT-2026-001" required>
        <div class="grid grid--cols-3">
          <input class="form-control" name="greenhouse_count" type="number" min="1" value="3" required>
          <input class="form-control" name="total_amount_egp" type="number" step="0.01" placeholder="Total EGP" required>
          <input class="form-control" name="down_payment_egp" type="number" step="0.01" placeholder="Down EGP" required>
        </div>
        <input class="form-control" name="start_date" type="date" required>
        <button class="btn btn--primary" type="submit">${escapeHtml(t(lang, 'common.create'))}</button>
      </form>
    </div>

    <div class="card stack">
      <h2 class="card__title">${escapeHtml(lang === 'ar' ? 'تخصيص صوبة (تُرفع للاعتماد)' : 'Allocate Greenhouse (Queued for Approval)')}</h2>
      <form class="form-grid" method="post" action="/api/admin/greenhouses/create">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <select class="form-control" name="contract_id" required>${contractOptions}</select>
        <input class="form-control" name="greenhouse_number" type="text" placeholder="GH-A101" required>
        <input class="form-control" name="location_label" type="text" placeholder="${escapeHtml(lang === 'ar' ? 'قطاع الواحة - صف 2' : 'Sector A - Row 2')}" required>
        <div class="grid grid--cols-2">
          <input class="form-control" name="current_crop_ar" type="text" placeholder="المحصول (عربي)">
          <input class="form-control" name="current_crop_en" type="text" placeholder="Crop (English)">
        </div>
        <select class="form-control" name="operational_status">
          <option value="preparing">preparing</option>
          <option value="planted">planted</option>
          <option value="harvesting">harvesting</option>
          <option value="maintenance">maintenance</option>
        </select>
        <button class="btn btn--secondary" type="submit">${escapeHtml(t(lang, 'common.create'))}</button>
      </form>
    </div>

    <div class="card stack">
      <h2 class="card__title">${escapeHtml(lang === 'ar' ? 'إضافة تحديث محصول / قسط / ربح (للاعتماد)' : 'Record Crop / Installment / Profit (Pending Approval)')}</h2>
      <form class="form-grid" method="post" action="/api/admin/crops/create">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <select class="form-control" name="greenhouse_id" required>${ghOptions}</select>
        <input class="form-control" name="season_name" type="text" placeholder="2026-Autumn" required>
        <div class="grid grid--cols-2">
          <input class="form-control" name="crop_name_ar" type="text" placeholder="اسم المحصول عربي" required>
          <input class="form-control" name="crop_name_en" type="text" placeholder="Crop Name EN" required>
        </div>
        <div class="grid grid--cols-3">
          <input class="form-control" name="yield_kg" type="number" step="0.1" placeholder="Yield kg" required>
          <input class="form-control" name="sales_revenue_egp" type="number" step="0.01" placeholder="Sales EGP" required>
          <input class="form-control" name="recorded_date" type="date" required>
        </div>
        <button class="btn btn--secondary" type="submit">${escapeHtml(lang === 'ar' ? 'تسجيل تحديث محصول' : 'Record Crop Update')}</button>
      </form>
      <hr>
      <form class="form-grid" method="post" action="/api/admin/installments/create">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <select class="form-control" name="contract_id" required>${contractOptions}</select>
        <div class="grid grid--cols-3">
          <input class="form-control" name="installment_number" type="number" min="1" placeholder="#" required>
          <input class="form-control" name="amount_egp" type="number" step="0.01" placeholder="Amount" required>
          <input class="form-control" name="paid_amount_egp" type="number" step="0.01" placeholder="Paid" value="0">
        </div>
        <div class="grid grid--cols-2">
          <input class="form-control" name="due_date" type="date" required>
          <select class="form-control" name="payment_status"><option value="pending">pending</option><option value="paid">paid</option><option value="partial">partial</option><option value="overdue">overdue</option></select>
        </div>
        <button class="btn btn--secondary" type="submit">${escapeHtml(lang === 'ar' ? 'تسجيل قسط' : 'Record Installment')}</button>
      </form>
      <hr>
      <form class="form-grid" method="post" action="/api/admin/profits/create">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <select class="form-control" name="contract_id" required>${contractOptions}</select>
        <input class="form-control" name="period_label" type="text" placeholder="Q4 2026" required>
        <div class="grid grid--cols-3">
          <input class="form-control" name="gross_revenue_egp" type="number" step="0.01" placeholder="Gross" required>
          <input class="form-control" name="operating_costs_egp" type="number" step="0.01" placeholder="Costs" required>
          <input class="form-control" name="net_profit_egp" type="number" step="0.01" placeholder="Net Profit" required>
        </div>
        <div class="grid grid--cols-2">
          <input class="form-control" name="distribution_date" type="date" required>
          <select class="form-control" name="payout_status"><option value="scheduled">scheduled</option><option value="distributed">distributed</option></select>
        </div>
        <button class="btn btn--secondary" type="submit">${escapeHtml(lang === 'ar' ? 'تسجيل توزيع أرباح' : 'Record Profit Distribution')}</button>
      </form>
    </div>
  </section>` : ''}

  <section class="card stack">
    <h2 class="card__title">${escapeHtml(lang === 'ar' ? 'قائمة المستثمرين' : 'Registered Investors')}</h2>
    <div class="table-responsive">
      <table class="table">
        <thead><tr><th>Code</th><th>Name</th><th>Email</th><th>Mobile</th><th>City</th><th>Status</th></tr></thead>
        <tbody>
          ${investors.map((i) => `<tr><td><strong>${escapeHtml(i.investor_code)}</strong></td><td>${escapeHtml(i.full_name)}</td><td>${escapeHtml(i.email)}</td><td>${escapeHtml(i.mobile_number || '')}</td><td>${escapeHtml(i.city || '')}</td><td><span class="badge ${i.is_active ? 'badge--success' : 'badge--danger'}">${i.is_active ? 'Active' : 'Inactive'}</span></td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  </section>`;
}
