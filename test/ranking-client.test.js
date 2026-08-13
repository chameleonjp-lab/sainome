import test from 'node:test';
import assert from 'node:assert/strict';

import { GAME_MODE_IDS } from '../js/game-modes.js';
import {
  createSubmissionId,
  RankingClient,
  RankingError,
  isRetryableRankingError,
  RANKING_CLIENT_VERSION,
  RANKING_GAME_SLUGS,
  RANKING_LIMIT,
  RANKING_SUBMISSION_CONTRACT_VERSION
} from '../js/ranking-client.js';

const URL = 'https://example.supabase.co';
const KEY = `sb_publishable_${'x'.repeat(28)}`;
const SUBMISSION_ID = '12345678-1234-4234-8234-123456789012';
const AUTH_SESSION = Object.freeze({
  accessToken: 'access-token-for-tests-1234567890',
  refreshToken: 'refresh-token-for-tests-1234567890',
  userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  isAnonymous: true,
  expiresAt: Date.now() + 3_600_000
});
const AUTH_CLIENT = Object.freeze({
  getSession: async () => AUTH_SESSION
});
const ANON_AUTH_CLIENT = Object.freeze({
  getSession: async () => null
});

function jsonResponse(data, { ok = true, status = ok ? 200 : 400 } = {}) {
  return {
    ok,
    status,
    json: async () => data
  };
}

function makeClient({ fetchImpl = async () => jsonResponse([]), authClient = AUTH_CLIENT } = {}) {
  return new RankingClient({
    url: URL,
    publishableKey: KEY,
    fetchImpl,
    authClient
  });
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

function issueResponse({
  displayName = 'プレイヤー',
  modeId = GAME_MODE_IDS.SIXTY_SECONDS,
  submissionId = SUBMISSION_ID,
  issuedAt = '2026-08-10T00:00:00.000Z',
  earliestSubmitAt = '2026-08-10T00:01:03.000Z',
  expiresAt = '2026-08-11T00:00:00.000Z'
} = {}) {
  return {
    issued: true,
    result_submission_id: submissionId,
    result_display_name: displayName,
    result_game_slug: RANKING_GAME_SLUGS[modeId],
    result_client_version: RANKING_CLIENT_VERSION,
    result_contract_version: RANKING_SUBMISSION_CONTRACT_VERSION,
    issued_at: issuedAt,
    earliest_submit_at: earliestSubmitAt,
    expires_at: expiresAt
  };
}

function rankingRow({
  rank = 1,
  displayName = 'プレイヤー',
  score = 3200,
  playCount = 1,
  isCurrentUser = false,
  verificationStatus = 'unverified'
} = {}) {
  return {
    rank_no: rank,
    display_name: displayName,
    best_score: score,
    play_count: playCount,
    is_current_user: isCurrentUser,
    verification_status: verificationStatus
  };
}

test('低水準RPCを公開せず、検査済みの操作だけを公開する', () => {
  const client = makeClient();

  assert.equal(typeof client.rpc, 'undefined');
  assert.equal(typeof client.issuePlay, 'function');
  assert.equal(typeof client.submitScore, 'function');
  assert.equal(typeof client.getTopRanking, 'function');
});

test('開始前に匿名認証済みのサーバー発行チケットを受け取る', async () => {
  const requests = [];
  let createValue = null;
  const authClient = {
    getSession: async ({ create }) => {
      createValue = create;
      return AUTH_SESSION;
    }
  };
  const client = makeClient({
    authClient,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse([issueResponse()]);
    }
  });

  const ticket = await client.issuePlay({
    displayName: 'プレイヤー',
    modeId: GAME_MODE_IDS.SIXTY_SECONDS
  });

  assert.equal(createValue, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `${URL}/rest/v1/rpc/issue_sainome_play_v2`);
  assert.equal(requests[0].options.headers.apikey, KEY);
  assert.equal(
    requests[0].options.headers.Authorization,
    `Bearer ${AUTH_SESSION.accessToken}`
  );
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    p_display_name: 'プレイヤー',
    p_game_slug: RANKING_GAME_SLUGS[GAME_MODE_IDS.SIXTY_SECONDS],
    p_client_version: RANKING_CLIENT_VERSION,
    p_contract_version: RANKING_SUBMISSION_CONTRACT_VERSION
  });
  assert.deepEqual(ticket, {
    submissionId: SUBMISSION_ID,
    displayName: 'プレイヤー',
    gameSlug: RANKING_GAME_SLUGS[GAME_MODE_IDS.SIXTY_SECONDS],
    clientVersion: RANKING_CLIENT_VERSION,
    contractVersion: RANKING_SUBMISSION_CONTRACT_VERSION,
    issuedAt: Date.parse('2026-08-10T00:00:00.000Z'),
    earliestSubmitAt: Date.parse('2026-08-10T00:01:03.000Z'),
    expiresAt: Date.parse('2026-08-11T00:00:00.000Z')
  });
});

