import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyRankingFailure,
  prepareRankingSubmission,
  SingleFlight,
  submitPendingRanking,
  updateIfCurrentRankingSubmission
} from '../js/ranking-submission-flow.js';
import {
  RANKING_CLIENT_VERSION,
  RANKING_GAME_SLUGS,
  RankingError,
  RANKING_SUBMISSION_CONTRACT_VERSION
} from '../js/ranking-client.js';

const IDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222'
];
const PLAY_TICKET = Object.freeze({
  submissionId: IDS[0],
  gameSlug: 'sainome_60_seconds',
  clientVersion: RANKING_CLIENT_VERSION,
  contractVersion: RANKING_SUBMISSION_CONTRACT_VERSION,
  issuedAt: 1_000,
  earliestSubmitAt: 64_000,
  expiresAt: 86_401_000
});
const RESULT = Object.freeze({
  modeId: '60-seconds',
  score: 3200,
  clearedDice: 8,
  maxChain: 2,
  endedReason: 'time-up'
});

function acceptedOutcome(request, overrides = {}) {
  return Object.freeze({
    accepted: true,
    submissionId: request.submissionId,
    contractVersion: request.contractVersion,
    clientVersion: request.clientVersion,
    gameSlug: RANKING_GAME_SLUGS[request.modeId],
    displayName: request.displayName,
    submittedScore: request.score,
    wasDuplicate: false,
    ...overrides
  });
}

test('ランキング失敗を通信再試行と恒久拒否へ分類する', () => {
  assert.equal(
    classifyRankingFailure(new RankingError(
      'request-failed',
      'temporary',
      undefined,
      { retryable: true, status: 503 }
    )),
    'transient'
  );
  assert.equal(
    classifyRankingFailure(new RankingError(
      'request-failed',
      'rejected',
      undefined,
      { retryable: false, status: 400 }
    )),
    'permanent'
  );
  assert.equal(classifyRankingFailure(new RankingError('invalid-response', 'invalid')), 'transient');
  assert.equal(classifyRankingFailure(new RankingError('auth-required', 'sign in')), 'transient');
  assert.equal(
    classifyRankingFailure(new RankingError(
      'request-failed',
      'endpoint unavailable',
      undefined,
      { retryable: false, status: 404 }
    )),
    'transient'
  );
  assert.equal(classifyRankingFailure(new Error('offline')), 'transient');
});

test('失効した確定番号だけを恒久拒否とし、受付停止や早すぎる送信は再送可能にする', () => {
  const requestFailure = (status, serverCode, rpcName = 'submit_score_once') =>
    new RankingError('request-failed', 'rejected', undefined, {
      retryable: status === 425 || status >= 500,
      status,
      rpcName,
      serverCode
    });

  assert.equal(classifyRankingFailure(requestFailure(410, 'PT410')), 'permanent');
  assert.equal(classifyRankingFailure(requestFailure(409, 'PT409')), 'permanent');
  assert.equal(classifyRankingFailure(requestFailure(422, '22023')), 'permanent');
  assert.equal(classifyRankingFailure(requestFailure(425, 'PT425')), 'transient');
  assert.equal(classifyRankingFailure(requestFailure(503, 'PT503')), 'transient');
  assert.equal(classifyRankingFailure(requestFailure(403, '42501')), 'transient');
  assert.equal(classifyRankingFailure(requestFailure(410, 'PT410', 'issue_sainome_play_v2')), 'transient');
  assert.equal(classifyRankingFailure(requestFailure(410, 'UNKNOWN')), 'transient');
});

test('遅れて完了した古いプレイは新しい結果画面を更新しない', async () => {
  let activeRunId = 1;
  const updates = [];
  let releaseOld;
  const oldReady = new Promise((resolve) => { releaseOld = resolve; });
  const apply = (submission) => updateIfCurrentRankingSubmission({
    submission,
    isCurrent: (candidate) => candidate.runId === activeRunId,
    update: () => updates.push(submission.runId)
  });

  const delayedOld = (async () => {
    await oldReady;
    return apply({ runId: 1 });
  })();
  activeRunId = 2;
  assert.equal(apply({ runId: 2 }), true);
  releaseOld();

  assert.equal(await delayedOld, false);
  assert.deepEqual(updates, [2]);
});

