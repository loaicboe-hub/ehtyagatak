import { getEnvConfig } from '../config/env.mjs';
import { queryOne, runSql, withTransaction } from '../db/client.mjs';
import { getWebsiteSettings, getLocalizedField } from '../services/settings.mjs';
import {
  appendSetCookie,
  createSession,
  ensureCsrfContext,
  formatCookie,
  getClientIp,
  isStaffRole,
  logSecurityEvent,
  verifyRequestCsrf
} from '../security/auth.mjs';
import { hashPassword, validatePasswordStrength, verifyPassword } from '../security/password.mjs';
import { getAppRateLimiter } from '../security/rate-limit.mjs';
import { sendHtml, sendJson, sendRedirect } from '../http/response.mjs';
import { renderForgotPasswordPage, renderLoginPage, renderResetPasswordPage } from '../views/auth.mjs';
import { resolveProjectLanguage, t } from '../i18n/index.mjs';
import { generateOpaqueToken, hashTokenSha256 } from '../../foundation/security/token-utils.mjs';
import { buildTrustedAppUrl } from '../../foundation/security/csrf.mjs';
import { buildPasswordResetEmail } from '../../foundation/mail/email-templates.mjs';
import { getSmtpStatus, sendSmtpEmail } from '../mail/smtp.mjs';
import { normalizeEmail } from '../../foundation/security/input-sanitizer.mjs';

