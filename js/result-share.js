import { getGameMode } from './game-modes.js';

export const RESULT_SHARE_STATUSES = Object.freeze({
  SHARED: 'shared',
  COPIED: 'copied',
  CANCELLED: 'cancelled',
  FAILED: 'failed'
});

function requireNonNegativeSafeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
  return value;
}

function setButtonClass(button, className) {
  if (!button) return;
  if (typeof button.setAttribute === 'function') {
    button.setAttribute('class', className);
    return;
  }
  button.className = className;
}

export function configureShareEntryPoints(root = globalThis.document) {
  if (!root || typeof root.querySelector !== 'function') {
    return Object.freeze({ home: false, result: false });
  }

  const homeShareButton = root.querySelector('#home-share-button');
  const homeLabLink = root.querySelector('#home-lab-link');
  let homeConfigured = false;
  if (homeShareButton) {
    homeShareButton.textContent = 'ゲームをシェア';
    setButtonClass(homeShareButton, 'lab-link home-lab-link');
    homeShareButton.setAttribute?.('aria-label', 'サイノメをシェア');

    const parent = homeLabLink?.parentNode;
    if (
      parent
      && typeof parent.insertBefore === 'function'
      && homeShareButton !== homeLabLink
      && homeShareButton.nextSibling !== homeLabLink
    ) {
      parent.insertBefore(homeShareButton, homeLabLink);
    }
    homeConfigured = true;
  }

  const resultShareButton = root.querySelector('#result-share-button');
  let resultConfigured = false;
  if (resultShareButton) {
    resultShareButton.textContent = '結果をシェア';
    setButtonClass(resultShareButton, 'secondary-button');
    resultShareButton.setAttribute?.('aria-label', '今回のスコアをシェア');
    resultConfigured = true;
  }

  return Object.freeze({
    home: homeConfigured,
    result: resultConfigured
  });
}

export function normalizeShareUrl(pageUrl) {
  const url = new URL(pageUrl);
  url.search = '';
  url.hash = '';
  return url.href;
}

export function createHomeShareContent({ pageUrl }) {
  const url = normalizeShareUrl(pageUrl);
  const text = [
    'サイノメ',
    'サイコロを転がし、上面の目と同じ数以上を縦横につなげて消す、300秒の3Dブラウザパズルゲームです。',
    `URL: ${url}`,
    '#サイノメ'
  ].join('\n');

  return Object.freeze({
    title: 'サイノメ',
    text,
    url,
    copyText: text
  });
}

export function createResultShareContent({
  result,
  recordMessage,
  pageUrl,
  formatNumber = String
}) {
  if (!result || typeof recordMessage !== 'string' || !recordMessage.trim()) {
    throw new TypeError('result and record message are required');
  }

  const mode = getGameMode(result.modeId);
  const score = requireNonNegativeSafeInteger(result.score, 'score');
  const clearedDice = requireNonNegativeSafeInteger(result.clearedDice, 'clearedDice');
  const url = normalizeShareUrl(pageUrl);
  const text = [
    `サイノメの${mode.label}モードで${formatNumber(score)}点！`,
    `消した数${formatNumber(clearedDice)}個`,
    recordMessage.trim(),
    `URL: ${url}`,
    '#サイノメ'
  ].join('\n');

  return Object.freeze({
    title: 'サイノメ',
    text,
    url,
    copyText: text
  });
}

function supportsShare(navigatorObject, shareData) {
  if (typeof navigatorObject?.share !== 'function') return false;
  if (typeof navigatorObject.canShare !== 'function') return true;

  try {
    return navigatorObject.canShare(shareData);
  } catch {
    return false;
  }
}

async function copyShareText(navigatorObject, text) {
  if (typeof navigatorObject?.clipboard?.writeText !== 'function') return false;

  try {
    await navigatorObject.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareResult(content, navigatorObject = globalThis.navigator) {
  const shareData = {
    title: content.title,
    text: content.text,
    url: content.url
  };

  if (supportsShare(navigatorObject, shareData)) {
    try {
      await navigatorObject.share(shareData);
      return RESULT_SHARE_STATUSES.SHARED;
    } catch (error) {
      if (error?.name === 'AbortError') {
        return RESULT_SHARE_STATUSES.CANCELLED;
      }
    }
  }

  const copied = await copyShareText(navigatorObject, content.copyText);
  return copied ? RESULT_SHARE_STATUSES.COPIED : RESULT_SHARE_STATUSES.FAILED;
}

if (typeof globalThis.document?.querySelector === 'function') {
  configureShareEntryPoints(globalThis.document);
}
