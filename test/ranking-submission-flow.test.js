import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyRankingFailure,
  prepareDirectRankingSubmission,
  prepareRankingSubmission,
  SingleFlight,
  submitPendingDirectRanking,
  submitPendingRanking,
  updateIfCurrentRankingSubmission
} from '../js/ranking-submission-flow.js';
import {
  RankingError,
  RANKING_CLIENT_VERSION,
  RANKING_GAME_SLUGS,
  RANKING_NAME_CONTRACT_VERSION,
  RANKING_SUBMISSION_CONTRACT_VERSION
} from '../js/ranking-client.js';

const MODE_ID = '300-seconds';
const GAME_SLUG = 'sainome_300_seconds';
const IDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222'
];
const PLAY_TICKET = Object.freeze({
  submissionId: IDS[0],
  gameSlug: GAME_SLUG,
  clientVersion: RANKING_CLIENT_VERSION,
  contractVersion: RANKING_SUBMISSION_CONTRACT_VERSION,
  issuedAt: 1_000,
  earliestSubmitAt: 304_000,
  expiresAt: 86_401_000
});
const RESULT = Object.freeze({
  modeId: MODE_ID,
  score: 3200,
  clearedDice: 8,
  maxChain: 0,
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

function directAcceptedOutcome(request, overrides = {}) {
  return Object.freeze({
    accepted: true,
    gameSlug: RANKING_GAME_SLUGS[request.modeId],
    displayName: request.displayName,
    submittedScore: request.score,
    bestScore: request.score,
    playCount: 1,
    isFirstPlay: true,
    isNewBest: true,
    ...overrides
  });
}

test('ランキング失敗を通信再試行と恒久拒否へ分類する', () => {
  assert.equal(classifyRankingFailure(new RankingError(
    'request-failed', 'temporary', undefined,
    { retryable: true, status: 503, rpcName: 'submit_score' }
  )), 'transient');
  assert.equal(classifyRankingFailure(new RankingError(
    'request-failed', 'rejected', undefined,
    { retryable: false, status: 400, rpcName: 'submit_score_once' }
  )), 'permanent');
  assert.equal(classifyRankingFailure(new RankingError(
    'request-failed', 'expired', undefined,
    { retryable: false, status: 410, rpcName: 'submit_score_once', serverCode: 'PT410' }
  )), 'permanent');
  assert.equal(classifyRankingFailure(new RankingError(
    'request-failed', 'temporarily unavailable', undefined,
    { retryable: false, status: 404, rpcName: 'submit_score' }
  )), 'transient');
  assert.equal(classifyRankingFailure(new Error('offline')), 'transient');
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

test('300秒の受付番号付き記録は保存後に送信し、受付一致後だけ削除する', async () => {
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

test('名前だけ方式の300秒記録を保存して再送後に削除する', async () => {
  const events = [];
  const pendingSubmissions = {
    enqueue: async (submission) => {
      events.push('save');
      return { ok: true, persisted: true, code: 'queued', submission };
    },
    markAccepted: async (submission) => {
      events.push('cleanup');
      assert.equal(submission.kind, 'direct-name');
      return { ok: true, removed: true, persisted: true, code: 'removed' };
    }
  };
  const rankingClient = {
    submitScoreDirect: async (request) => {
      events.push('send');
      return directAcceptedOutcome(request);
    }
  };
  const submission = await prepareDirectRankingSubmission({
    pendingSubmissions,
    displayName: 'プレイヤー',
    result: RESULT,
    now: () => 100,
    submissionId: 'direct-test-12345678'
  });

  assert.equal(submission.kind, 'direct-name');
  assert.equal(submission.contractVersion, RANKING_NAME_CONTRACT_VERSION);
  assert.equal(submission.canSubmit, true);
  const submitted = await submitPendingDirectRanking({
    rankingClient,
    pendingSubmissions,
    submission
  });
  assert.deepEqual(events, ['save', 'send', 'cleanup']);
  assert.equal(submitted.cleanup.ok, true);
});

test('端末保存が使えない場合も名前だけ方式の画面内送信を許可する', async () => {
  const enqueueCases = [
    async () => ({ ok: false, persisted: false, code: 'storage-unavailable' }),
    async () => {
      const error = new Error('storage crashed');
      error.code = 'storage-unavailable';
      throw error;
    }
  ];
  let index = 0;
  for (const enqueue of enqueueCases) {
    const submission = await prepareDirectRankingSubmission({
      pendingSubmissions: { enqueue },
      displayName: 'プレイヤー',
      result: RESULT,
      now: () => 100,
      submissionId: `direct-storage-${String(++index).padStart(8, '0')}`
    });
    assert.equal(submission.pendingSaveCode, 'storage-unavailable');
    assert.equal(submission.persisted, false);
    assert.equal(submission.canSubmit, true);
  }
});

test('通信失敗では受付済み削除へ進まない', async () => {
  let cleanupCalls = 0;
  const pendingSubmissions = {
    enqueue: async () => ({ ok: true, persisted: true, code: 'queued' }),
    markAccepted: async () => { cleanupCalls += 1; }
  };
  const submission = await prepareRankingSubmission({
    pendingSubmissions,
    displayName: 'プレイヤー',
    result: RESULT,
    now: () => 100,
    playTicket: PLAY_TICKET
  });

  await assert.rejects(
    submitPendingRanking({
      rankingClient: { submitScore: async () => { throw new Error('offline'); } },
      pendingSubmissions,
      submission
    }),
    /offline/
  );
  assert.equal(cleanupCalls, 0);
});

test('受付応答が保存内容と違う場合は削除しない', async () => {
  const mismatches = [
    { submissionId: IDS[1] },
    { contractVersion: 'other-contract' },
    { clientVersion: 'other-client' },
    { gameSlug: 'other_game' },
    { displayName: '別の名前' },
    { submittedScore: RESULT.score + 1 }
  ];

  for (const mismatch of mismatches) {
    let cleanupCalls = 0;
    const pendingSubmissions = {
      enqueue: async () => ({ ok: true, persisted: true, code: 'queued' }),
      markAccepted: async () => { cleanupCalls += 1; }
    };
    const submission = await prepareRankingSubmission({
      pendingSubmissions,
      displayName: 'プレイヤー',
      result: RESULT,
      now: () => 100,
      playTicket: PLAY_TICKET
    });

    await assert.rejects(
      submitPendingRanking({
        rankingClient: {
          submitScore: async (request) => acceptedOutcome(request, mismatch)
        },
        pendingSubmissions,
        submission
      }),
      /does not match/
    );
    assert.equal(cleanupCalls, 0);
  }
});

test('受付後の端末保存削除失敗を呼び出し側へ返す', async () => {
  const cleanupFailure = {
    ok: false, removed: false, persisted: false, code: 'storage-unavailable'
  };
  const pendingSubmissions = {
    enqueue: async () => ({ ok: true, persisted: true, code: 'queued' }),
    markAccepted: async () => cleanupFailure
  };
  const submission = await prepareRankingSubmission({
    pendingSubmissions,
    displayName: 'プレイヤー',
    result: RESULT,
    now: () => 100,
    playTicket: PLAY_TICKET
  });
  const submitted = await submitPendingRanking({
    rankingClient: { submitScore: async (request) => acceptedOutcome(request) },
    pendingSubmissions,
    submission
  });

  assert.deepEqual(submitted.cleanup, cleanupFailure);
});

test('保存競合では別の受付番号を作らず送信を止める', async () => {
  const seen = [];
  const pendingSubmissions = {
    enqueue: async (submission) => {
      seen.push(submission.submissionId);
      return { ok: false, persisted: false, code: 'submission-conflict' };
    }
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

test('保存上限・保存時間切れでは現在画面の送信を許可する', async () => {
  for (const code of ['queue-full', 'storage-unavailable', 'storage-timeout']) {
    const submission = await prepareRankingSubmission({
      pendingSubmissions: {
        enqueue: async () => ({ ok: false, persisted: false, code })
      },
      displayName: 'プレイヤー',
      result: RESULT,
      now: () => 100,
      playTicket: PLAY_TICKET
    });
    assert.equal(submission.pendingSaveCode, code);
    assert.equal(submission.persisted, false);
    assert.equal(submission.canSubmit, true);
  }
});

test('受付番号がない場合は安全のため送信を止める', async () => {
  const submission = await prepareRankingSubmission({
    pendingSubmissions: { enqueue: async () => { throw new Error('must not enqueue'); } },
    displayName: 'プレイヤー',
    result: RESULT,
    now: () => 100,
    playTicket: null
  });

  assert.equal(submission.pendingSaveCode, 'ticket-unavailable');
  assert.equal(submission.canSubmit, false);
});

test('廃止モードの受付番号と結果は準備段階で拒否する', async () => {
  for (const modeId of ['60-seconds', '180-seconds']) {
    await assert.rejects(
      prepareRankingSubmission({
        pendingSubmissions: { enqueue: async () => ({ ok: true }) },
        displayName: 'プレイヤー',
        result: { ...RESULT, modeId },
        playTicket: PLAY_TICKET
      }),
      /play ticket game slug is invalid/
    );
  }
});
