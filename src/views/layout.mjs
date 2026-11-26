import { escapeHtml, sanitizeSafeUrl } from '../../foundation/security/input-sanitizer.mjs';
import { buildLanguageSwitchUrl, getProjectDirection, t } from '../i18n/index.mjs';
import { getLocalizedField } from '../services/settings.mjs';
import { getEnvConfig } from '../config/env.mjs';
import { isStaffRole } from '../security/auth.mjs';
import { renderSplashScreen } from './splash.mjs';

export function renderPublicLayout({
  lang,
  title,
  description,
  currentPath,
  settings,
  user,
  csrfToken = '',
  flash = null,
  bodyHtml
}) {
  const dir = getProjectDirection(lang);
  const cfg = getEnvConfig();
  const siteName = getLocalizedField(settings.identity.site_name, lang, t(lang, 'brand.name'));
  const copyright = getLocalizedField(settings.identity.copyright_text, lang, '');
  const address = getLocalizedField(settings.contact.physical_address, lang, '');
  const hours = getLocalizedField(settings.contact.working_hours, lang, '');
  const canonicalOrigin = (settings.seo.canonical_origin || cfg.appUrl || '').replace(/\/+$/, '');
  const arUrl = `${canonicalOrigin}${buildLanguageSwitchUrl(currentPath, 'ar')}`;
  const enUrl = `${canonicalOrigin}${buildLanguageSwitchUrl(currentPath, 'en')}`;
  const canonicalUrl = lang === 'en' ? enUrl : arUrl;
  const switchLang = lang === 'ar' ? 'en' : 'ar';
  const switchUrl = buildLanguageSwitchUrl(currentPath, switchLang);
  const lp = (p) => `/${lang}${p === '/' ? '' : p}`;

  const navItems = [
    { href: lp('/'), label: t(lang, 'nav.home'), key: '/' },
    { href: lp('/about'), label: t(lang, 'nav.about'), key: '/about' },
    { href: lp('/projects'), label: t(lang, 'nav.projects'), key: '/projects' },
    { href: lp('/invest'), label: t(lang, 'nav.invest'), key: '/invest' },
    { href: lp('/how-it-works'), label: t(lang, 'nav.howItWorks'), key: '/how-it-works' },
    { href: lp('/services'), label: t(lang, 'nav.services'), key: '/services' },
    { href: lp('/news'), label: t(lang, 'nav.news'), key: '/news' },
    { href: lp('/faq'), label: t(lang, 'nav.faq'), key: '/faq' },
    { href: lp('/contact'), label: t(lang, 'nav.contact'), key: '/contact' }
  ];

  const normalizedRoute = currentPath.replace(/^\/(ar|en)(?=\/|$)/, '') || '/';

  const accountAction = user
    ? (isStaffRole(user.role)
        ? `<a class="btn btn--primary btn--sm" href="/admin">${escapeHtml(t(lang, 'nav.admin'))}</a>`
        : `<a class="btn btn--primary btn--sm" href="/portal">${escapeHtml(t(lang, 'nav.portal'))}</a>`)
    : `<a class="btn btn--primary btn--sm" href="/login">${escapeHtml(t(lang, 'nav.login'))}</a>`;

  const headerAccountAction = user
    ? (isStaffRole(user.role)
        ? `<a class="btn btn--primary btn--sm header-account-btn" href="/admin">${escapeHtml(t(lang, 'nav.admin'))}</a>`
        : `<a class="btn btn--primary btn--sm header-account-btn" href="/portal">${escapeHtml(t(lang, 'nav.portal'))}</a>`)
    : `<a class="btn btn--primary btn--sm header-account-btn" href="/login">${escapeHtml(t(lang, 'nav.login'))}</a>`;

  const navLinksHtml = navItems
    .map((item) => {
      const currentAttr = normalizedRoute === item.key ? ' aria-current="page"' : '';
      return `<a class="site-nav__link" href="${escapeHtml(item.href)}"${currentAttr}>${escapeHtml(item.label)}</a>`;
    })
    .join('');

  const socialLinks = settings.navigation?.social_links || {};
  const socialHtml = Object.entries(socialLinks)
    .filter(([, url]) => typeof url === 'string' && url.trim() !== '')
    .map(([net, url]) => `<a href="${escapeHtml(sanitizeSafeUrl(url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(net)}</a>`)
    .join(' &middot; ');

  const whatsappBtn = settings.contact.show_whatsapp_floating_cta && settings.whatsappUrl
    ? `<a class="whatsapp-fab no-print" href="${escapeHtml(settings.whatsappUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t(lang, 'common.whatsappCta'))}</a>`
    : '';

  const flashHtml = flash
    ? `<div class="container" style="padding-block-start: var(--space-4);"><div class="alert alert--${escapeHtml(flash.type || 'info')}" role="status">${escapeHtml(flash.message)}</div></div>`
    : '';

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description || '')}">
  <link rel="icon" type="image/png" href="${escapeHtml(sanitizeSafeUrl(settings.identity.favicon_url || '/assets/favicon.png'))}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <link rel="alternate" hreflang="ar" href="${escapeHtml(arUrl)}">
  <link rel="alternate" hreflang="en" href="${escapeHtml(enUrl)}">
  <link rel="alternate" hreflang="x-default" href="${escapeHtml(arUrl)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${escapeHtml(siteName)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description || '')}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/foundation/design-system/tokens.css">
  <link rel="stylesheet" href="/foundation/design-system/base.css">
  <link rel="stylesheet" href="/foundation/design-system/components.css">
  <link rel="stylesheet" href="/css/theme.css">
  <script src="/js/splash-init.js"></script>
