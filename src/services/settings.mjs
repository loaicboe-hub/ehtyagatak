import { queryAll, queryOne } from '../db/client.mjs';
import { buildWhatsAppLink } from '../../foundation/security/input-sanitizer.mjs';

export function getWebsiteSettings(db) {
  const rows = queryAll(db, 'SELECT setting_key, value_json FROM website_settings');
  const map = {};
  for (const r of rows) {
    try {
      map[r.setting_key] = JSON.parse(r.value_json);
    } catch {
      map[r.setting_key] = {};
    }
  }
  const identity = map.site_identity || {};
  const contact = map.contact_info || {};
  const calc = map.investment_calculator || {
    greenhouse_area_sqm: 360,
    greenhouse_price_egp: 220000,
    min_greenhouses: 3,
    down_payment_percent: 35,
    annual_cycles: 2
  };
  const seo = map.seo_global || {};
  const navigation = map.navigation_layout || {};
  const languages = map.languages_config || { default_language: 'ar', enabled_languages: ['ar', 'en'] };

  return {
    identity,
    contact,
    whatsappUrl: buildWhatsAppLink(contact.whatsapp_number),
    calculator: calc,
    seo,
    navigation,
    languages
  };
}

export function getLocalizedField(val, lang, fallback = '') {
  if (!val) return fallback;
  if (typeof val === 'string') return val;
  return val[lang] || val.ar || val.en || fallback;
}

export function getPageSeo(db, pageKey, lang) {
  const row = queryOne(
    db,
    `SELECT pt.title, pt.seo_title, pt.seo_description, pt.slug, pt.content_json, p.is_visible
     FROM pages p
     JOIN page_translations pt ON pt.page_id = p.id
     WHERE p.page_key = ? AND pt.language_code = ?`,
    pageKey,
    lang
  );
  if (!row) return null;
  let content = {};
  try {
    content = JSON.parse(row.content_json || '{}');
  } catch {
    content = {};
  }
  return { ...row, content };
}

export function getHomepageSections(db, lang) {
  const rows = queryAll(
    db,
    `SELECT hs.section_key, hs.section_type, hst.heading, hst.subheading, hst.body_json, hst.cta_label, hst.cta_url
     FROM homepage_sections hs
     JOIN homepage_section_translations hst ON hst.section_id = hs.id
     WHERE hs.is_visible = 1 AND hst.language_code = ?
     ORDER BY hs.sort_order ASC`,
    lang
  );
  const byKey = {};
  for (const r of rows) {
    let body = {};
    try {
      body = JSON.parse(r.body_json || '{}');
    } catch {
      body = {};
    }
    byKey[r.section_key] = { ...r, body };
  }
  return byKey;
}
