import test from 'node:test';
import assert from 'node:assert/strict';

import { GAME_MODE_IDS } from '../js/game-modes.js';
import {
  createSubmissionId,
  RankingClient,
  RankingError,
  RANKING_CLIENT_VERSION,
  RANKING_GAME_SLUGS,
  RANKING_LIMIT,
  RANKING_SUBMISSION_CONTRACT_VERSION
} from '../js/ranking-client.js';

const URL = 'https://example.supabase.co';
const KEY = `sb_publishable_${'x'.repeat(28)}`;
const SUBMISSION_ID = '12345678-1234-1234-1234-123456789012';

function jsonResponse(data, { ok = true } = {}) {
  return {
    ok,
    json: async () => data
  };
}

function submitResponse({
  displayName = 'プレイヤー',
  modeId = GAME_MODE_IDS.SIXTY_SECONDS,
  submittedScore = 3200,
  bestScore = submittedScore,
  playCount = 1,
  clientVersion = RANKING_CLIENT_VERSION,
  contractVersion = RANKING_SUBMISSION_CONTRACT_VERSION,
  submissionId = SUBMISSION_ID,
  isFirstPlay = true,
  isNewBest = true,
  wasDuplicate = false
} = {}) {
  return {
    accepted: true,
    result_submission_id: submissionId,
    result_contract_version: contractVersion,
    result_client_version: clientVersion,
    result_game_slug: RANKING_GAME_SLUGS[modeId],
    result_display_name: displayName,
    result_submitted_score: submittedScore,
    result_best_score: bestScore,
    result_play_count: playCount,
    is_first_play: isFirstPlay,
    is_new_best: isNewBest,
    was_duplicate: wasDuplicate
  };
}

test('60秒の結果を固有番号と契約版付きで1回登録する', async () => {
  const requests = [];
  const client = new RankingClient({
    url: `${URL}/`,
    publishableKey: KEY,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse([submitResponse({
        displayName: 'サイ ノメ',
        submittedScore: 3200
      })]);
    }
  });

  const result = await client.submitScore({
    displayName: 'サイ ノメ',
    modeId: GAME_MODE_IDS.SIXTY_SECONDS,
    score: 3200,
    submissionId: SUBMISSION_ID
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
    p_client_version: RANKING_CLIENT_VERSION,
    p_submission_id: SUBMISSION_ID,
    p_contract_version: RANKING_SUBMISSION_CONTRACT_VERSION
  });
  assert.equal(result.isFirstPlay, true);
  assert.equal(result.bestScore, 3200);
  assert.equal(result.submissionId, SUBMISSION_ID);
  assert.equal(result.contractVersion, RANKING_SUBMISSION_CONTRACT_VERSION);
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
    fetchImpl: async () => jsonResponse([submitResponse({
      modeId: GAME_MODE_IDS.ONE_EIGHTY_SECONDS,
      submittedScore: 4000,
      bestScore: 5000,
      playCount: 2,
      isFirstPlay: false,
      isNewBest: false,
      wasDuplicate: true
    })])
  });

  const result = await client.submitScore({
    displayName: 'プレイヤー',
    modeId: GAME_MODE_IDS.ONE_EIGHTY_SECONDS,
    score: 4000,
    submissionId: SUBMISSION_ID
  });

  assert.equal(result.wasDuplicate, true);
  assert.equal(result.playCount, 2);
});

test('保存時のクライアント版を要求と応答照合へ引き継げる', async () => {
  const previousVersion = 'sainome-web-previous';
  let body = null;
  const client = new RankingClient({
    url: URL,
    publishableKey: KEY,
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return jsonResponse([submitResponse({
        submittedScore: 5000,
        clientVersion: previousVersion
      })]);
    }
  });

  await client.submitScore({
    displayName: 'プレイヤー',
    modeId: GAME_MODE_IDS.SIXTY_SECONDS,
    score: 5000,
    submissionId: SUBMISSION_ID,
    clientVersion: previousVersion
  });

  assert.equal(body.p_client_version, previousVersion);
});

test('受付応答は要求した番号・契約版・クライアント版・slug・名前・得点と照合する', async () => {
  const mismatches = [
    { result_submission_id: 'x'.repeat(16) },
    { result_contract_version: 'other-contract' },
    { result_client_version: 'other-client' },
    { result_game_slug: RANKING_GAME_SLUGS[GAME_MODE_IDS.ONE_EIGHTY_SECONDS] },
    { result_display_name: '別の名前' },
    { result_submitted_score: 3201 }
  ];

  for (const mismatch of mismatches) {
    const client = new RankingClient({
      url: URL,
      publishableKey: KEY,
      fetchImpl: async () => jsonResponse([{ ...submitResponse(), ...mismatch }])
    });
    await assert.rejects(
      client.submitScore({
        displayName: 'プレイヤー',
        modeId: GAME_MODE_IDS.SIXTY_SECONDS,
        score: 3200,
        submissionId: SUBMISSION_ID
      }),
      (error) => error instanceof RankingError && error.code === 'invalid-response'
    );
  }
});

test('0件・複数行・曖昧な受付応答を成功扱いにしない', async () => {
  const valid = submitResponse();
  const invalidResponses = [[], [valid, valid], [{ ...valid, accepted: false }], null];

  for (const response of invalidResponses) {
    const client = new RankingClient({
      url: URL,
      publishableKey: KEY,
      fetchImpl: async () => jsonResponse(response)
    });
    await assert.rejects(
      client.submitScore({
        displayName: 'プレイヤー',
        modeId: GAME_MODE_IDS.SIXTY_SECONDS,
        score: 3200,
        submissionId: SUBMISSION_ID
      }),
      (error) => error instanceof RankingError && error.code === 'invalid-response'
    );
  }
});

test('受付済みでも範囲外集計や真偽値欠落の応答では成功扱いにしない', async () => {
  const invalidRows = [
    { ...submitResponse({ submittedScore: 100 }), result_best_score: -1 },
    { ...submitResponse({ submittedScore: 100 }), result_play_count: 0 },
    { ...submitResponse({ submittedScore: 100 }), result_best_score: '100' },
    { ...submitResponse({ submittedScore: 100 }), was_duplicate: undefined }
  ];

  for (const row of invalidRows) {
    const client = new RankingClient({
      url: URL,
      publishableKey: KEY,
      fetchImpl: async () => jsonResponse([row])
    });
    await assert.rejects(
      client.submitScore({
        displayName: 'プレイヤー',
        modeId: GAME_MODE_IDS.SIXTY_SECONDS,
        score: 100,
        submissionId: SUBMISSION_ID
      }),
      (error) => error instanceof RankingError && error.code === 'invalid-response'
    );
  }
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

test('不正なモード、得点、登録番号、契約版を送信前に拒否する', async () => {
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
  await assert.rejects(
    client.submitScore({
      displayName: '名前', modeId: GAME_MODE_IDS.SIXTY_SECONDS, score: 100,
      submissionId: 'x'.repeat(16), contractVersion: 'unknown-contract'
    }),
    /contractVersion/
  );
});

test('登録番号は標準機能と代替機能のどちらでも十分な長さになる', () => {
  assert.equal(
    createSubmissionId({ randomUUID: () => SUBMISSION_ID }),
    SUBMISSION_ID
  );
  const fallback = createSubmissionId({
    getRandomValues: (bytes) => {
      bytes.fill(15);
      return bytes;
    }
  });
  assert.match(fallback, /^[a-f0-9]{32}$/u);
});
