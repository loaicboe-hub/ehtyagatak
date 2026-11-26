import { escapeHtml, sanitizeSafeUrl } from '../../foundation/security/input-sanitizer.mjs';
import { formatNumber, getProjectDirection, t } from '../i18n/index.mjs';
import { getLocalizedField } from '../services/settings.mjs';
import { renderSplashScreen } from './splash.mjs';

export function renderPortalLayout({ lang, title, activeNav, settings, user, csrfToken, flash = null, bodyHtml }) {
  const dir = getProjectDirection(lang);
  const siteName = getLocalizedField(settings.identity.site_name, lang, t(lang, 'brand.name'));
  const switchLang = lang === 'ar' ? 'en' : 'ar';

  const navLinks = [
    { id: 'overview', href: '/portal', label: t(lang, 'portal.nav.overview') },
    { id: 'investments', href: '/portal/investments', label: t(lang, 'portal.nav.investments') },
    { id: 'greenhouses', href: '/portal/greenhouses', label: t(lang, 'portal.nav.greenhouses') },
    { id: 'crops', href: '/portal/crops', label: t(lang, 'portal.nav.crops') },
    { id: 'profits', href: '/portal/profits', label: t(lang, 'portal.nav.profits') },
    { id: 'installments', href: '/portal/installments', label: t(lang, 'portal.nav.installments') },
    { id: 'documents', href: '/portal/documents', label: t(lang, 'portal.nav.documents') },
    { id: 'statement', href: '/portal/statement', label: t(lang, 'portal.nav.statement') },
    { id: 'notifications', href: '/portal/notifications', label: t(lang, 'portal.nav.notifications') },
    { id: 'support', href: '/portal/support', label: t(lang, 'portal.nav.support') },
    { id: 'profile', href: '/portal/profile', label: t(lang, 'portal.nav.profile') }
  ];

  const navHtml = navLinks
    .map((n) => `<a class="admin-nav-link" href="${n.href}"${activeNav === n.id ? ' aria-current="page"' : ''}>${escapeHtml(n.label)}</a>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — ${escapeHtml(t(lang, 'portal.title'))}</title>
  <link rel="icon" type="image/png" href="${escapeHtml(sanitizeSafeUrl(settings.identity.favicon_url || '/assets/favicon.png'))}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/foundation/design-system/tokens.css">
  <link rel="stylesheet" href="/foundation/design-system/base.css">
  <link rel="stylesheet" href="/foundation/design-system/components.css">
  <link rel="stylesheet" href="/css/theme.css">
  <script src="/js/splash-init.js"></script>
</head>
<body>
  ${renderSplashScreen({ lang })}
  <div class="admin-layout">
    <div class="drawer-backdrop" data-admin-backdrop hidden></div>
    <aside id="admin-sidebar" class="admin-sidebar" aria-label="Investor Portal Navigation" data-open="false">
      <div class="admin-sidebar__brand cluster" style="justify-content: space-between;">
        <span>${escapeHtml(t(lang, 'portal.title'))}</span>
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
          <span class="badge badge--success">${escapeHtml(user.fullName)}</span>
          <a class="btn btn--ghost btn--sm" href="${escapeHtml(activeNav === 'overview' ? '/portal' : `/portal/${activeNav}`)}?lang=${escapeHtml(switchLang)}">${escapeHtml(t(lang, 'common.switchLanguage'))}</a>
        </div>
      </header>

      <main class="admin-content stack">
        <div class="alert alert--info no-print">${escapeHtml(t(lang, 'portal.isolationNotice'))}</div>
        ${flash ? `<div class="alert alert--${escapeHtml(flash.type)}" role="status">${escapeHtml(flash.message)}</div>` : ''}
        ${bodyHtml}
      </main>
    </div>
  </div>
  <script type="module" src="/js/app.js"></script>
</body>
</html>`;
}

export function renderPortalOverview({ lang, user, profile, metrics, notifications }) {
  return `
  <section class="card stack">
    <div class="cluster" style="justify-content: space-between;">
      <div>
        <h1 style="font-size: var(--text-2xl); margin: 0;">${escapeHtml(t(lang, 'portal.welcome', { name: user.fullName }))}</h1>
        <p class="card__subtitle">${escapeHtml(lang === 'ar' ? 'رمز المستثمر:' : 'Investor Code:')} <strong>${escapeHtml(profile?.investor_code || '—')}</strong></p>
      </div>
      <a class="btn btn--primary btn--sm" href="/portal/statement">${escapeHtml(t(lang, 'portal.nav.statement'))}</a>
    </div>
  </section>

  <section class="grid grid--cols-3">
    <article class="card kpi-card">
      <div class="card__subtitle">${escapeHtml(t(lang, 'portal.metrics.contracts'))}</div>
      <div class="metric-value">${escapeHtml(formatNumber(lang, metrics.contractsCount))}</div>
    </article>
    <article class="card kpi-card">
      <div class="card__subtitle">${escapeHtml(t(lang, 'portal.metrics.greenhouses'))}</div>
      <div class="metric-value">${escapeHtml(formatNumber(lang, metrics.greenhousesCount))}</div>
    </article>
    <article class="card kpi-card kpi-card--gold">
      <div class="card__subtitle">${escapeHtml(t(lang, 'portal.metrics.paidInstallments'))}</div>
      <div class="metric-value">${escapeHtml(formatNumber(lang, metrics.paidInstallmentsEgp))} ${escapeHtml(t(lang, 'common.egp'))}</div>
    </article>
    <article class="card kpi-card kpi-card--gold">
      <div class="card__subtitle">${escapeHtml(t(lang, 'portal.metrics.distributedProfits'))}</div>
      <div class="metric-value">${escapeHtml(formatNumber(lang, metrics.distributedProfitsEgp))} ${escapeHtml(t(lang, 'common.egp'))}</div>
    </article>
    <article class="card kpi-card">
      <div class="card__subtitle">${escapeHtml(t(lang, 'portal.metrics.unreadNotifications'))}</div>
      <div class="metric-value">${escapeHtml(formatNumber(lang, metrics.unreadNotifications))}</div>
    </article>
    <article class="card kpi-card">
      <div class="card__subtitle">${escapeHtml(t(lang, 'portal.metrics.openTickets'))}</div>
      <div class="metric-value">${escapeHtml(formatNumber(lang, metrics.openTickets))}</div>
    </article>
  </section>

  <section class="card stack">
    <div class="card__header">
      <h2 class="card__title">${escapeHtml(t(lang, 'portal.nav.notifications'))}</h2>
      <a class="btn btn--secondary btn--sm" href="/portal/notifications">${escapeHtml(t(lang, 'common.view'))}</a>
    </div>
    ${notifications.length === 0 ? `<p class="form-hint">${escapeHtml(t(lang, 'common.noRecords'))}</p>` : `
      <ul class="stack" style="list-style: none; padding: 0;">
        ${notifications.map((n) => `
          <li class="alert ${n.is_read ? '' : 'alert--success'}">
            <strong>${escapeHtml(lang === 'ar' ? n.title_ar : n.title_en)}</strong>
            <p style="margin: var(--space-1) 0 0;">${escapeHtml(lang === 'ar' ? n.body_ar : n.body_en)}</p>
          </li>
        `).join('')}
      </ul>
    `}
  </section>`;
}

export function renderPortalInvestments({ lang, contracts }) {
  return `
  <section class="card stack">
    <h1 class="card__title">${escapeHtml(t(lang, 'portal.nav.investments'))}</h1>
    <div class="table-responsive">
      <table class="table">
        <thead>
          <tr>
            <th>${escapeHtml(lang === 'ar' ? 'رقم العقد' : 'Contract #')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'المشروع' : 'Project')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'عدد الصوب' : 'Greenhouses')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'إجمالي العقد' : 'Total')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'الدفعة المقدمة' : 'Down Payment')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'المتبقي' : 'Remaining')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'تاريخ البداية' : 'Start Date')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'الحالة' : 'Status')}</th>
          </tr>
        </thead>
        <tbody>
          ${contracts.length === 0 ? `<tr><td colspan="8">${escapeHtml(t(lang, 'common.noRecords'))}</td></tr>` : contracts.map((c) => `
            <tr>
              <td><strong>${escapeHtml(c.contract_number)}</strong></td>
              <td>${escapeHtml(c.project_title || '—')}</td>
              <td>${escapeHtml(formatNumber(lang, c.greenhouse_count))}</td>
              <td>${escapeHtml(formatNumber(lang, c.total_amount_egp))} ${escapeHtml(t(lang, 'common.egp'))}</td>
              <td>${escapeHtml(formatNumber(lang, c.down_payment_egp))} ${escapeHtml(t(lang, 'common.egp'))}</td>
              <td>${escapeHtml(formatNumber(lang, c.remaining_amount_egp))} ${escapeHtml(t(lang, 'common.egp'))}</td>
              <td>${escapeHtml(c.start_date)}</td>
              <td><span class="badge badge--success">${escapeHtml(t(lang, `status.${c.status}`))}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </section>`;
}

export function renderPortalGreenhouses({ lang, greenhouses }) {
  return `
  <section class="card stack">
    <h1 class="card__title">${escapeHtml(t(lang, 'portal.nav.greenhouses'))}</h1>
    <div class="table-responsive">
      <table class="table">
        <thead>
          <tr>
            <th>${escapeHtml(lang === 'ar' ? 'رقم الصوبة' : 'Greenhouse #')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'العقد' : 'Contract')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'المساحة' : 'Area')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'الموقع' : 'Location')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'المحصول الحالي' : 'Current Crop')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'الحالة التشغيلية' : 'Operational Status')}</th>
          </tr>
        </thead>
        <tbody>
          ${greenhouses.length === 0 ? `<tr><td colspan="6">${escapeHtml(t(lang, 'common.noRecords'))}</td></tr>` : greenhouses.map((g) => `
            <tr>
              <td><strong>${escapeHtml(g.greenhouse_number)}</strong></td>
              <td>${escapeHtml(g.contract_number)}</td>
              <td>${escapeHtml(formatNumber(lang, g.area_sqm))} ${escapeHtml(t(lang, 'common.sqm'))}</td>
              <td>${escapeHtml(g.location_label)}</td>
              <td>${escapeHtml((lang === 'ar' ? g.current_crop_ar : g.current_crop_en) || '—')}</td>
              <td><span class="badge badge--info">${escapeHtml(t(lang, `status.${g.operational_status}`))}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </section>`;
}

export function renderPortalCrops({ lang, crops }) {
  return `
  <section class="card stack">
    <h1 class="card__title">${escapeHtml(t(lang, 'portal.nav.crops'))}</h1>
    <div class="table-responsive">
      <table class="table">
        <thead>
          <tr>
            <th>${escapeHtml(lang === 'ar' ? 'التاريخ' : 'Date')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'الصوبة' : 'Greenhouse')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'الموسم' : 'Season')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'المحصول' : 'Crop')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'المرحلة' : 'Stage')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'الإنتاج (كجم)' : 'Yield (kg)')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'المبيعات' : 'Sales Revenue')}</th>
          </tr>
        </thead>
        <tbody>
          ${crops.length === 0 ? `<tr><td colspan="7">${escapeHtml(t(lang, 'common.noRecords'))}</td></tr>` : crops.map((c) => `
            <tr>
              <td>${escapeHtml(c.recorded_date)}</td>
              <td>${escapeHtml(c.greenhouse_number)}</td>
              <td>${escapeHtml(c.season_name)}</td>
              <td>${escapeHtml(lang === 'ar' ? c.crop_name_ar : c.crop_name_en)}</td>
              <td>${escapeHtml(lang === 'ar' ? c.stage_ar : c.stage_en)}</td>
              <td>${escapeHtml(formatNumber(lang, c.yield_kg, 1))}</td>
              <td>${escapeHtml(formatNumber(lang, c.sales_revenue_egp))} ${escapeHtml(t(lang, 'common.egp'))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </section>`;
}

export function renderPortalProfits({ lang, profits }) {
  return `
  <section class="card stack">
    <h1 class="card__title">${escapeHtml(t(lang, 'portal.nav.profits'))}</h1>
    <div class="table-responsive">
      <table class="table">
        <thead>
          <tr>
            <th>${escapeHtml(lang === 'ar' ? 'الفترة' : 'Period')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'العقد' : 'Contract')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'إجمالي الإيراد' : 'Gross Revenue')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'التكاليف التشغيلية' : 'Operating Costs')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'صافي الربح' : 'Net Profit')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'تاريخ التوزيع' : 'Distribution Date')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'الحالة' : 'Status')}</th>
          </tr>
        </thead>
        <tbody>
          ${profits.length === 0 ? `<tr><td colspan="7">${escapeHtml(t(lang, 'common.noRecords'))}</td></tr>` : profits.map((p) => `
            <tr>
              <td><strong>${escapeHtml(p.period_label)}</strong></td>
              <td>${escapeHtml(p.contract_number)}</td>
              <td>${escapeHtml(formatNumber(lang, p.gross_revenue_egp))} ${escapeHtml(t(lang, 'common.egp'))}</td>
              <td>${escapeHtml(formatNumber(lang, p.operating_costs_egp))} ${escapeHtml(t(lang, 'common.egp'))}</td>
              <td><strong>${escapeHtml(formatNumber(lang, p.net_profit_egp))} ${escapeHtml(t(lang, 'common.egp'))}</strong></td>
              <td>${escapeHtml(p.distribution_date)}</td>
              <td><span class="badge badge--success">${escapeHtml(t(lang, `status.${p.payout_status}`))}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </section>`;
}

export function renderPortalInstallments({ lang, installments }) {
  return `
  <section class="card stack">
    <h1 class="card__title">${escapeHtml(t(lang, 'portal.nav.installments'))}</h1>
    <div class="table-responsive">
      <table class="table">
        <thead>
          <tr>
            <th>${escapeHtml(lang === 'ar' ? 'العقد' : 'Contract')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'رقم القسط' : 'Installment #')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'المبلغ المطلوب' : 'Due Amount')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'المبلغ المدفوع' : 'Paid Amount')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'تاريخ السداد' : 'Paid Date')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'المرجع' : 'Reference')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'الحالة' : 'Status')}</th>
          </tr>
        </thead>
        <tbody>
          ${installments.length === 0 ? `<tr><td colspan="8">${escapeHtml(t(lang, 'common.noRecords'))}</td></tr>` : installments.map((i) => `
            <tr>
              <td>${escapeHtml(i.contract_number)}</td>
              <td>#${escapeHtml(i.installment_number)}</td>
              <td>${escapeHtml(i.due_date)}</td>
              <td>${escapeHtml(formatNumber(lang, i.amount_egp))} ${escapeHtml(t(lang, 'common.egp'))}</td>
              <td>${escapeHtml(formatNumber(lang, i.paid_amount_egp))} ${escapeHtml(t(lang, 'common.egp'))}</td>
              <td>${escapeHtml(i.paid_date || '—')}</td>
              <td>${escapeHtml(i.payment_reference || '—')}</td>
              <td><span class="badge ${i.payment_status === 'paid' ? 'badge--success' : i.payment_status === 'overdue' ? 'badge--danger' : 'badge--warning'}">${escapeHtml(t(lang, `status.${i.payment_status}`))}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </section>`;
}

export function renderPortalDocuments({ lang, docs }) {
  return `
  <section class="card stack">
    <h1 class="card__title">${escapeHtml(t(lang, 'portal.nav.documents'))}</h1>
    <div class="table-responsive">
      <table class="table">
        <thead>
          <tr>
            <th>${escapeHtml(lang === 'ar' ? 'المستند' : 'Document')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'النوع' : 'Type')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'العقد' : 'Contract')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'التاريخ' : 'Date')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'إجراء' : 'Action')}</th>
          </tr>
        </thead>
        <tbody>
          ${docs.length === 0 ? `<tr><td colspan="5">${escapeHtml(t(lang, 'common.noRecords'))}</td></tr>` : docs.map((d) => `
            <tr>
              <td><strong>${escapeHtml(lang === 'ar' ? d.title_ar : d.title_en)}</strong></td>
              <td><span class="badge">${escapeHtml(d.doc_type)}</span></td>
              <td>${escapeHtml(d.contract_number || '—')}</td>
              <td>${escapeHtml(String(d.created_at).slice(0, 10))}</td>
              <td><a class="btn btn--secondary btn--sm" href="/api/portal/documents/${d.id}/download">${escapeHtml(t(lang, 'common.download'))}</a></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </section>`;
}

export function renderPortalStatement({ lang, user, profile, filters, contracts, rows }) {
  const qs = new URLSearchParams();
  if (filters.from) qs.set('from', filters.from);
  if (filters.to) qs.set('to', filters.to);
  if (filters.type) qs.set('type', filters.type);
  if (filters.contract_id) qs.set('contract_id', filters.contract_id);

  return `
  <section class="card stack no-print">
    <div class="cluster" style="justify-content: space-between;">
      <h1 class="card__title">${escapeHtml(t(lang, 'portal.nav.statement'))}</h1>
      <div class="cluster">
        <a class="btn btn--secondary btn--sm" href="/api/portal/statement/export.csv?${escapeHtml(qs.toString())}">${escapeHtml(t(lang, 'common.exportCsv'))}</a>
        <button type="button" class="btn btn--primary btn--sm" data-print-btn>${escapeHtml(t(lang, 'common.printPdf'))}</button>
      </div>
    </div>
    <form class="grid grid--cols-4" method="get" action="/portal/statement" style="align-items: end;">
      <div class="form-field">
        <label class="form-label" for="st-from">${escapeHtml(lang === 'ar' ? 'من تاريخ' : 'From Date')}</label>
        <input class="form-control" id="st-from" type="date" name="from" value="${escapeHtml(filters.from || '')}">
      </div>
      <div class="form-field">
        <label class="form-label" for="st-to">${escapeHtml(lang === 'ar' ? 'إلى تاريخ' : 'To Date')}</label>
        <input class="form-control" id="st-to" type="date" name="to" value="${escapeHtml(filters.to || '')}">
      </div>
      <div class="form-field">
        <label class="form-label" for="st-type">${escapeHtml(lang === 'ar' ? 'النوع' : 'Type')}</label>
        <select class="form-control" id="st-type" name="type">
          <option value="all"${filters.type === 'all' ? ' selected' : ''}>${escapeHtml(lang === 'ar' ? 'الكل' : 'All')}</option>
          <option value="installment"${filters.type === 'installment' ? ' selected' : ''}>${escapeHtml(lang === 'ar' ? 'الأقساط' : 'Installments')}</option>
          <option value="profit"${filters.type === 'profit' ? ' selected' : ''}>${escapeHtml(lang === 'ar' ? 'الأرباح' : 'Profits')}</option>
        </select>
      </div>
      <div class="cluster">
        <button class="btn btn--primary btn--sm" type="submit">${escapeHtml(t(lang, 'common.filter'))}</button>
        <a class="btn btn--ghost btn--sm" href="/portal/statement">${escapeHtml(t(lang, 'common.reset'))}</a>
      </div>
    </form>
  </section>

  <section class="card stack">
    <div class="cluster" style="justify-content: space-between;">
      <div>
        <strong>${escapeHtml(t(lang, 'brand.name'))}</strong>
        <p class="card__subtitle">${escapeHtml(user.fullName)} — ${escapeHtml(profile?.investor_code || '')}</p>
      </div>
      <span class="badge badge--success">${escapeHtml(t(lang, 'admin.approvalStatus.APPROVED'))}</span>
    </div>
    <div class="table-responsive">
      <table class="table">
        <thead>
          <tr>
            <th>${escapeHtml(lang === 'ar' ? 'التاريخ' : 'Date')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'النوع' : 'Type')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'العقد' : 'Contract')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'البيان' : 'Description')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'القيمة' : 'Amount')}</th>
            <th>${escapeHtml(lang === 'ar' ? 'الحالة' : 'Status')}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length === 0 ? `<tr><td colspan="6">${escapeHtml(t(lang, 'common.noRecords'))}</td></tr>` : rows.map((r) => `
            <tr>
              <td>${escapeHtml(r.date)}</td>
              <td>${escapeHtml(r.entryTypeLabel)}</td>
              <td>${escapeHtml(r.contractNumber)}</td>
              <td>${escapeHtml(r.description)}</td>
              <td>${escapeHtml(formatNumber(lang, r.amount))} ${escapeHtml(t(lang, 'common.egp'))}</td>
              <td><span class="badge">${escapeHtml(r.statusLabel)}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </section>`;
}

export function renderPortalNotifications({ lang, notifications, csrfToken }) {
  return `
  <section class="card stack">
    <div class="cluster" style="justify-content: space-between;">
      <h1 class="card__title">${escapeHtml(t(lang, 'portal.nav.notifications'))}</h1>
      <form method="post" action="/api/portal/notifications/read">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <button class="btn btn--secondary btn--sm" type="submit">${escapeHtml(lang === 'ar' ? 'تحديد الكل كمقروء' : 'Mark All Read')}</button>
      </form>
    </div>
    ${notifications.length === 0 ? `<p class="form-hint">${escapeHtml(t(lang, 'common.noRecords'))}</p>` : notifications.map((n) => `
      <div class="alert ${n.is_read ? '' : 'alert--success'}">
        <div class="cluster" style="justify-content: space-between;">
          <strong>${escapeHtml(lang === 'ar' ? n.title_ar : n.title_en)}</strong>
          <span class="badge">${escapeHtml(String(n.created_at).slice(0, 16))}</span>
        </div>
        <p style="margin: var(--space-1) 0 0;">${escapeHtml(lang === 'ar' ? n.body_ar : n.body_en)}</p>
      </div>
    `).join('')}
  </section>`;
}

export function renderPortalSupport({ lang, tickets, csrfToken }) {
  return `
  <section class="card stack">
    <h1 class="card__title">${escapeHtml(t(lang, 'portal.nav.support'))}</h1>
    <form class="form-grid" method="post" action="/api/portal/support/tickets">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
      <div class="grid grid--cols-3">
        <div class="form-field">
          <label class="form-label" for="tk-subj">${escapeHtml(t(lang, 'forms.subject'))}</label>
          <input class="form-control" id="tk-subj" name="subject" type="text" required maxlength="255">
        </div>
        <div class="form-field">
          <label class="form-label" for="tk-cat">${escapeHtml(lang === 'ar' ? 'التصنيف' : 'Category')}</label>
          <select class="form-control" id="tk-cat" name="category">
            <option value="general">${escapeHtml(lang === 'ar' ? 'عام' : 'General')}</option>
            <option value="financial">${escapeHtml(lang === 'ar' ? 'مالي / أقساط / أرباح' : 'Financial')}</option>
            <option value="agricultural">${escapeHtml(lang === 'ar' ? 'زراعي / صوب' : 'Agricultural')}</option>
            <option value="complaint">${escapeHtml(lang === 'ar' ? 'شكوى' : 'Complaint')}</option>
          </select>
        </div>
        <div class="form-field">
          <label class="form-label" for="tk-prio">${escapeHtml(lang === 'ar' ? 'الأولوية' : 'Priority')}</label>
          <select class="form-control" id="tk-prio" name="priority">
            <option value="normal">${escapeHtml(lang === 'ar' ? 'عادية' : 'Normal')}</option>
            <option value="high">${escapeHtml(lang === 'ar' ? 'عالية' : 'High')}</option>
            <option value="low">${escapeHtml(lang === 'ar' ? 'منخفضة' : 'Low')}</option>
          </select>
        </div>
      </div>
      <div class="form-field">
        <label class="form-label" for="tk-msg">${escapeHtml(t(lang, 'forms.message'))}</label>
        <textarea class="form-control" id="tk-msg" name="message" required maxlength="2000"></textarea>
      </div>
      <div><button class="btn btn--primary" type="submit">${escapeHtml(t(lang, 'common.submit'))}</button></div>
    </form>
  </section>

  <section class="stack">
    ${tickets.length === 0 ? `<div class="card"><p class="form-hint">${escapeHtml(t(lang, 'common.noRecords'))}</p></div>` : tickets.map((tk) => `
      <article class="card stack">
        <div class="cluster" style="justify-content: space-between;">
          <div>
            <strong>${escapeHtml(tk.ticket_number)} — ${escapeHtml(tk.subject)}</strong>
            <p class="card__subtitle">${escapeHtml(tk.category)} &bull; ${escapeHtml(String(tk.created_at).slice(0, 16))}</p>
          </div>
          <span class="badge badge--info">${escapeHtml(t(lang, `status.${tk.status}`))}</span>
        </div>
        <div class="stack">
          ${(tk.replies || []).map((rep) => `
            <div class="alert ${rep.is_staff_reply ? 'alert--success' : ''}">
              <strong>${escapeHtml(rep.author_name)} ${rep.is_staff_reply ? (lang === 'ar' ? '(الإدارة)' : '(Staff)') : ''}</strong>
              <p style="margin: var(--space-1) 0 0;">${escapeHtml(rep.message)}</p>
            </div>
          `).join('')}
        </div>
        <form class="cluster" method="post" action="/api/portal/support/tickets/${tk.id}/reply">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
          <input class="form-control" name="message" type="text" placeholder="${escapeHtml(lang === 'ar' ? 'أضف رداً...' : 'Add a reply...')}" required style="flex: 1;">
          <button class="btn btn--secondary btn--sm" type="submit">${escapeHtml(t(lang, 'common.submit'))}</button>
        </form>
      </article>
    `).join('')}
  </section>`;
}

export function renderPortalProfile({ lang, user, profile, contractsSummary, csrfToken }) {
  return `
  <section class="card stack">
    <h1 class="card__title">${escapeHtml(t(lang, 'portal.nav.profile'))}</h1>
    <div class="alert alert--warning">${escapeHtml(t(lang, 'portal.profileLockedNote'))}</div>
    <div class="grid grid--cols-2">
      <div class="form-field">
        <label class="form-label">${escapeHtml(t(lang, 'forms.fullName'))}</label>
        <input class="form-control locked-field" value="${escapeHtml(user.fullName)}" disabled readonly>
      </div>
      <div class="form-field">
        <label class="form-label">${escapeHtml(t(lang, 'forms.email'))}</label>
        <input class="form-control locked-field" value="${escapeHtml(user.email)}" disabled readonly>
      </div>
      <div class="form-field">
        <label class="form-label">${escapeHtml(lang === 'ar' ? 'رمز المستثمر' : 'Investor Code')}</label>
        <input class="form-control locked-field" value="${escapeHtml(profile?.investor_code || '—')}" disabled readonly>
      </div>
      <div class="form-field">
        <label class="form-label">${escapeHtml(lang === 'ar' ? 'إجمالي التعاقدات' : 'Total Contracted Value')}</label>
        <input class="form-control locked-field" value="${escapeHtml(formatNumber(lang, contractsSummary?.total_amount || 0))} ${escapeHtml(t(lang, 'common.egp'))}" disabled readonly>
      </div>
    </div>

    <form class="form-grid" method="post" action="/api/portal/profile">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
      <div class="grid grid--cols-2">
        <div class="form-field">
          <label class="form-label" for="prof-phone">${escapeHtml(t(lang, 'forms.phone'))}</label>
          <input class="form-control" id="prof-phone" name="mobile_number" type="tel" value="${escapeHtml(user.mobileNumber || '')}" required>
        </div>
        <div class="form-field">
          <label class="form-label" for="prof-lang">${escapeHtml(t(lang, 'common.selectLanguage'))}</label>
          <select class="form-control" id="prof-lang" name="preferred_language">
            <option value="ar"${user.preferredLanguage === 'ar' ? ' selected' : ''}>العربية</option>
            <option value="en"${user.preferredLanguage === 'en' ? ' selected' : ''}>English</option>
          </select>
        </div>
      </div>
      <div><button class="btn btn--primary" type="submit">${escapeHtml(t(lang, 'common.save'))}</button></div>
    </form>
  </section>

  <section class="card stack">
    <h2 class="card__title">${escapeHtml(t(lang, 'auth.resetPassword'))}</h2>
    <form class="form-grid" method="post" action="/api/portal/password">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
      <div class="grid grid--cols-3">
        <div class="form-field">
          <label class="form-label" for="pw-cur">${escapeHtml(t(lang, 'auth.currentPassword'))}</label>
          <input class="form-control" id="pw-cur" name="current_password" type="password" required>
        </div>
        <div class="form-field">
          <label class="form-label" for="pw-new">${escapeHtml(t(lang, 'auth.newPassword'))}</label>
          <input class="form-control" id="pw-new" name="new_password" type="password" required minlength="10">
        </div>
        <div class="form-field">
          <label class="form-label" for="pw-cnf">${escapeHtml(t(lang, 'auth.confirmPassword'))}</label>
          <input class="form-control" id="pw-cnf" name="confirm_password" type="password" required minlength="10">
        </div>
      </div>
      <div><button class="btn btn--secondary" type="submit">${escapeHtml(t(lang, 'common.save'))}</button></div>
    </form>
  </section>`;
}
