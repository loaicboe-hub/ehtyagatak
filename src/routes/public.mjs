import { queryAll, queryOne, runSql } from '../db/client.mjs';
import { getHomepageSections, getPageSeo, getWebsiteSettings, getLocalizedField } from '../services/settings.mjs';
import { renderPublicLayout } from '../views/layout.mjs';
import {
  renderCalculatorWidget,
  renderContactPage,
  renderFaqPage,
  renderHomePage,
  renderHowItWorksPage,
  renderInvestPage,
  renderNewsDetailPage,
  renderNewsPage,
  renderProjectDetailPage,
  renderProjectsPage,
  renderServicesPage,
  renderStandardPage
} from '../views/public.mjs';
import { sendHtml, sendJson, sendRedirect } from '../http/response.mjs';
import { ensureCsrfContext, getClientIp, getSecurityHeaders, verifyRequestCsrf } from '../security/auth.mjs';
import { getAppRateLimiter } from '../security/rate-limit.mjs';
import { resolveProjectLanguage, t } from '../i18n/index.mjs';
import { validatePayload } from '../../foundation/forms/validator.mjs';
import { escapeHtml, stripControlChars } from '../../foundation/security/input-sanitizer.mjs';
import { getEnvConfig } from '../config/env.mjs';

function getPublishedProjects(db, lang) {
  return queryAll(
    db,
    `SELECT p.*, pt.title, pt.summary, pt.description, pt.crop_types
     FROM projects p
     JOIN project_translations pt ON pt.project_id = p.id AND pt.language_code = ?
     WHERE p.is_published = 1
     ORDER BY p.is_featured DESC, p.sort_order ASC, p.id DESC`,
    lang
  );
}

function getPublishedNews(db, lang) {
  return queryAll(
    db,
    `SELECT n.*, nt.title, nt.excerpt, nt.body
     FROM news_posts n
     JOIN news_post_translations nt ON nt.post_id = n.id AND nt.language_code = ?
     WHERE n.is_published = 1
     ORDER BY n.published_at DESC`,
    lang
  );
}

function getVisibleFaqs(db, lang) {
  return queryAll(
    db,
    `SELECT f.*, ft.question, ft.answer
     FROM faqs f
     JOIN faq_translations ft ON ft.faq_id = f.id AND ft.language_code = ?
     WHERE f.is_visible = 1
     ORDER BY f.sort_order ASC, f.id ASC`,
    lang
  );
}

