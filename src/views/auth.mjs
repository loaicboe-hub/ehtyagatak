import { escapeHtml, sanitizeSafeUrl } from '../../foundation/security/input-sanitizer.mjs';
import { getProjectDirection, t } from '../i18n/index.mjs';
import { getLocalizedField } from '../services/settings.mjs';

function renderAuthShell({ lang, title, settings, bodyHtml }) {
  const dir = getProjectDirection(lang);
  const siteName = getLocalizedField(settings.identity.site_name, lang, t(lang, 'brand.name'));
  const switchLang = lang === 'ar' ? 'en' : 'ar';

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — ${escapeHtml(siteName)}</title>
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
  <main class="auth-page">
    <div class="auth-card card stack">
      <div class="cluster" style="justify-content: space-between;">
        <a href="/${escapeHtml(lang)}">
          <img src="${escapeHtml(sanitizeSafeUrl(settings.identity.logo_url || '/assets/logo.png'))}" alt="${escapeHtml(siteName)}" style="block-size: 5.2rem; inline-size: auto;">
        </a>
        <a class="btn btn--ghost btn--sm" href="/login?lang=${escapeHtml(switchLang)}">${escapeHtml(t(lang, 'common.switchLanguage'))}</a>
      </div>
      ${bodyHtml}
      <div class="cluster" style="justify-content: space-between; font-size: var(--text-xs);">
        <a href="/${escapeHtml(lang)}">&larr; ${escapeHtml(t(lang, 'common.backToHome'))}</a>
        <span>${escapeHtml(siteName)}</span>
      </div>
    </div>
  </main>
</body>
</html>`;
}

export function renderLoginPage({ lang, settings, csrfToken, error = '', info = '' }) {
  return renderAuthShell({
    lang,
    title: t(lang, 'auth.loginTitle'),
    settings,
    bodyHtml: `
      <h1 style="font-size: var(--text-2xl); margin: 0;">${escapeHtml(t(lang, 'auth.loginTitle'))}</h1>
      <p class="card__subtitle" style="margin: 0;">${escapeHtml(t(lang, 'auth.loginSubtitle'))}</p>
      ${error ? `<div class="alert alert--danger" role="alert">${escapeHtml(error)}</div>` : ''}
      ${info ? `<div class="alert alert--success" role="status">${escapeHtml(info)}</div>` : ''}
      <form class="form-grid" method="post" action="/api/auth/login">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <input type="hidden" name="lang" value="${escapeHtml(lang)}">
        <div class="form-field">
          <label class="form-label" for="login-email">${escapeHtml(t(lang, 'auth.email'))}</label>
          <input class="form-control" id="login-email" name="email" type="email" autocomplete="email" required>
        </div>
        <div class="form-field">
          <label class="form-label" for="login-password">${escapeHtml(t(lang, 'auth.password'))}</label>
          <input class="form-control" id="login-password" name="password" type="password" autocomplete="current-password" required>
        </div>
        <label class="cluster" style="font-size: var(--text-sm);">
          <input type="checkbox" name="remember_me" value="1">
          <span>${escapeHtml(t(lang, 'auth.rememberMe'))}</span>
        </label>
        <button class="btn btn--primary" type="submit">${escapeHtml(t(lang, 'auth.signIn'))}</button>
      </form>
      <div class="cluster" style="justify-content: space-between; font-size: var(--text-sm);">
        <a href="/forgot-password">${escapeHtml(t(lang, 'auth.forgotPassword'))}</a>
      </div>
      <p class="form-hint" style="margin: 0;">${escapeHtml(t(lang, 'auth.registrationDisabled'))}</p>
    `
  });
}

export function renderForgotPasswordPage({ lang, settings, csrfToken, error = '', info = '' }) {
  return renderAuthShell({
    lang,
    title: t(lang, 'auth.forgotPassword'),
    settings,
    bodyHtml: `
      <h1 style="font-size: var(--text-2xl); margin: 0;">${escapeHtml(t(lang, 'auth.forgotPassword'))}</h1>
      <p class="card__subtitle" style="margin: 0;">${escapeHtml(t(lang, 'auth.forgotPasswordHint'))}</p>
      ${error ? `<div class="alert alert--danger" role="alert">${escapeHtml(error)}</div>` : ''}
      ${info ? `<div class="alert alert--info" role="status">${escapeHtml(info)}</div>` : ''}
      <form class="form-grid" method="post" action="/api/auth/forgot-password">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <input type="hidden" name="lang" value="${escapeHtml(lang)}">
        <div class="form-field">
          <label class="form-label" for="fp-email">${escapeHtml(t(lang, 'auth.email'))}</label>
          <input class="form-control" id="fp-email" name="email" type="email" autocomplete="email" required>
        </div>
        <button class="btn btn--primary" type="submit">${escapeHtml(t(lang, 'auth.sendResetLink'))}</button>
      </form>
      <a href="/login" style="font-size: var(--text-sm);">${escapeHtml(t(lang, 'auth.backToLogin'))}</a>
    `
  });
}

export function renderResetPasswordPage({ lang, settings, csrfToken, token, error = '' }) {
  return renderAuthShell({
    lang,
    title: t(lang, 'auth.resetPassword'),
    settings,
    bodyHtml: `
      <h1 style="font-size: var(--text-2xl); margin: 0;">${escapeHtml(t(lang, 'auth.resetPassword'))}</h1>
      ${error ? `<div class="alert alert--danger" role="alert">${escapeHtml(error)}</div>` : ''}
      <form class="form-grid" method="post" action="/api/auth/reset-password">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <input type="hidden" name="lang" value="${escapeHtml(lang)}">
        <input type="hidden" name="token" value="${escapeHtml(token)}">
        <div class="form-field">
          <label class="form-label" for="rp-pw">${escapeHtml(t(lang, 'auth.newPassword'))}</label>
          <input class="form-control" id="rp-pw" name="new_password" type="password" autocomplete="new-password" required minlength="10">
        </div>
        <div class="form-field">
          <label class="form-label" for="rp-cpw">${escapeHtml(t(lang, 'auth.confirmPassword'))}</label>
          <input class="form-control" id="rp-cpw" name="confirm_password" type="password" autocomplete="new-password" required minlength="10">
        </div>
        <button class="btn btn--primary" type="submit">${escapeHtml(t(lang, 'auth.resetPassword'))}</button>
      </form>
      <a href="/login" style="font-size: var(--text-sm);">${escapeHtml(t(lang, 'auth.backToLogin'))}</a>
    `
  });
}
