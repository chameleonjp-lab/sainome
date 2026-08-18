import test from 'node:test';
import assert from 'node:assert/strict';

import { GAME_MODE_IDS } from '../js/game-modes.js';
import {
  createRankingFailureDetail,
  createSubmissionId,
  isRetryableRankingError,
  isValidRankingSubmissionId,
  RankingClient,
  RankingError,
  RANKING_CLIENT_VERSION,
  RANKING_GAME_SLUGS,
  RANKING_LIMIT,
  RANKING_SUBMISSION_CONTRACT_VERSION
} from '../js/ranking-client.js';

const URL = 'https://example.supabase.co';
const KEY = `sb_publishable_${'x'.repeat(28)}`;
const MODE_ID = GAME_MODE_IDS.THREE_HUNDRED_SECONDS;
const GAME_SLUG = 'sainome_300_seconds';
const SUBMISSION_ID = '12345678-1234-4234-8234-123456789012';

function jsonResponse(data, { ok = true, status = ok ? 200 : 400 } = {}) {
  return {
    ok,
    status,
    json: async () => data
  };
}

function makeClient(fetchImpl = async () => jsonResponse([])) {
  return new RankingClient({
    url: URL,
    publishableKey: KEY,
    fetchImpl
  });
}

function issueResponse(overrides = {}) {
  return {
    issued: true,
    result_submission_id: SUBMISSION_ID,
    result_display_name: 'プレイヤー',
    result_game_slug: GAME_SLUG,
    result_client_version: RANKING_CLIENT_VERSION,
    result_contract_version: RANKING_SUBMISSION_CONTRACT_VERSION,
    issued_at: '2026-08-10T00:00:00.000Z',
    earliest_submit_at: '2026-08-10T00:05:03.000Z',
    expires_at: '2026-08-11T00:00:00.000Z',
    ...overrides
  };
}

function onceSubmitResponse(overrides = {}) {
  return {
    accepted: true,
    result_submission_id: SUBMISSION_ID,
    result_contract_version: RANKING_SUBMISSION_CONTRACT_VERSION,
    result_client_version: RANKING_CLIENT_VERSION,
    result_game_slug: GAME_SLUG,
    result_display_name: 'プレイヤー',
    result_submitted_score: 3200,
    result_best_score: 3200,
    result_play_count: 1,
    is_first_play: true,
    is_new_best: true,
    was_duplicate: false,
    ...overrides
  };
}

test('ランキング対象は300秒だけに固定する', () => {
  assert.deepEqual(RANKING_GAME_SLUGS, {
    [MODE_ID]: GAME_SLUG
  });
  assert.equal(RANKING_LIMIT, 10);
  assert.equal(RANKING_CLIENT_VERSION, 'sainome-web-3');
});

test('開始時にrecord_game_playへ300秒slugを送る', async () => {
  const calls = [];
  const client = makeClient(async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({
      accepted: true,
      display_name: 'プレイヤー',
      game_slug: GAME_SLUG,
      normalized_name: 'プレイヤー',
      result_type: 'play',
      reached_wave: 1
    });
  });

  const result = await client.startPlay({ displayName: 'プレイヤー', modeId: MODE_ID });

  assert.equal(result.started, true);
  assert.equal(calls[0].url, `${URL}/rest/v1/rpc/record_game_play`);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    p_display_name: 'プレイヤー',
    p_game_slug: GAME_SLUG,
    p_result_type: 'play',
    p_client_version: RANKING_CLIENT_VERSION
  });
});