export async function handlePublicRequest({ req, res, url, pathname, lang, db, user }) {
  const settings = getWebsiteSettings(db);

  // Dynamic robots.txt & sitemap.xml
  if (pathname === '/robots.txt') {
    const cfg = getEnvConfig();
    const origin = (settings.seo.canonical_origin || cfg.appUrl || '').replace(/\/+$/, '');
    const allow = settings.seo.robots_allow_indexing !== false;
    const lines = [
      'User-agent: *',
      allow ? 'Allow: /' : 'Disallow: /',
      'Disallow: /admin',
      'Disallow: /portal',
      'Disallow: /api/',
      `Sitemap: ${origin}/sitemap.xml`
    ];
    res.writeHead(200, { ...getSecurityHeaders(), 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(lines.join('\n') + '\n');
    return true;
  }

  if (pathname === '/sitemap.xml') {
    const cfg = getEnvConfig();
    const origin = (settings.seo.canonical_origin || cfg.appUrl || '').replace(/\/+$/, '');
    const staticSlugs = ['', '/about', '/projects', '/invest', '/how-it-works', '/services', '/news', '/faq', '/contact', '/policies'];
    const urls = [];
    for (const s of staticSlugs) {
      for (const l of ['ar', 'en']) {
        urls.push(`${origin}/${l}${s}`);
      }
    }
    const projs = queryAll(db, 'SELECT slug FROM projects WHERE is_published = 1');
    for (const p of projs) {
      urls.push(`${origin}/ar/projects/${p.slug}`, `${origin}/en/projects/${p.slug}`);
    }
    const posts = queryAll(db, 'SELECT slug FROM news_posts WHERE is_published = 1');
    for (const n of posts) {
      urls.push(`${origin}/ar/news/${n.slug}`, `${origin}/en/news/${n.slug}`);
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${escapeHtml(u)}</loc></url>`)
      .join('\n')}\n</urlset>\n`;
    res.writeHead(200, { ...getSecurityHeaders(), 'Content-Type': 'application/xml; charset=utf-8' });
    res.end(xml);
    return true;
  }

  // Public JSON APIs
  if (pathname === '/api/public/settings' && req.method === 'GET') {
    return sendJson(res, 200, {
      identity: settings.identity,
      contact: settings.contact,
      whatsappUrl: settings.whatsappUrl,
      calculator: settings.calculator,
      languages: settings.languages
    }), true;
  }

  if (pathname === '/api/public/projects' && req.method === 'GET') {
    return sendJson(res, 200, { projects: getPublishedProjects(db, lang) }), true;
  }

  if (pathname === '/api/public/news' && req.method === 'GET') {
    return sendJson(res, 200, { posts: getPublishedNews(db, lang) }), true;
  }

  if (pathname === '/api/public/faqs' && req.method === 'GET') {
    return sendJson(res, 200, { faqs: getVisibleFaqs(db, lang) }), true;
  }

  if (pathname === '/api/public/leads' && req.method === 'POST') {
    const body = req._parsedBody || { fields: {} };
    const f = body.fields;
    const reqLang = resolveProjectLanguage(f.lang || lang);
    const redirectBack = typeof f.redirect_to === 'string' && f.redirect_to.startsWith('/') && !f.redirect_to.startsWith('//')
      ? f.redirect_to
      : `/${reqLang}/contact`;

    if (!verifyRequestCsrf(req, user, f._csrf)) {
      if (body.isJson) return sendJson(res, 403, { error: t(reqLang, 'forms.csrfInvalid') }), true;
      return sendRedirect(res, `${redirectBack}?error=csrf`), true;
    }

    const limiter = getAppRateLimiter(db);
    const ip = getClientIp(req);
    const rate = await limiter.check('publicForms', ip);
    if (!rate.allowed) {
      if (body.isJson) return sendJson(res, 429, { error: t(reqLang, 'forms.rateLimited') }), true;
      return sendRedirect(res, `${redirectBack}?error=rate`), true;
    }

    const leadType = ['investment_request', 'appointment_booking', 'general_inquiry'].includes(f.lead_type)
      ? f.lead_type
      : 'general_inquiry';

    const validation = validatePayload(f, {
      full_name: { required: true, minLength: 2, maxLength: 160 },
      phone: { required: true, type: 'phone' },
      email: { required: leadType === 'general_inquiry', type: 'email' }
    });
    if (!validation.valid) {
      if (body.isJson) return sendJson(res, 400, { error: 'validation_failed', details: validation.errors }), true;
      return sendRedirect(res, `${redirectBack}?error=validation`), true;
    }

    const calc = settings.calculator;
    let count = f.greenhouse_count ? Number.parseInt(f.greenhouse_count, 10) : null;
    let estTotal = null;
    let estDown = null;
    if (leadType === 'investment_request') {
      const minUnits = Number(calc.min_greenhouses || 3);
      if (!Number.isFinite(count) || count < minUnits) count = minUnits;
      estTotal = count * Number(calc.greenhouse_price_egp || 220000);
      estDown = Math.round((estTotal * Number(calc.down_payment_percent || 35)) / 100);
    }

    const projectId = f.project_id && /^\d+$/.test(String(f.project_id)) ? Number.parseInt(f.project_id, 10) : null;
    const validProj = projectId ? queryOne(db, 'SELECT id FROM projects WHERE id = ?', projectId) : null;

    const leadId = runSql(
      db,
      `INSERT INTO investment_leads
        (lead_type, full_name, phone, email, project_id, greenhouse_count, estimated_total_egp, estimated_down_payment_egp, preferred_date, preferred_time, notes, language_code, status, source_ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
      leadType,
      stripControlChars(f.full_name),
      stripControlChars(f.phone),
      f.email ? stripControlChars(f.email).toLowerCase() : null,
      validProj ? validProj.id : null,
      count,
      estTotal,
      estDown,
      f.preferred_date ? stripControlChars(f.preferred_date).slice(0, 20) : null,
      f.preferred_time ? stripControlChars(f.preferred_time).slice(0, 40) : null,
      f.notes ? stripControlChars(f.notes).slice(0, 2000) : null,
      reqLang,
      ip
    ).lastInsertRowid;

    if (leadType === 'general_inquiry' && f.email) {
      runSql(
        db,
        `INSERT INTO contact_inquiries (full_name, email, phone, subject, message, language_code, status, source_ip)
         VALUES (?, ?, ?, ?, ?, ?, 'new', ?)`,
        stripControlChars(f.full_name),
        stripControlChars(f.email).toLowerCase(),
        stripControlChars(f.phone),
        'Public Contact Form',
        stripControlChars(f.notes || '').slice(0, 2000) || '-',
        reqLang,
        ip
      );
    }

    if (body.isJson) {
      return sendJson(res, 201, { ok: true, id: Number(leadId), message: t(reqLang, 'forms.submitSuccess') }), true;
    }
    return sendRedirect(res, `${redirectBack}?submitted=1`), true;
  }

  // Public SSR Page Routes
  if (req.method !== 'GET') return false;

  const routePath = pathname.replace(/^\/(ar|en)(?=\/|$)/, '') || '/';
  const csrfToken = ensureCsrfContext(req, res, user);

  let flash = null;
  if (url.searchParams.get('submitted') === '1') {
    flash = { type: 'success', message: t(lang, 'forms.submitSuccess') };
  } else if (url.searchParams.get('error') === 'csrf') {
    flash = { type: 'danger', message: t(lang, 'forms.csrfInvalid') };
  } else if (url.searchParams.get('error') === 'rate') {
    flash = { type: 'warning', message: t(lang, 'forms.rateLimited') };
  } else if (url.searchParams.get('error') === 'validation') {
    flash = { type: 'danger', message: t(lang, 'validation.required') };
  }

  if (routePath === '/') {
    const seo = getPageSeo(db, 'home', lang);
    const sections = getHomepageSections(db, lang);
    const projects = getPublishedProjects(db, lang).slice(0, 4);
    const news = getPublishedNews(db, lang).slice(0, 3);
    const faqs = getVisibleFaqs(db, lang).slice(0, 4);
    const html = renderPublicLayout({
      lang,
      title: seo?.seo_title || getLocalizedField(settings.seo.default_title, lang, t(lang, 'brand.name')),
      description: seo?.seo_description || getLocalizedField(settings.seo.default_description, lang, ''),
      currentPath: pathname,
      settings,
      user,
      csrfToken,
      flash,
      bodyHtml: renderHomePage({ lang, settings, sections, projects, news, faqs })
    });
    return sendHtml(res, 200, html), true;
  }

  if (routePath === '/about' || routePath === '/policies') {
    const key = routePath.slice(1);
    const page = getPageSeo(db, key, lang);
    if (!page || !page.is_visible) return false;
    const html = renderPublicLayout({
      lang,
      title: page.seo_title || page.title,
      description: page.seo_description || '',
      currentPath: pathname,
      settings,
      user,
      csrfToken,
      flash,
      bodyHtml: renderStandardPage({ lang, page, pageKey: key })
    });
    return sendHtml(res, 200, html), true;
  }

  if (routePath === '/projects') {
    const page = getPageSeo(db, 'projects', lang);
    const projects = getPublishedProjects(db, lang);
    return sendHtml(res, 200, renderPublicLayout({
      lang,
      title: page?.seo_title || t(lang, 'nav.projects'),
      description: page?.seo_description || '',
      currentPath: pathname,
      settings,
      user,
      csrfToken,
      flash,
      bodyHtml: renderProjectsPage({ lang, projects })
    })), true;
  }

  if (routePath.startsWith('/projects/')) {
    const slug = decodeURIComponent(routePath.slice('/projects/'.length));
    const project = queryOne(
      db,
      `SELECT p.*, pt.title, pt.summary, pt.description, pt.crop_types
       FROM projects p
       JOIN project_translations pt ON pt.project_id = p.id AND pt.language_code = ?
       WHERE p.slug = ? AND p.is_published = 1`,
      lang,
      slug
    );
    if (!project) return false;
    return sendHtml(res, 200, renderPublicLayout({
      lang,
      title: project.title,
      description: project.summary,
      currentPath: pathname,
      settings,
      user,
      csrfToken,
      flash,
      bodyHtml: renderProjectDetailPage({ lang, project })
    })), true;
  }

  if (routePath === '/invest') {
    const page = getPageSeo(db, 'invest', lang);
    const projects = getPublishedProjects(db, lang);
    return sendHtml(res, 200, renderPublicLayout({
      lang,
      title: page?.seo_title || t(lang, 'nav.invest'),
      description: page?.seo_description || '',
      currentPath: pathname,
      settings,
      user,
      csrfToken,
      flash,
      bodyHtml: renderInvestPage({ lang, settings, projects, csrfToken })
    })), true;
  }

  if (routePath === '/how-it-works') {
    const page = getPageSeo(db, 'how-it-works', lang);
    return sendHtml(res, 200, renderPublicLayout({
      lang,
      title: page?.seo_title || t(lang, 'nav.howItWorks'),
      description: page?.seo_description || '',
      currentPath: pathname,
      settings,
      user,
      csrfToken,
      flash,
      bodyHtml: renderHowItWorksPage({ lang })
    })), true;
  }

  if (routePath === '/services') {
    const page = getPageSeo(db, 'services', lang);
    return sendHtml(res, 200, renderPublicLayout({
      lang,
      title: page?.seo_title || t(lang, 'nav.services'),
      description: page?.seo_description || '',
      currentPath: pathname,
      settings,
      user,
      csrfToken,
      flash,
      bodyHtml: renderServicesPage({ lang })
    })), true;
  }

  if (routePath === '/news') {
    const page = getPageSeo(db, 'news', lang);
    const posts = getPublishedNews(db, lang);
    return sendHtml(res, 200, renderPublicLayout({
      lang,
      title: page?.seo_title || t(lang, 'nav.news'),
      description: page?.seo_description || '',
      currentPath: pathname,
      settings,
      user,
      csrfToken,
      flash,
      bodyHtml: renderNewsPage({ lang, posts })
    })), true;
  }

  if (routePath.startsWith('/news/')) {
    const slug = decodeURIComponent(routePath.slice('/news/'.length));
    const post = queryOne(
      db,
      `SELECT n.*, nt.title, nt.excerpt, nt.body
       FROM news_posts n
       JOIN news_post_translations nt ON nt.post_id = n.id AND nt.language_code = ?
       WHERE n.slug = ? AND n.is_published = 1`,
      lang,
      slug
    );
    if (!post) return false;
    return sendHtml(res, 200, renderPublicLayout({
      lang,
      title: post.title,
      description: post.excerpt,
      currentPath: pathname,
      settings,
      user,
      csrfToken,
      flash,
      bodyHtml: renderNewsDetailPage({ lang, post })
    })), true;
  }

  if (routePath === '/faq') {
    const page = getPageSeo(db, 'faq', lang);
    const faqs = getVisibleFaqs(db, lang);
    return sendHtml(res, 200, renderPublicLayout({
      lang,
      title: page?.seo_title || t(lang, 'nav.faq'),
      description: page?.seo_description || '',
      currentPath: pathname,
      settings,
      user,
      csrfToken,
      flash,
      bodyHtml: renderFaqPage({ lang, faqs })
    })), true;
  }

  if (routePath === '/contact') {
    const page = getPageSeo(db, 'contact', lang);
    const projects = getPublishedProjects(db, lang);
    return sendHtml(res, 200, renderPublicLayout({
      lang,
      title: page?.seo_title || t(lang, 'nav.contact'),
      description: page?.seo_description || '',
      currentPath: pathname,
      settings,
      user,
      csrfToken,
      flash,
      bodyHtml: renderContactPage({ lang, settings, projects, csrfToken })
    })), true;
  }

  return false;
}