test('開始発行の応答時刻・slug・版が改ざんされると拒否する', async () => {
  const invalidResponses = [
    issueResponse({ earliestSubmitAt: '2026-08-10T00:01:02.000Z' }),
    issueResponse({ expiresAt: '2026-08-11T00:00:01.000Z' }),
    issueResponse({ modeId: GAME_MODE_IDS.ONE_EIGHTY_SECONDS }),
    { ...issueResponse(), result_contract_version: 'other-contract' }
  ];

  for (const response of invalidResponses) {
    const client = makeClient({
      fetchImpl: async () => jsonResponse([response])
    });
    await assert.rejects(
      client.issuePlay({
        displayName: 'プレイヤー',
        modeId: GAME_MODE_IDS.SIXTY_SECONDS
      }),
      (error) => error instanceof RankingError && error.code === 'invalid-response'
    );
  }
});

test('60秒の結果をサーバー発行UUIDと匿名JWT付きで一度登録する', async () => {
  const requests = [];
  const client = makeClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse([submitResponse({ displayName: 'サイ ノメ' })]);
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
  assert.equal(requests[0].options.headers.apikey, KEY);
  assert.equal(
    requests[0].options.headers.Authorization,
    `Bearer ${AUTH_SESSION.accessToken}`
  );
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

test('保存済み番号の再送では新しい匿名UIDを作らない', async () => {
  let createValue = null;
  const authClient = {
    getSession: async ({ create }) => {
      createValue = create;
      return null;
    }
  };
  const client = makeClient({
    authClient,
    fetchImpl: async () => { throw new Error('must not send'); }
  });

  await assert.rejects(
    client.submitScore({
      displayName: 'プレイヤー',
      modeId: GAME_MODE_IDS.SIXTY_SECONDS,
      score: 3200,
      submissionId: SUBMISSION_ID
    }),
    (error) => error instanceof RankingError && error.code === 'auth-required'
  );
  assert.equal(createValue, false);
});

test('180秒ランキングを60秒とは別の記録として上位10件取得する', async () => {
  const requests = [];
  const rows = Array.from({ length: 12 }, (_, index) => rankingRow({
    rank: index + 1,
    displayName: `プレイヤー${index + 1}`,
    score: 12000 - index * 100,
    playCount: index + 1
  }));
  const client = makeClient({
    authClient: ANON_AUTH_CLIENT,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse(rows);
    }
  });

  const ranking = await client.getTopRanking(GAME_MODE_IDS.ONE_EIGHTY_SECONDS);

  assert.equal(ranking.length, RANKING_LIMIT);
  assert.equal(requests[0].url, `${URL}/rest/v1/rpc/get_sainome_ranking_v2`);
  assert.equal('Authorization' in requests[0].options.headers, false);
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    p_game_slug: RANKING_GAME_SLUGS[GAME_MODE_IDS.ONE_EIGHTY_SECONDS],
    p_limit: RANKING_LIMIT
  });
  assert.deepEqual(ranking[0], {
    rank: 1,
    displayName: 'プレイヤー1',
    score: 12000,
    playCount: 1,
    isCurrentUser: false
  });
});

