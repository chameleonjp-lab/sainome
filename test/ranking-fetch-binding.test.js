import test from 'node:test';
import assert from 'node:assert/strict';

import { GAME_MODE_IDS } from '../js/game-modes.js';
import { RankingClient } from '../js/ranking-client.js';

const URL = 'https://example.supabase.co';
const KEY = `sb_publishable_${'x'.repeat(28)}`;

function jsonResponse(data) {
  return {
    ok: true,
    status: 200,
    json: async () => data
  };
}

test('ランキングRPCはブラウザ標準fetchをglobalThisを受け手として呼ぶ', async () => {
  let observedThis = null;
  let requestUrl = null;

  const browserLikeFetch = async function (url) {
    observedThis = this;
    requestUrl = url;
    if (this !== globalThis) {
      throw new TypeError('Illegal invocation');
    }
    return jsonResponse({
      accepted: true,
      display_name: 'プレイヤー',
      game_slug: 'sainome_300_seconds',
      normalized_name: 'プレイヤー',
      result_type: 'play',
      reached_wave: 1
    });
  };

  const client = new RankingClient({
    url: URL,
    publishableKey: KEY,
    fetchImpl: browserLikeFetch
  });

  const result = await client.startPlay({
    displayName: 'プレイヤー',
    modeId: GAME_MODE_IDS.THREE_HUNDRED_SECONDS
  });

  assert.equal(observedThis, globalThis);
  assert.equal(requestUrl, `${URL}/rest/v1/rpc/record_game_play`);
  assert.equal(result.started, true);
});
