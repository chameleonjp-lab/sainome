export const SUPPORTED_LANGUAGES = Object.freeze([
  { id: 'ja', name: '日本語', locale: 'ja-JP' },
  { id: 'en', name: 'English', locale: 'en-US' },
  { id: 'es', name: 'Español', locale: 'es-ES' },
  { id: 'pt-BR', name: 'Português (Brasil)', locale: 'pt-BR' },
  { id: 'zh-Hans', name: '简体中文', locale: 'zh-CN' },
  { id: 'fr', name: 'Français', locale: 'fr-FR' },
  { id: 'de', name: 'Deutsch', locale: 'de-DE' },
  { id: 'ko', name: '한국어', locale: 'ko-KR' },
  { id: 'ru', name: 'Русский', locale: 'ru-RU' },
  { id: 'it', name: 'Italiano', locale: 'it-IT' },
  { id: 'zh-Hant', name: '繁體中文', locale: 'zh-TW' },
  { id: 'id', name: 'Bahasa Indonesia', locale: 'id-ID' },
  { id: 'tr', name: 'Türkçe', locale: 'tr-TR' },
  { id: 'vi', name: 'Tiếng Việt', locale: 'vi-VN' },
  { id: 'th', name: 'ไทย', locale: 'th-TH' }
].map(Object.freeze));

export function isSupportedLanguage(language) {
  return SUPPORTED_LANGUAGES.some(({ id }) => id === language);
}

export function getLanguageLocale(language) {
  return SUPPORTED_LANGUAGES.find(({ id }) => id === language)?.locale ?? 'en-US';
}

export function languageFromLocale(locale) {
  if (typeof locale !== 'string') return null;
  const tag = locale.trim().toLowerCase().replaceAll('_', '-');
  const parts = tag.split('-');
  const base = parts[0];
  if (base === 'zh') {
    if (parts.includes('hant')) return 'zh-Hant';
    if (parts.includes('hans')) return 'zh-Hans';
    return parts.some((part) => ['tw', 'hk', 'mo'].includes(part)) ? 'zh-Hant' : 'zh-Hans';
  }
  if (base === 'pt') return 'pt-BR';
  return isSupportedLanguage(base) ? base : null;
}