test('待機中の同じ再送操作を二重に開始しない', async () => {
  const flight = new SingleFlight();
  let calls = 0;
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });

  const first = flight.run(async () => {
    calls += 1;
    await waiting;
    return 'done';
  });
  const second = await flight.run(async () => {
    calls += 1;
    return 'unexpected';
  });

  assert.deepEqual(second, { started: false, value: undefined });
  assert.equal(calls, 1);
  assert.equal(flight.active, true);

  release();
  assert.deepEqual(await first, { started: true, value: 'done' });
  assert.equal(flight.active, false);
});

test('保存完了後にだけ通信を開始し、受付内容一致後に同じ保存を削除する', async () => {
  const events = [];
  let cleaned = null;
  const pendingSubmissions = {
    enqueue: async (submission) => {
      events.push('save');
      return { ok: true, persisted: true, code: 'queued', submission };
    },
    markAccepted: async (submission) => {
      events.push('cleanup');
      cleaned = submission;
      return { ok: true, removed: true, persisted: true, code: 'removed' };
    }
  };
  const rankingClient = {
    submitScore: async (request) => {
      events.push('send');
      return acceptedOutcome(request);
    }
  };

  const submission = await prepareRankingSubmission({
    pendingSubmissions,
    displayName: 'プレイヤー',
    result: RESULT,
    now: () => 100,
    playTicket: PLAY_TICKET
  });
  const submitted = await submitPendingRanking({
    rankingClient,
    pendingSubmissions,
    submission
  });

  assert.deepEqual(events, ['save', 'send', 'cleanup']);
  assert.deepEqual(cleaned, submission);
  assert.equal(submitted.cleanup.ok, true);
});

test('通信失敗では受付削除へ進まない', async () => {
  let cleanupCalls = 0;
  const pendingSubmissions = {
    enqueue: async () => ({ ok: true, persisted: true, code: 'queued' }),
    markAccepted: async () => { cleanupCalls += 1; }
  };
  const rankingClient = {
    submitScore: async () => { throw new Error('offline'); }
  };
  const submission = await prepareRankingSubmission({
    pendingSubmissions,
    displayName: 'プレイヤー',
    result: RESULT,
    now: () => 100,
    playTicket: PLAY_TICKET
  });

  await assert.rejects(
    submitPendingRanking({ rankingClient, pendingSubmissions, submission }),
    /offline/
  );
  assert.equal(cleanupCalls, 0);
});

test('受付応答の登録番号・契約版・内容が違う場合は削除しない', async () => {
  const mismatches = [
    { submissionId: IDS[1] },
    { contractVersion: 'other-contract' },
    { clientVersion: 'other-client' },
    { gameSlug: 'sainome_180_seconds' },
    { displayName: '別の名前' },
    { submittedScore: RESULT.score + 1 }
  ];

  for (const mismatch of mismatches) {
    let cleanupCalls = 0;
    const pendingSubmissions = {
      enqueue: async () => ({ ok: true, persisted: true, code: 'queued' }),
      markAccepted: async () => { cleanupCalls += 1; }
    };
    const rankingClient = {
      submitScore: async (request) => acceptedOutcome(request, mismatch)
    };
    const submission = await prepareRankingSubmission({
      pendingSubmissions,
      displayName: 'プレイヤー',
      result: RESULT,
      now: () => 100,
      playTicket: PLAY_TICKET
    });

    await assert.rejects(
      submitPendingRanking({ rankingClient, pendingSubmissions, submission }),
      /does not match/
    );
    assert.equal(cleanupCalls, 0);
  }
});

test('受付後の保存削除失敗を呼び出し側へ返す', async () => {
  const cleanupFailure = {
    ok: false, removed: false, persisted: false, code: 'storage-unavailable'
  };
  const pendingSubmissions = {
    enqueue: async () => ({ ok: true, persisted: true, code: 'queued' }),
    markAccepted: async () => cleanupFailure
  };
  const rankingClient = {
    submitScore: async (request) => acceptedOutcome(request)
  };
  const submission = await prepareRankingSubmission({
    pendingSubmissions,
    displayName: 'プレイヤー',
    result: RESULT,
    now: () => 100,
    playTicket: PLAY_TICKET
  });

  const submitted = await submitPendingRanking({
    rankingClient, pendingSubmissions, submission
  });
  assert.deepEqual(submitted.cleanup, cleanupFailure);
});