export async function handleAuthRequest({ req, res, url, pathname, lang, db, user }) {
  const cfg = getEnvConfig();
  const settings = getWebsiteSettings(db);

  // Public registration strictly disabled
  if (pathname === '/register' || pathname === '/api/auth/register') {
    if (pathname.startsWith('/api/')) {
      return sendJson(res, 403, { error: t(lang, 'auth.registrationDisabled') }), true;
    }
    return sendHtml(res, 403, renderLoginPage({
      lang,
      settings,
      csrfToken: ensureCsrfContext(req, res, user),
      error: t(lang, 'auth.registrationDisabled')
    })), true;
  }

  if (pathname === '/login' && req.method === 'GET') {
    if (user) {
      return sendRedirect(res, isStaffRole(user.role) ? '/admin' : '/portal'), true;
    }
    const csrfToken = ensureCsrfContext(req, res, null);
    const errParam = url.searchParams.get('error');
    const infoParam = url.searchParams.get('info');
    let error = '';
    let info = '';
    if (errParam === 'invalid') error = t(lang, 'auth.invalidCredentials');
    if (errParam === 'locked') error = t(lang, 'auth.accountLocked');
    if (errParam === 'csrf') error = t(lang, 'forms.csrfInvalid');
    if (infoParam === 'reset') info = lang === 'ar' ? 'تم تحديث كلمة المرور بنجاح. يمكنك تسجيل الدخول الآن.' : 'Password updated. You may sign in now.';
    if (infoParam === 'logout') info = lang === 'ar' ? 'تم تسجيل الخروج بنجاح.' : 'Signed out successfully.';
    return sendHtml(res, 200, renderLoginPage({ lang, settings, csrfToken, error, info })), true;
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = req._parsedBody || { fields: {} };
    const f = body.fields;
    const reqLang = resolveProjectLanguage(f.lang || lang);

    if (!verifyRequestCsrf(req, user, f._csrf)) {
      if (body.isJson) return sendJson(res, 403, { error: t(reqLang, 'forms.csrfInvalid') }), true;
      return sendRedirect(res, '/login?error=csrf'), true;
    }

    const email = normalizeEmail(f.email || '');
    const password = String(f.password || '');
    const ip = getClientIp(req);
    const ua = req.headers['user-agent'] || '';
    const limiter = getAppRateLimiter(db);
    const rate = await limiter.check('login', `${ip}:${email}`);

    if (!rate.allowed) {
      logSecurityEvent(db, { eventType: 'auth.login.locked', severity: 'warning', ipAddress: ip, userAgent: ua, details: { email } });
      if (body.isJson) return sendJson(res, 429, { error: t(reqLang, 'auth.accountLocked') }), true;
      return sendRedirect(res, '/login?error=locked'), true;
    }

    const row = queryOne(
      db,
      `SELECT u.id, u.full_name, u.email, u.password_hash, u.is_active, u.preferred_language, r.slug AS role_slug
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.email = ?`,
      email
    );

    if (!row || !row.is_active || !verifyPassword(password, row.password_hash)) {
      logSecurityEvent(db, {
        eventType: 'auth.login.failure',
        severity: 'warning',
        userId: row ? row.id : null,
        ipAddress: ip,
        userAgent: ua,
        details: { email }
      });
      if (body.isJson) return sendJson(res, 401, { error: t(reqLang, 'auth.invalidCredentials') }), true;
      return sendRedirect(res, '/login?error=invalid'), true;
    }

    const rememberMe = f.remember_me === '1' || f.remember_me === true || f.remember_me === 'true';
    const session = createSession(db, { userId: row.id, ipAddress: ip, userAgent: ua, rememberMe });
    runSql(db, "UPDATE users SET last_login_at = datetime('now') WHERE id = ?", row.id);
    logSecurityEvent(db, { eventType: 'auth.login.success', severity: 'info', userId: row.id, ipAddress: ip, userAgent: ua });

    const cookieStr = formatCookie(cfg.authCookieName, session.rawToken, {
      httpOnly: true,
      sameSite: cfg.cookieSameSite === 'strict' ? 'Strict' : 'Lax',
      secure: cfg.cookieSecure,
      maxAge: session.ttlSeconds
    });
    const langCookie = formatCookie('site_lang', row.preferred_language || reqLang, {
      httpOnly: false,
      sameSite: 'Lax',
      secure: cfg.cookieSecure,
      maxAge: 31536000
    });
    let setCookies = appendSetCookie(res.getHeader('Set-Cookie'), cookieStr);
    setCookies = appendSetCookie(setCookies, langCookie);
    res.setHeader('Set-Cookie', setCookies);

    const dest = isStaffRole(row.role_slug) ? '/admin' : '/portal';
    if (body.isJson) {
      return sendJson(res, 200, { ok: true, role: row.role_slug, redirectTo: dest }), true;
    }
    return sendRedirect(res, dest), true;
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const body = req._parsedBody || { fields: {} };
    if (user && !verifyRequestCsrf(req, user, body.fields._csrf)) {
      return sendJson(res, 403, { error: t(lang, 'forms.csrfInvalid') }), true;
    }
    if (user?.sessionId) {
      runSql(db, "UPDATE user_sessions SET revoked_at = datetime('now') WHERE id = ?", user.sessionId);
      logSecurityEvent(db, { eventType: 'auth.logout', userId: user.id, ipAddress: getClientIp(req) });
    }
    const clearCookie = formatCookie(cfg.authCookieName, '', {
      httpOnly: true,
      sameSite: cfg.cookieSameSite === 'strict' ? 'Strict' : 'Lax',
      secure: cfg.cookieSecure,
      maxAge: 0
    });
    res.setHeader('Set-Cookie', appendSetCookie(res.getHeader('Set-Cookie'), clearCookie));
    if (body.isJson) return sendJson(res, 200, { ok: true }), true;
    return sendRedirect(res, '/login?info=logout'), true;
  }

  if (pathname === '/forgot-password' && req.method === 'GET') {
    const csrfToken = ensureCsrfContext(req, res, null);
    const err = url.searchParams.get('error');
    const sent = url.searchParams.get('sent');
    let error = '';
    if (err === 'smtp') error = t(lang, 'auth.emailServiceUnavailable');
    if (err === 'rate') error = t(lang, 'forms.rateLimited');
    const info = sent === '1' ? t(lang, 'auth.genericResetSent') : '';
    return sendHtml(res, 200, renderForgotPasswordPage({ lang, settings, csrfToken, error, info })), true;
  }

  if (pathname === '/api/auth/forgot-password' && req.method === 'POST') {
    const body = req._parsedBody || { fields: {} };
    const f = body.fields;
    const reqLang = resolveProjectLanguage(f.lang || lang);

    if (!verifyRequestCsrf(req, user, f._csrf)) {
      if (body.isJson) return sendJson(res, 403, { error: t(reqLang, 'forms.csrfInvalid') }), true;
      return sendRedirect(res, '/forgot-password?error=csrf'), true;
    }

    const email = normalizeEmail(f.email || '');
    const ip = getClientIp(req);
    const limiter = getAppRateLimiter(db);
    const rate = await limiter.check('passwordReset', `${ip}:${email}`);
    if (!rate.allowed) {
      if (body.isJson) return sendJson(res, 429, { error: t(reqLang, 'forms.rateLimited') }), true;
      return sendRedirect(res, '/forgot-password?error=rate'), true;
    }

    // Mandatory pre-lookup SMTP configuration check (never fake email delivery)
    const smtp = getSmtpStatus();
    if (!smtp.configured) {
      logSecurityEvent(db, { eventType: 'auth.password.reset_smtp_unconfigured', severity: 'warning', ipAddress: ip });
      if (body.isJson) return sendJson(res, 503, { error: t(reqLang, 'auth.emailServiceUnavailable') }), true;
      return sendRedirect(res, '/forgot-password?error=smtp'), true;
    }

    const account = queryOne(db, 'SELECT id, email, preferred_language, is_active FROM users WHERE email = ?', email);
    if (account && account.is_active) {
      const { rawToken, tokenHash } = generateOpaqueToken(32);
      const expiresAt = new Date(Date.now() + cfg.passwordResetTtlMinutes * 60 * 1000).toISOString();
      runSql(
        db,
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, requested_ip)
         VALUES (?, ?, ?, ?)`,
        account.id,
        tokenHash,
        expiresAt,
        ip
      );
      const resetUrl = buildTrustedAppUrl(cfg.appUrl, '/reset-password', { token: rawToken });
      const siteName = getLocalizedField(settings.identity.site_name, account.preferred_language || reqLang, cfg.appName);
      const mail = buildPasswordResetEmail({
        lang: account.preferred_language || reqLang,
        siteName,
        resetUrl
      });
      await sendSmtpEmail({ to: account.email, ...mail });
      logSecurityEvent(db, { eventType: 'auth.password.reset_request', userId: account.id, ipAddress: ip });
    }

    if (body.isJson) return sendJson(res, 200, { ok: true, message: t(reqLang, 'auth.genericResetSent') }), true;
    return sendRedirect(res, '/forgot-password?sent=1'), true;
  }

  if (pathname === '/reset-password' && req.method === 'GET') {
    const token = url.searchParams.get('token') || '';
    const csrfToken = ensureCsrfContext(req, res, null);
    const err = url.searchParams.get('error');
    const error = err ? t(lang, 'validation.passwordMismatch') : '';
    return sendHtml(res, 200, renderResetPasswordPage({ lang, settings, csrfToken, token, error }), { noReferrer: true }), true;
  }

  if (pathname === '/api/auth/reset-password' && req.method === 'POST') {
    const body = req._parsedBody || { fields: {} };
    const f = body.fields;
    const reqLang = resolveProjectLanguage(f.lang || lang);
    if (!verifyRequestCsrf(req, user, f._csrf)) {
      return sendJson(res, 403, { error: t(reqLang, 'forms.csrfInvalid') }), true;
    }

    const token = String(f.token || '');
    const newPassword = String(f.new_password || '');
    const confirmPassword = String(f.confirm_password || '');
    if (newPassword !== confirmPassword) {
      return sendJson(res, 400, { error: t(reqLang, 'validation.passwordMismatch') }), true;
    }
    const pwCheck = validatePasswordStrength(newPassword, { minLength: cfg.passwordMinLength });
    if (!pwCheck.valid) {
      return sendJson(res, 400, { error: t(reqLang, pwCheck.issues[0]) }), true;
    }

    const tokenHash = hashTokenSha256(token);
    const nowIso = new Date().toISOString();
    const row = queryOne(
      db,
      'SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
      tokenHash,
      nowIso
    );
    if (!row) {
      return sendJson(res, 400, { error: 'Invalid or expired reset token.' }), true;
    }

    withTransaction(db, () => {
      runSql(db, 'UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(newPassword), row.user_id);
      runSql(db, "UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?", row.id);
      runSql(db, "UPDATE user_sessions SET revoked_at = datetime('now') WHERE user_id = ?", row.user_id);
      logSecurityEvent(db, { eventType: 'auth.password.reset_complete', userId: row.user_id, ipAddress: getClientIp(req) });
    });

    if (body.isJson) return sendJson(res, 200, { ok: true }), true;
    return sendRedirect(res, '/login?info=reset'), true;
  }

  return false;
}