test('ランキングは未検証表示とDBの本人判定だけを引き継ぐ', async () => {
  const client = makeClient({
    fetchImpl: async () => jsonResponse([
      rankingRow({ rank: 1, displayName: '\u2800', score: 9999, isCurrentUser: true }),
      rankingRow({ rank: 2, displayName: 'ＡＢＣ', score: 9000 }),
      rankingRow({ rank: 3, displayName: 'プレイヤー', score: 8000, playCount: 2, isCurrentUser: true })
    ])
  });

  const ranking = await client.getTopRanking(GAME_MODE_IDS.SIXTY_SECONDS);

  assert.deepEqual(ranking, [{
    rank: 3,
    displayName: 'プレイヤー',
    score: 8000,
    playCount: 2,
    isCurrentUser: true
  }]);
});

test('verification_statusが未検証以外の行を成功扱いにしない', async () => {
  const client = makeClient({
    fetchImpl: async () => jsonResponse([
      rankingRow({ verificationStatus: 'verified' })
    ])
  });

  await assert.rejects(
    client.getTopRanking(GAME_MODE_IDS.SIXTY_SECONDS),
    (error) => error instanceof RankingError && error.code === 'invalid-response'
  );
});

test('ランキングの数値型を文字列から暗黙変換しない', async () => {
  const client = makeClient({
    fetchImpl: async () => jsonResponse([{
      ...rankingRow(),
      best_score: '3200'
    }])
  });

  await assert.rejects(
    client.getTopRanking(GAME_MODE_IDS.SIXTY_SECONDS),
    (error) => error instanceof RankingError && error.code === 'invalid-response'
  );
});

test('本人判定が複数行にあるランキング応答を拒否する', async () => {
  const client = makeClient({
    fetchImpl: async () => jsonResponse([
      rankingRow({ rank: 1, displayName: 'プレイヤー1', isCurrentUser: true }),
      rankingRow({ rank: 2, displayName: 'プレイヤー2', score: 3100, isCurrentUser: true })
    ])
  });

  await assert.rejects(
    client.getTopRanking(GAME_MODE_IDS.SIXTY_SECONDS),
    (error) => error instanceof RankingError && error.code === 'invalid-response'
  );
});