test('DB発行番号が保存内容と衝突した場合は別番号を作らず送信を止める', async () => {
  const seen = [];
  const pendingSubmissions = {
    enqueue: async (submission) => {
      seen.push(submission.submissionId);
      return { ok: false, persisted: false, code: 'submission-conflict' };
    },
    markAccepted: async () => { throw new Error('must not clean up'); }
  };
  const submission = await prepareRankingSubmission({
    pendingSubmissions,
    displayName: 'プレイヤー',
    result: RESULT,
    now: () => 100,
    playTicket: PLAY_TICKET
  });

  assert.deepEqual(seen, [IDS[0]]);
  assert.equal(submission.submissionId, IDS[0]);
  assert.equal(submission.canSubmit, false);
  await assert.rejects(
    submitPendingRanking({ rankingClient: {}, pendingSubmissions, submission }),
    /not safe to send/
  );
});

test('保存した元のクライアント版と契約版を再送に使う', async () => {
  let sentRequest = null;
  const pendingSubmissions = {
    markAccepted: async () => ({
      ok: true, removed: true, persisted: true, code: 'removed'
    })
  };
  const rankingClient = {
    submitScore: async (request) => {
      sentRequest = request;
      return acceptedOutcome(request);
    }
  };
  const submission = {
    submissionId: IDS[0],
    contractVersion: RANKING_SUBMISSION_CONTRACT_VERSION,
    clientVersion: 'sainome-web-previous',
    displayName: 'プレイヤー',
    result: RESULT,
    createdAt: 100
  };

  await submitPendingRanking({ rankingClient, pendingSubmissions, submission });
  assert.equal(sentRequest.clientVersion, 'sainome-web-previous');
  assert.equal(sentRequest.contractVersion, RANKING_SUBMISSION_CONTRACT_VERSION);
});

test('未送信上限では画面内の送信を許すが保存失敗を明示する', async () => {
  const pendingSubmissions = {
    enqueue: async () => ({ ok: false, persisted: false, code: 'queue-full' })
  };
  const submission = await prepareRankingSubmission({
    pendingSubmissions,
    displayName: 'プレイヤー',
    result: RESULT,
    now: () => 100,
    playTicket: PLAY_TICKET
  });

  assert.equal(submission.persisted, false);
  assert.equal(submission.pendingSaveCode, 'queue-full');
  assert.equal(submission.canSubmit, true);
});

test('安全に保存準備できない結果は通信しない', async () => {
  let sendCalls = 0;
  const rankingClient = {
    submitScore: async () => { sendCalls += 1; }
  };
  const pendingSubmissions = { markAccepted: async () => undefined };

  await assert.rejects(
    submitPendingRanking({
      rankingClient,
      pendingSubmissions,
      submission: { canSubmit: false }
    }),
    /not safe to send/
  );
  assert.equal(sendCalls, 0);
});

test('不正または未正規化の名前は保存番号を作らず送信準備を止める', async () => {
  for (const displayName of ['\u061c', 'ＡＢＣ']) {
    let enqueueCalls = 0;
    let idCalls = 0;
    const pendingSubmissions = {
      enqueue: async () => {
        enqueueCalls += 1;
        return { ok: true, persisted: true, code: 'queued' };
      }
    };

    await assert.rejects(
      prepareRankingSubmission({
        pendingSubmissions,
        displayName,
        result: RESULT,
        now: () => 100,
        playTicket: PLAY_TICKET
      }),
      /displayName is invalid or not normalized/
    );
    assert.equal(enqueueCalls, 0);
    assert.equal(idCalls, 0);
  }
});

test('保存済みデータ由来でも不正な名前は通信前に止める', async () => {
  let sendCalls = 0;
  let cleanupCalls = 0;
  const rankingClient = {
    submitScore: async () => {
      sendCalls += 1;
      throw new Error('must not send');
    }
  };
  const pendingSubmissions = {
    markAccepted: async () => {
      cleanupCalls += 1;
    }
  };

  await assert.rejects(
    submitPendingRanking({
      rankingClient,
      pendingSubmissions,
      submission: {
        submissionId: IDS[0],
        contractVersion: RANKING_SUBMISSION_CONTRACT_VERSION,
        clientVersion: RANKING_CLIENT_VERSION,
        displayName: 'ＡＢＣ',
        result: RESULT,
        createdAt: 100
      }
    }),
    /displayName is invalid or not normalized/
  );
  assert.equal(sendCalls, 0);
  assert.equal(cleanupCalls, 0);
});