test('終了時にsubmit_scoreへ300秒の得点を送る', async () => {
  const calls = [];
  const client = makeClient(async (url, options) => {
    calls.push({ url, options });
    return jsonResponse([{
      accepted: true,
      result_display_name: 'プレイヤー',
      result_best_score: 3200,
      result_play_count: 1,
      is_first_play: true,
      is_new_best: true
    }]);
  });

  const result = await client.submitScoreDirect({
    displayName: 'プレイヤー', modeId: MODE_ID, score: 3200
  });

  assert.equal(result.accepted, true);
  assert.equal(result.bestScore, 3200);
  assert.equal(calls[0].url, `${URL}/rest/v1/rpc/submit_score`);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    p_display_name: 'プレイヤー',
    p_game_slug: GAME_SLUG,
    p_score: 3200,
    p_client_version: RANKING_CLIENT_VERSION
  });
});

test('300秒ランキングを上位10件取得する', async () => {
  const calls = [];
  const client = makeClient(async (url, options) => {
    calls.push({ url, options });
    return jsonResponse([{
      rank_no: 1,
      display_name: 'プレイヤー',
      best_score: 3200,
      play_count: 1,
      is_current_user: true,
      verification_status: 'unverified'
    }]);
  });

  const rows = await client.getTopRanking(MODE_ID);

  assert.deepEqual(rows, [{
    rank: 1,
    displayName: 'プレイヤー',
    score: 3200,
    playCount: 1,
    isCurrentUser: true
  }]);
  assert.equal(calls[0].url, `${URL}/rest/v1/rpc/get_best_score_ranking`);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    p_game_slug: GAME_SLUG,
    p_limit: RANKING_LIMIT
  });
});

test('サーバー発行番号は300秒の303秒後から受付可能にする', async () => {
  const client = makeClient(async () => jsonResponse([issueResponse()]));
  const ticket = await client.issuePlay({ displayName: 'プレイヤー', modeId: MODE_ID });

  assert.equal(ticket.gameSlug, GAME_SLUG);
  assert.equal(ticket.earliestSubmitAt - ticket.issuedAt, 303_000);
  assert.equal(ticket.expiresAt - ticket.issuedAt, 86_400_000);
});

test('発行番号付きの300秒記録を一度だけ送る', async () => {
  const calls = [];
  const client = makeClient(async (url, options) => {
    calls.push({ url, options });
    return jsonResponse([onceSubmitResponse()]);
  });

  const result = await client.submitScore({
    displayName: 'プレイヤー',
    modeId: MODE_ID,
    score: 3200,
    submissionId: SUBMISSION_ID
  });

  assert.equal(result.accepted, true);
  assert.equal(result.submissionId, SUBMISSION_ID);
  assert.equal(calls[0].url, `${URL}/rest/v1/rpc/submit_score_once`);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    p_display_name: 'プレイヤー',
    p_game_slug: GAME_SLUG,
    p_score: 3200,
    p_client_version: RANKING_CLIENT_VERSION,
    p_submission_id: SUBMISSION_ID,
    p_contract_version: RANKING_SUBMISSION_CONTRACT_VERSION
  });
});

test('廃止した60秒・180秒は通信前に拒否する', async () => {
  let calls = 0;
  const client = makeClient(async () => {
    calls += 1;
    throw new Error('must not send');
  });

  for (const modeId of ['60-seconds', '180-seconds']) {
    await assert.rejects(
      client.submitScoreDirect({ displayName: 'プレイヤー', modeId, score: 100 }),
      /Unknown ranking mode/
    );
  }
  assert.equal(calls, 0);
});

test('ブラウザ標準fetchをglobalThisを受け手として呼ぶ', async () => {
  let observedThis = null;
  const browserLikeFetch = async function () {
    observedThis = this;
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    return jsonResponse({
      accepted: true,
      display_name: 'プレイヤー',
      game_slug: GAME_SLUG,
      result_type: 'play'
    });
  };

  await makeClient(browserLikeFetch).startPlay({ displayName: 'プレイヤー', modeId: MODE_ID });
  assert.equal(observedThis, globalThis);
});

