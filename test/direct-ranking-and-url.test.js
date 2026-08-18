import test from 'node:test';
import assert from 'node:assert/strict';

import { prepareDirectRankingSubmission } from '../js/ranking-submission-flow.js';
import {
  SAINOME_GAME_URL,
  normalizeSainomeGameUrl
} from '../js/supabase-config.js';

const RESULT = Object.freeze({
  modeId: '300-seconds',
  score: 54_000,
  clearedDice: 20,
  maxChain: 3,
  endedReason: 'retired'
});

test('direct score submission is never blocked by local queue rejection', async () => {
  const submission = await prepareDirectRankingSubmission({
    pendingSubmissions: {
      enqueue: async () => ({
        ok: false,
        persisted: false,
        code: 'submission-conflict',
        submission: null
      })
    },
    displayName: 'BE',
    result: RESULT,
    now: () => 100,
    submissionId: 'direct-score-12345678'
  });

  assert.equal(submission.canSubmit, true);
  assert.equal(submission.persisted, false);
  assert.equal(submission.pendingSaveCode, 'submission-conflict');
});

test('uses the canonical public Sainome URL', () => {
  assert.equal(SAINOME_GAME_URL, 'https://chameleonjp-lab.github.io/sainome/');
});

test('removes only the release query parameter from the public URL', () => {
  let replaced = null;
  const changed = normalizeSainomeGameUrl(
    {
      href: 'https://chameleonjp-lab.github.io/sainome/?v=old&sainome-test=release#panel'
    },
    {
      state: { source: 'test' },
      replaceState(state, title, url) {
        replaced = { state, title, url };
      }
    }
  );

  assert.equal(changed, true);
  assert.deepEqual(replaced, {
    state: { source: 'test' },
    title: '',
    url: '/sainome/?sainome-test=release#panel'
  });
});

test('does not rewrite another host or path', () => {
  let called = false;
  const changed = normalizeSainomeGameUrl(
    { href: 'https://example.com/sainome/?v=old' },
    {
      replaceState() {
        called = true;
      }
    }
  );

  assert.equal(changed, false);
  assert.equal(called, false);
});
