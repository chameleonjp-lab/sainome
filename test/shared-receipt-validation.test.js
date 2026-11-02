import test from 'node:test';
import assert from 'node:assert/strict';
import { RankingClient } from '../js/ranking-client.js';
import { submitPendingDirectRanking } from '../js/ranking-submission-flow.js';

const submission = { kind: 'direct-name', submissionId: '11111111-1111-4111-8111-111111111111', clientVersion: 'sainome-web-3', displayName: 'Alice', result: { modeId: '300-seconds', score: 100 } };
const good = { accepted: true, result_normalized_name: 'Alice', result_display_name: 'Alice', result_first_score: 0, result_best_score: 100, result_play_count: 1, is_first_play: true, is_new_best: true, was_duplicate: false };
function client(row) { return new RankingClient({ url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test_test_test', fetchImpl: async () => ({ ok: true, status: 200, json: async () => [row] }) }); }

for (const [name, overrides] of Object.entries({
  'play count exceeds SQL integer': { result_play_count: 2147483648 },
  'play count is fractional': { result_play_count: 1.5 },
  'play count is string': { result_play_count: '1' },
  'missing normalized name': { result_normalized_name: undefined },
  'wrong normalized name': { result_normalized_name: 'Bob' },
  'missing first score': { result_first_score: undefined },
  'negative first score': { result_first_score: -1 },
  'fractional first score': { result_first_score: 0.5 },
  'first score out of range': { result_first_score: 100000001 },
  'best below submitted score': { result_best_score: 99 },
  'best below first score': { result_first_score: 101 },
  'string first score': { result_first_score: '0' }
})) {
  test(`invalid receipt ${name} must retain the pending submission`, async () => {
    let cleanups = 0;
    await assert.rejects(submitPendingDirectRanking({ rankingClient: client({ ...good, ...overrides }), submission, pendingSubmissions: { markAccepted: async () => { cleanups++; } } }), error => error.code === 'invalid-response');
    assert.equal(cleanups, 0);
  });
}

for (const wasDuplicate of [false, true]) {
  test(`complete receipt accepts provisional first_score zero, duplicate=${wasDuplicate}`, async () => {
    let cleanups = 0;
    const result = await submitPendingDirectRanking({ rankingClient: client({ ...good, was_duplicate: wasDuplicate }), submission, pendingSubmissions: { markAccepted: async () => { cleanups++; return { status: 'removed' }; } } });
    assert.equal(result.outcome.accepted, true);
    assert.equal(result.outcome.wasDuplicate, wasDuplicate);
    assert.equal(cleanups, 1);
  });
}

test('SQL integer maximum play count remains valid', async () => {
  let cleanups = 0;
  const result = await submitPendingDirectRanking({ rankingClient: client({ ...good, result_play_count: 2147483647 }), submission, pendingSubmissions: { markAccepted: async () => { cleanups++; return { status: 'removed' }; } } });
  assert.equal(result.outcome.accepted, true);
  assert.equal(cleanups, 1);
});