test('HTTP失敗は状態・RPC・サーバー理由・slugを保持する', async () => {
  const client = makeClient(async () => jsonResponse({
    code: 'GAME_NOT_FOUND',
    message: 'game not found',
    hint: 'register the game',
    details: 'missing slug'
  }, { ok: false, status: 404 }));

  await assert.rejects(
    client.submitScoreDirect({ displayName: 'プレイヤー', modeId: MODE_ID, score: 100 }),
    (error) => {
      assert.ok(error instanceof RankingError);
      assert.equal(error.code, 'request-failed');
      assert.equal(error.status, 404);
      assert.equal(error.rpcName, 'submit_score');
      assert.equal(error.serverCode, 'GAME_NOT_FOUND');
      assert.equal(error.serverMessage, 'game not found');
      assert.equal(error.serverHint, 'register the game');
      assert.equal(error.serverDetails, 'missing slug');
      assert.equal(error.gameSlug, GAME_SLUG);
      return true;
    }
  );
});

test('ネットワーク切断と時間切れを再送可能として返す', async () => {
  const network = makeClient(async () => { throw new Error('offline'); });
  await assert.rejects(
    network.getTopRanking(MODE_ID),
    (error) => error instanceof RankingError
      && error.code === 'network'
      && isRetryableRankingError(error)
      && error.rpcName === 'get_best_score_ranking'
  );

  const timeout = makeClient(async () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  });
  await assert.rejects(
    timeout.submitScoreDirect({ displayName: 'プレイヤー', modeId: MODE_ID, score: 100 }),
    (error) => error instanceof RankingError
      && error.code === 'timeout'
      && isRetryableRankingError(error)
      && error.rpcName === 'submit_score'
  );
});

test('応答内容が要求と一致しなければ成功扱いにしない', async () => {
  const client = makeClient(async () => jsonResponse([{
    accepted: true,
    result_display_name: '別人',
    result_best_score: 100,
    result_play_count: 1,
    is_first_play: true,
    is_new_best: true
  }]));

  await assert.rejects(
    client.submitScoreDirect({ displayName: 'プレイヤー', modeId: MODE_ID, score: 100 }),
    (error) => error instanceof RankingError
      && error.code === 'invalid-response'
      && error.rpcName === 'submit_score'
      && error.gameSlug === GAME_SLUG
  );
});

test('失敗情報をUI・診断向けの安全な値へ変換する', () => {
  const error = new RankingError('request-failed', 'failed', undefined, {
    retryable: true,
    status: 503,
    rpcName: 'submit_score',
    serverCode: 'TEMPORARY',
    serverMessage: 'temporary failure',
    gameSlug: GAME_SLUG
  });

  assert.deepEqual(createRankingFailureDetail(error), {
    code: 'request-failed',
    retryable: true,
    status: 503,
    rpcName: 'submit_score',
    serverCode: 'TEMPORARY',
    serverMessage: 'temporary failure',
    serverHint: null,
    serverDetails: null,
    gameSlug: GAME_SLUG
  });
});

test('不正な名前・得点・登録番号を通信前に拒否する', async () => {
  let calls = 0;
  const client = makeClient(async () => {
    calls += 1;
    return jsonResponse([]);
  });

  await assert.rejects(
    client.submitScoreDirect({ displayName: '', modeId: MODE_ID, score: 100 }),
    /displayName/
  );
  await assert.rejects(
    client.submitScoreDirect({ displayName: 'プレイヤー', modeId: MODE_ID, score: 1.5 }),
    /score/
  );
  await assert.rejects(
    client.submitScore({
      displayName: 'プレイヤー', modeId: MODE_ID, score: 100, submissionId: 'short'
    }),
    /submissionId/
  );
  assert.equal(calls, 0);
});

test('登録番号生成は標準UUIDをそのまま使う', () => {
  const generated = createSubmissionId({ randomUUID: () => SUBMISSION_ID });
  assert.equal(generated, SUBMISSION_ID);
  assert.equal(isValidRankingSubmissionId(generated), true);
});