test('再送済みの応答を重複登録として扱える', async () => {
  const client = makeClient({
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

test('受付応答は要求したUUID・契約版・クライアント版・slug・名前・得点と照合する', async () => {
  const mismatches = [
    { result_submission_id: 'x'.repeat(16) },
    { result_contract_version: 'other-contract' },
    { result_client_version: 'other-client' },
    { result_game_slug: RANKING_GAME_SLUGS[GAME_MODE_IDS.ONE_EIGHTY_SECONDS] },
    { result_display_name: '別の名前' },
    { result_submitted_score: 3201 }
  ];

  for (const mismatch of mismatches) {
    const client = makeClient({
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
    const client = makeClient({
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

test('通信失敗を画面側で判別できるエラーへ変換する', async () => {
  const client = makeClient({
    fetchImpl: async () => jsonResponse({ message: 'failed' }, { ok: false })
  });

  await assert.rejects(
    client.getTopRanking(GAME_MODE_IDS.SIXTY_SECONDS),
    (error) => error instanceof RankingError && error.code === 'request-failed'
  );
});

test('HTTP応答を一時失敗と恒久拒否に分類できる', async () => {
  for (const [status, retryable] of [[400, false], [429, true], [500, true]]) {
    const client = makeClient({
      fetchImpl: async () => jsonResponse({ message: 'failed' }, { ok: false, status })
    });

    await assert.rejects(
      client.getTopRanking(GAME_MODE_IDS.SIXTY_SECONDS),
      (error) => {
        assert.equal(error instanceof RankingError, true);
        assert.equal(error.code, 'request-failed');
        assert.equal(error.status, status);
        assert.equal(error.retryable, retryable);
        assert.equal(isRetryableRankingError(error), retryable);
        return true;
      }
    );
  }
});

test('PostgRESTの拒否コードだけを画面へ出さず機械判定用に保持する', async () => {
  const client = makeClient({
    fetchImpl: async () => jsonResponse({
      code: 'PT410',
      message: 'submission has expired',
      details: 'terminal submission',
      hint: 'start a new play'
    }, { ok: false, status: 410 })
  });

  await assert.rejects(
    client.submitScore({
      displayName: 'プレイヤー',
      modeId: GAME_MODE_IDS.SIXTY_SECONDS,
      score: 3200,
      submissionId: SUBMISSION_ID
    }),
    (error) => {
      assert.equal(error instanceof RankingError, true);
      assert.equal(error.message, 'ランキング通信に失敗しました');
      assert.equal(error.status, 410);
      assert.equal(error.rpcName, 'submit_score_once');
      assert.equal(error.serverCode, 'PT410');
      assert.equal('serverMessage' in error, false);
      assert.equal('serverDetails' in error, false);
      assert.equal('serverHint' in error, false);
      return true;
    }
  );
});

test('PostgRESTの拒否コードが文字列でなければ保持しない', async () => {
  const client = makeClient({
    fetchImpl: async () => jsonResponse({
      code: 410,
      message: ['invalid'],
      details: { value: 'invalid' },
      hint: false
    }, { ok: false, status: 410 })
  });

  await assert.rejects(
    client.submitScore({
      displayName: 'プレイヤー',
      modeId: GAME_MODE_IDS.SIXTY_SECONDS,
      score: 3200,
      submissionId: SUBMISSION_ID
    }),
    (error) => {
      assert.equal(error.serverCode, null);
      return true;
    }
  );
});

test('タイムアウトとネットワーク切断は再試行可能として返す', async () => {
  const timeoutClient = makeClient({
    fetchImpl: async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }
  });
  await assert.rejects(
    timeoutClient.getTopRanking(GAME_MODE_IDS.SIXTY_SECONDS),
    (error) => error instanceof RankingError
      && error.code === 'timeout'
      && error.retryable === true
  );

  const networkClient = makeClient({
    fetchImpl: async () => { throw new Error('offline'); }
  });
  await assert.rejects(
    networkClient.getTopRanking(GAME_MODE_IDS.SIXTY_SECONDS),
    (error) => error instanceof RankingError
      && error.code === 'network'
      && error.retryable === true
  );
});

test('不正なモード、得点、UUID、契約版を送信前に拒否する', async () => {
  let requests = 0;
  const client = makeClient({
    fetchImpl: async () => {
      requests += 1;
      throw new Error('must not send');
    }
  });

  await assert.rejects(
    client.submitScore({
      displayName: '\u200b', modeId: GAME_MODE_IDS.SIXTY_SECONDS, score: 100,
      submissionId: SUBMISSION_ID
    }),
    /displayName/
  );
  await assert.rejects(
    client.submitScore({
      displayName: 'ＡＢＣ', modeId: GAME_MODE_IDS.SIXTY_SECONDS, score: 100,
      submissionId: SUBMISSION_ID
    }),
    /displayName/
  );
  await assert.rejects(
    client.submitScore({
      displayName: '名前', modeId: 'unknown', score: 100, submissionId: SUBMISSION_ID
    }),
    /Unknown ranking mode/
  );
  await assert.rejects(
    client.submitScore({
      displayName: '名前', modeId: GAME_MODE_IDS.SIXTY_SECONDS, score: 1.5,
      submissionId: SUBMISSION_ID
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
      submissionId: SUBMISSION_ID, contractVersion: 'unknown-contract'
    }),
    /contractVersion/
  );
  assert.equal(requests, 0);
});

test('登録番号生成の互換関数は標準UUIDと代替乱数を扱える', () => {
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
