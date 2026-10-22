import test from 'node:test';
import assert from 'node:assert/strict';
import { describeBestOutcome } from '../js/best-records.js';
import { createHomeShareContent, createResultShareContent } from '../js/result-share.js';
import { describeRankingFailure, setupRankingStatusUi, shouldEnableRankingRetry } from '../js/ranking-status-ui.js';
import { setLanguage } from '../js/i18n.js';

test('English results describe every personal-best outcome', () => {
  const cases = [
    ['first', 'First record'],
    ['new', 'New personal best! +1,200 points'],
    ['tie', 'Personal best matched'],
    ['lower', '1,200 points to your personal best']
  ];
  for (const [status, expected] of cases) {
    assert.equal(describeBestOutcome(
      { status, difference: 1200 },
      (value) => value.toLocaleString('en-US'),
      'en'
    ), expected);
  }
});

test('English sharing includes translated rules, score and cleared dice', () => {
  const pageUrl = 'https://example.com/sainome/?test=1#result';
  const home = createHomeShareContent({ pageUrl, language: 'en' });
  assert.equal(home.title, 'Sainome');
  assert.match(home.text, /300-second 3D browser puzzle/);
  const result = createResultShareContent({
    result: { modeId: '300-seconds', score: 900, clearedDice: 3 },
    recordMessage: 'First record',
    pageUrl,
    language: 'en'
  });
  assert.match(result.text, /900 points in Sainome's 300-second mode!/);
  assert.match(result.text, /Dice cleared: 3/);
  assert.equal(result.url, 'https://example.com/sainome/');
  assert.doesNotMatch(result.text, /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u);
});

test('English ranking failures still allow retries and block them while sending', () => {
  const detail = { code: 'network', retryable: true, rpcName: 'submit_score' };
  assert.match(describeRankingFailure(detail, 'en').summary, /network/i);
  assert.equal(shouldEnableRankingRetry({
    detail,
    statusText: 'Could not submit your score. Check your connection.',
    buttonText: 'Resend score'
  }), true);
  assert.equal(shouldEnableRankingRetry({
    detail,
    statusText: 'Submitting your score…',
    buttonText: 'Connecting…'
  }), false);
});

test('ranking failure rendering settles after mutations and keeps leaderboard load errors visible', async () => {
  setLanguage('en');
  const listeners = new Map();
  let render;
  let pendingMutation = false;
  let buttonText = 'Resend score';
  const status = { textContent: 'Could not submit your score. Check your connection.' };
  const detailOutput = { textContent: '', hidden: true };
  const retry = {
    hidden: true,
    disabled: true,
    get textContent() { return buttonText; },
    set textContent(value) {
      buttonText = value;
      // Replacing a text node schedules MutationObserver even for the same text.
      pendingMutation = true;
    },
    setAttribute() {},
    removeAttribute() {}
  };
  const elements = new Map([
    ['#result-ranking-status', status],
    ['#result-ranking-error-detail', detailOutput],
    ['#result-ranking-retry', retry]
  ]);
  const cleanup = setupRankingStatusUi({
    documentObject: { querySelector: (selector) => elements.get(selector) },
    windowObject: {
      addEventListener: (name, callback) => listeners.set(name, callback),
      removeEventListener: (name) => listeners.delete(name),
      MutationObserver: class {
        constructor(callback) { render = callback; }
        observe() {}
        disconnect() {}
      }
    }
  });
  try {
    listeners.get('sainome:ranking-failure')({
      detail: { code: 'network', retryable: true, rpcName: 'submit_score' }
    });
    await Promise.resolve();
    for (let count = 0; pendingMutation && count < 5; count += 1) {
      pendingMutation = false;
      render();
    }
    assert.equal(pendingMutation, false, 'The failure UI must stop scheduling its own updates');
    assert.equal(retry.hidden, false);
    assert.equal(retry.disabled, false);
    status.textContent = 'Score submitted, but could not load the leaderboard.';
    render();
    assert.equal(detailOutput.hidden, false);
    status.textContent = 'Score submitted';
    render();
    assert.equal(detailOutput.hidden, true);
  } finally {
    cleanup();
    setLanguage('ja');
  }
});
