import { ENGLISH_MESSAGES } from './translations-en.js';

export const LANGUAGE_STORAGE_KEY = 'sainome.language.v1';

function safeStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

// Japanese source text is the message ID. Parameters stay separate from the
// message so scores and other changing values use the same translation.
export function translate(source, parameters = {}, language = 'ja') {
  const message = language === 'en' && Object.hasOwn(ENGLISH_MESSAGES, source)
    ? ENGLISH_MESSAGES[source]
    : source;
  return message.replace(/\{(\d+)\}/gu, (placeholder, key) => (
    Object.hasOwn(parameters, key) ? String(parameters[key]) : placeholder
  ));
}

export function createI18n({ storage = safeStorage() } = {}) {
  let language = 'ja';
  try {
    if (storage?.getItem(LANGUAGE_STORAGE_KEY) === 'en') language = 'en';
  } catch {
    // Language selection also works when browser storage is unavailable.
  }

  return Object.freeze({
    getLanguage: () => language,
    setLanguage(next) {
      if (next !== 'ja' && next !== 'en') return;
      language = next;
      try {
        storage?.setItem(LANGUAGE_STORAGE_KEY, language);
      } catch {
        // Keep the selection for this page even if it cannot be persisted.
      }
    },
    t: (source, parameters) => translate(source, parameters, language)
  });
}

const i18n = createI18n();
export const { getLanguage, setLanguage, t } = i18n;
const originalContent = new WeakMap();

export function applyTranslations(root = globalThis.document) {
  for (const element of root.querySelectorAll('[data-i18n], [data-i18n-attrs]')) {
    let original = originalContent.get(element);
    if (!original) {
      original = { attributes: {} };
      if (element.hasAttribute('data-i18n')) {
        original.text = element.getAttribute('data-i18n') || element.textContent.trim();
      }
      for (const attribute of (element.getAttribute('data-i18n-attrs') || '').split(/\s+/u).filter(Boolean)) {
        original.attributes[attribute] = element.getAttribute(attribute);
      }
      originalContent.set(element, original);
    }
    if (original.text !== undefined) element.textContent = t(original.text);
    for (const [attribute, source] of Object.entries(original.attributes)) {
      element.setAttribute(attribute, t(source));
    }
  }
  if (root.documentElement) root.documentElement.lang = getLanguage();
}
