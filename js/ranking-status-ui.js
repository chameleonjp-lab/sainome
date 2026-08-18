import { RANKING_FAILURE_EVENT } from './ranking-client.js';

const SUBMIT_RPCS = new Set(['submit_score', 'submit_score_once']);
const SUCCESS_PATTERN = /(?:初回記録を登録|自己ベストを更新|記録を登録しました)/u;
const FAILURE_PATTERN = /(?:記録を送信できません|ランキングを読み込めません)/u;
const PENDING_PATTERN = /(?:送信しています|通信中|読み込んでいます)/u;

function textOrNull(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function statusLabel(status) {
  return Number.isInteger(status) ? `HTTP ${status}` : null;
}

export function describeRankingFailure(detail = {}) {
  const status = Number.isInteger(detail.status) ? detail.status : null;
  const serverMessage = textOrNull(detail.serverMessage)?.toLowerCase() ?? '';
  let summary;

  if (detail.code === 'network') {
    summary = 'ネットワークへ接続できませんでした。通信状態を確認して再送してください。';
  } else if (detail.code === 'timeout') {
    summary = 'ランキング送信が時間切れになりました。通信状態を確認して再送してください。';
  } else if (detail.code === 'invalid-response') {
    summary = 'ランキングサーバーから確認できない応答が返りました。';
  } else if (status === 401 || status === 403) {
    summary = 'ランキングへの接続が権限エラーで拒否されました。';
  } else if (
    serverMessage.includes('game not found')
    || serverMessage.includes('game_not_found')
    || status === 404
  ) {
    summary = 'ランキング対象のゲーム登録をサーバーで確認できませんでした。';
  } else if (
    serverMessage.includes('display name')
    || serverMessage.includes('display_name')
    || serverMessage.includes('name')
  ) {
    summary = 'ランキング名がサーバーの条件に合いませんでした。';
  } else if (status === 409) {
    summary = '同じ記録との競合が発生しました。登録状態を確認して再送してください。';
  } else if (status === 429) {
    summary = '短時間に送信が集中しました。少し間を空けて再送してください。';
  } else if (status !== null && status >= 500) {
    summary = 'ランキングサーバーで一時的な問題が発生しました。再送してください。';
  } else if (status !== null && status >= 400) {
    summary = '送信内容がランキングサーバーに受け付けられませんでした。';
  } else {
    summary = 'ランキング処理を完了できませんでした。';
  }

  const diagnostic = [
    textOrNull(detail.rpcName),
    statusLabel(status),
    textOrNull(detail.serverCode),
    textOrNull(detail.gameSlug)
  ].filter(Boolean).join(' / ');

  return Object.freeze({
    summary,
    diagnostic,
    retryable: detail.retryable === true,
    isScoreSubmission: SUBMIT_RPCS.has(detail.rpcName)
  });
}

export function shouldEnableRankingRetry({
  detail,
  statusText = '',
  buttonText = ''
}) {
  const described = describeRankingFailure(detail);
  return described.retryable
    && described.isScoreSubmission
    && FAILURE_PATTERN.test(statusText)
    && !PENDING_PATTERN.test(statusText)
    && buttonText !== '通信中…';
}

export function setupRankingStatusUi({
  windowObject = globalThis,
  documentObject = globalThis.document
} = {}) {
  if (!documentObject?.querySelector || typeof windowObject?.addEventListener !== 'function') {
    return () => {};
  }

  const status = documentObject.querySelector('#result-ranking-status');
  const detailOutput = documentObject.querySelector('#result-ranking-error-detail');
  const retryButton = documentObject.querySelector('#result-ranking-retry');
  if (!status || !detailOutput || !retryButton) return () => {};

  let lastFailure = null;

  const render = () => {
    const statusText = status.textContent ?? '';
    if (SUCCESS_PATTERN.test(statusText)) {
      lastFailure = null;
      detailOutput.hidden = true;
      detailOutput.textContent = '';
      retryButton.removeAttribute('data-failure-retry');
      return;
    }

    if (!lastFailure || !FAILURE_PATTERN.test(statusText) || PENDING_PATTERN.test(statusText)) {
      detailOutput.hidden = true;
      detailOutput.textContent = '';
      return;
    }

    const described = describeRankingFailure(lastFailure);
    detailOutput.textContent = described.diagnostic
      ? `${described.summary} 診断: ${described.diagnostic}`
      : described.summary;
    detailOutput.hidden = false;

    if (shouldEnableRankingRetry({
      detail: lastFailure,
      statusText,
      buttonText: retryButton.textContent ?? ''
    })) {
      retryButton.hidden = false;
      retryButton.disabled = false;
      retryButton.textContent = '記録を再送する';
      retryButton.setAttribute('data-failure-retry', 'true');
    }
  };

  const onFailure = (event) => {
    lastFailure = event?.detail && typeof event.detail === 'object'
      ? event.detail
      : null;
    queueMicrotask(render);
    windowObject.setTimeout?.(render, 0);
  };

  windowObject.addEventListener(RANKING_FAILURE_EVENT, onFailure);
  const observer = typeof windowObject.MutationObserver === 'function'
    ? new windowObject.MutationObserver(render)
    : null;
  observer?.observe(status, { childList: true, subtree: true, characterData: true });
  observer?.observe(retryButton, {
    attributes: true,
    attributeFilter: ['hidden', 'disabled'],
    childList: true,
    subtree: true
  });
  render();

  return () => {
    windowObject.removeEventListener(RANKING_FAILURE_EVENT, onFailure);
    observer?.disconnect();
  };
}

if (typeof document !== 'undefined') {
  setupRankingStatusUi();
}
