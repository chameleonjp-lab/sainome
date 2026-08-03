import test from 'node:test';
import assert from 'node:assert/strict';

import { GAME_MODE_IDS } from '../js/game-modes.js';
import {
  createSubmissionId,
  RankingClient,
  RankingError,
  RANKING_GAME_SLUGS,
  RANKING_LIMIT
} from '../js/ranking-client.js';

const URL = 'https://example.supabase.co';
const KEY = `sb_publishable_${'x'.repeat(28)}`;

function jsonResponse(data, { ok = true } = {}) {
  return {
    ok,
    json: async () => data
  };
}

test('60秒の結果を固有番号付きで1回登録する', async () => {
  const requests = [];
  const client = new RankingClient({
    url: `${URL}/`,
    publishableKey: KEY,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse([{
        accepted: true,
        result_display_name: 'サイ ノメ',
        result_best_score: 3200,
        result_play_count: 1,
        is_first_play: true,
        is_new_best: true,
        was_duplicate: false
      }]);
    }
  });

  const result = await client.submitScore({
    displayName: 'サイ ノメ',
    modeId: GAME_MODE_IDS.SIXTY_SECONDS,
    score: 3200,
    submissionId: '12345678-1234-1234-1234-123456789012'
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `${URL}/rest/v1/rpc/submit_score_once`);
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.headers.apikey, KEY);
  assert.equal('Authorization' in requests[0].options.headers, false);
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    p_display_name: 'サイ ノメ',
    p_game_slug: RANKING_GAME_SLUGS[GAME_MODE_IDS.SIXTY_SECONDS],
    p_score: 3200,
    p_client_version: 'sainome-web-1',
    p_submission_id: '12345678-1234-1234-1234-123456789012'
  });
  assert.equal(result.isFirstPlay, true);
  assert.equal(result.bestScore, 3200);
});

test('180秒ランキングを60秒とは別の記録として上位10件取得する', async () => {
  const requests = [];
  const rows = Array.from({ length: 12 }, (_, index) => ({
    rank_no: index + 1,
    display_name: `プレイヤー${index + 1}`,
    best_score: 12000 - index * 100,
    play_count: index + 1
  }));
  const client = new RankingClient({
    url: URL,
    publishableKey: KEY,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse(rows);
    }
  });

  const ranking = await client.getTopRanking(GAME_MODE_IDS.ONE_EIGHTY_SECONDS);

  assert.equal(ranking.length, RANKING_LIMIT);
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    p_game_slug: RANKING_GAME_SLUGS[GAME_MODE_IDS.ONE_EIGHTY_SECONDS],
    p_limit: RANKING_LIMIT
  });
  assert.deepEqual(ranking[0], {
    rank: 1,
    displayName: 'プレイヤー1',
    score: 12000,
    playCount: 1
  });
});

test('再送済みの応答を重複登録として扱える', async () => {
  const client = new RankingClient({
    url: URL,
    publishableKey: KEY,
    fetchImpl: async () => jsonResponse([{
      accepted: true,
      result_display_name: 'プレイヤー',
      result_best_score: 5000,
      result_play_count: 2,
      is_first_play: false,
      is_new_best: false,
      was_duplicate: true
    }])
  });

  const result = await client.submitScore({
    displayName: 'プレイヤー',
    modeId: GAME_MODE_IDS.ONE_EIGHTY_SECONDS,
    score: 4000,
    submissionId: '12345678-1234-1234-1234-123456789012'
  });

  assert.equal(result.wasDuplicate, true);
  assert.equal(result.playCount, 2);
});

test('通信失敗を画面側で判別できるエラーへ変換する', async () => {
  const client = new RankingClient({
    url: URL,
    publishableKey: KEY,
    fetchImpl: async () => jsonResponse({ message: 'failed' }, { ok: false })
  });

  await assert.rejects(
    client.getTopRanking(GAME_MODE_IDS.SIXTY_SECONDS),
    (error) => error instanceof RankingError && error.code === 'request-failed'
  );
});

test('不正なモード、得点、登録番号を送信前に拒否する', async () => {
  const client = new RankingClient({
    url: URL,
    publishableKey: KEY,
    fetchImpl: async () => { throw new Error('must not send'); }
  });

  await assert.rejects(
    client.submitScore({
      displayName: '名前', modeId: 'unknown', score: 100, submissionId: 'x'.repeat(16)
    }),
    /Unknown ranking mode/
  );
  await assert.rejects(
    client.submitScore({
      displayName: '名前', modeId: GAME_MODE_IDS.SIXTY_SECONDS, score: 1.5,
      submissionId: 'x'.repeat(16)
    }),
    /score/
  );
  await assert.rejects(
    client.submitScore({
      displayName: '名前', modeId: GAME_MODE_IDS.SIXTY_SECONDS, score: 100,
      submissionId: 'short'
    }),
    /submissionId/
  );
});

test('登録番号は標準機能と代替機能のどちらでも十分な長さになる', () => {
  assert.equal(
    createSubmissionId({ randomUUID: () => '12345678-1234-1234-1234-123456789012' }),
    '12345678-1234-1234-1234-123456789012'
  );
  const fallback = createSubmissionId({
    getRandomValues: (bytes) => {
      bytes.fill(15);
      return bytes;
    }
  });
  assert.match(fallback, /^[a-f0-9]{32}$/u);
});
