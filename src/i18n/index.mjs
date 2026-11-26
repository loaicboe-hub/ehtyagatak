import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../config/env.mjs';
import { formatTranslation, resolveTranslationValue } from '../../foundation/i18n/i18n-helper.mjs';

export const PROJECT_LANGUAGES = ['ar', 'en'];
export const DEFAULT_PROJECT_LANGUAGE = 'ar';

const dictionaries = {
  ar: JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'src/i18n/ar.json'), 'utf8')),
  en: JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'src/i18n/en.json'), 'utf8'))
};

export function resolveProjectLanguage(requested) {
  const code = String(requested || '').toLowerCase().slice(0, 2);
  return PROJECT_LANGUAGES.includes(code) ? code : DEFAULT_PROJECT_LANGUAGE;
}

export function getProjectDirection(lang) {
  return resolveProjectLanguage(lang) === 'ar' ? 'rtl' : 'ltr';
}

export function getDictionary(lang) {
  return dictionaries[resolveProjectLanguage(lang)];
}

export function t(lang, key, params = null) {
  const dict = getDictionary(lang);
  const val = resolveTranslationValue(dict, key, params);
  return typeof val === 'string' ? val : key;
}

export function formatNumber(lang, num, decimals = 0) {
  const n = Number(num || 0);
  const locale = resolveProjectLanguage(lang) === 'ar' ? 'ar-EG' : 'en-US';
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(n);
}

export function buildLanguageSwitchUrl(pathname, targetLang) {
  const lang = resolveProjectLanguage(targetLang);
  const clean = String(pathname || '/').split('?')[0];
  const parts = clean.replace(/^\/+/, '').split('/').filter(Boolean);
  if (parts[0] === 'ar' || parts[0] === 'en') {
    parts[0] = lang;
    return `/${parts.join('/')}`;
  }
  return parts.length === 0 ? `/${lang}` : `/${lang}/${parts.join('/')}`;
}

export { formatTranslation };