</head>
<body>
  ${renderSplashScreen({ lang })}
  <a class="skip-link" href="#main-content">${escapeHtml(t(lang, 'common.skipToContent'))}</a>

  <header class="site-header">
    <div class="container site-header__inner">
      <a class="site-brand" href="${escapeHtml(lp('/'))}">
        <img class="site-brand__logo" src="${escapeHtml(sanitizeSafeUrl(settings.identity.logo_url || '/assets/logo.png'))}" alt="${escapeHtml(siteName)}">
      </a>

      <nav class="site-nav" aria-label="Primary">
        ${navLinksHtml}
      </nav>

      <div class="site-header__actions">
        <a class="btn btn--secondary btn--sm" href="${escapeHtml(switchUrl)}" hreflang="${escapeHtml(switchLang)}">${escapeHtml(t(lang, 'common.switchLanguage'))}</a>
        ${headerAccountAction}
        <button type="button" class="btn btn--secondary btn--sm mobile-menu-toggle" data-mobile-menu-open aria-expanded="false" aria-controls="mobile-nav-drawer">
          ${escapeHtml(t(lang, 'common.menu'))}
        </button>
      </div>
    </div>
  </header>

  <div class="drawer-backdrop" data-drawer-backdrop hidden></div>
  <aside id="mobile-nav-drawer" class="mobile-drawer" aria-label="Mobile Navigation" data-open="false" hidden>
    <div class="cluster" style="justify-content: space-between;">
      <strong>${escapeHtml(t(lang, 'common.menu'))}</strong>
      <button type="button" class="btn btn--ghost btn--sm" data-mobile-menu-close>${escapeHtml(t(lang, 'common.close'))}</button>
    </div>
    <nav class="stack" aria-label="Mobile Primary">
      ${navLinksHtml}
      <a class="site-nav__link" href="${escapeHtml(lp('/policies'))}">${escapeHtml(t(lang, 'nav.policies'))}</a>
    </nav>
    <div class="stack" style="margin-block-start: auto;">
      <a class="btn btn--secondary" href="${escapeHtml(switchUrl)}">${escapeHtml(t(lang, 'common.switchLanguage'))}</a>
      ${accountAction}
    </div>
  </aside>

  <main id="main-content" data-csrf-token="${escapeHtml(csrfToken)}">
    ${flashHtml}
    ${bodyHtml}
  </main>

  <footer class="site-footer">
    <div class="container">
      <div class="grid grid--cols-3">
        <div class="stack">
          <strong>${escapeHtml(siteName)}</strong>
          <p style="color: #cbd5e1; margin: 0;">${escapeHtml(getLocalizedField(settings.identity.tagline, lang, t(lang, 'brand.tagline')))}</p>
          ${socialHtml ? `<div style="font-size: var(--text-sm);">${socialHtml}</div>` : ''}
        </div>
        <div class="stack">
          <strong>${escapeHtml(t(lang, 'nav.projects'))} &amp; ${escapeHtml(t(lang, 'nav.policies'))}</strong>
          <ul class="stack" style="list-style: none; padding: 0; gap: var(--space-2);">
            <li><a href="${escapeHtml(lp('/projects'))}">${escapeHtml(t(lang, 'nav.projects'))}</a></li>
            <li><a href="${escapeHtml(lp('/invest'))}">${escapeHtml(t(lang, 'nav.invest'))}</a></li>
            <li><a href="${escapeHtml(lp('/how-it-works'))}">${escapeHtml(t(lang, 'nav.howItWorks'))}</a></li>
            <li><a href="${escapeHtml(lp('/policies'))}">${escapeHtml(t(lang, 'nav.policies'))}</a></li>
            <li><a href="/login">${escapeHtml(t(lang, 'nav.login'))}</a></li>
          </ul>
        </div>
        <div class="stack">
          <strong>${escapeHtml(t(lang, 'nav.contact'))}</strong>
          <ul class="stack" style="list-style: none; padding: 0; gap: var(--space-2); font-size: var(--text-sm);">
            ${settings.contact.mobile_number ? `<li><a href="tel:${escapeHtml(settings.contact.mobile_number)}" dir="ltr" style="unicode-bidi: isolate;">${escapeHtml(settings.contact.mobile_number)}</a></li>` : ''}
            ${settings.contact.email_address ? `<li><a href="mailto:${escapeHtml(settings.contact.email_address)}">${escapeHtml(settings.contact.email_address)}</a></li>` : ''}
            ${address ? `<li>${escapeHtml(address)}</li>` : ''}
            ${hours ? `<li>${escapeHtml(hours)}</li>` : ''}
            ${settings.whatsappUrl ? `<li><a href="${escapeHtml(settings.whatsappUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t(lang, 'common.whatsappCta'))}</a></li>` : ''}
          </ul>
        </div>
      </div>
      <div class="site-footer__bottom">
        <span>${escapeHtml(copyright)}</span>
        <span>${lang === 'ar' ? 'العربية (RTL) • English (LTR)' : 'English (LTR) • العربية (RTL)'}</span>
      </div>
    </div>
  </footer>

  ${whatsappBtn}
  <script type="module" src="/js/app.js"></script>
</body>
</html>`;
}
