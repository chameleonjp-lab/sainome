import { ENGLISH_MESSAGES } from './translations-en.js';
import es from './locales/es.js';
import ptBR from './locales/pt-BR.js';
import zhHans from './locales/zh-Hans.js';
import fr from './locales/fr.js';
import de from './locales/de.js';
import ko from './locales/ko.js';
import ru from './locales/ru.js';
import it from './locales/it.js';
import zhHant from './locales/zh-Hant.js';
import id from './locales/id.js';
import tr from './locales/tr.js';
import vi from './locales/vi.js';
import th from './locales/th.js';

// Japanese source messages are their own translations. The original English
// headings also have Japanese equivalents so every visible heading switches.
const ja = Object.freeze({
  ...Object.fromEntries(Object.keys(ENGLISH_MESSAGES).map((source) => [source, source])),
  '300 SECOND PUZZLE': '300秒のパズル',
  'TIME': '時間',
  'SCORE': 'スコア',
  'CLEAR': '消去数',
  'READY': '準備',
  'HOW TO PLAY': '遊び方',
  'GAME PAUSED': '一時停止中',
  'TIME UP': '時間切れ',
  'RETIRED': 'リタイア'
});

export const TRANSLATIONS = Object.freeze({
  ja, en: ENGLISH_MESSAGES, es, 'pt-BR': ptBR, 'zh-Hans': zhHans,
  fr, de, ko, ru, it, 'zh-Hant': zhHant, id, tr, vi, th
});
