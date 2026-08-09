import test from 'node:test';
import assert from 'node:assert/strict';

import {
  prepareRankingSubmission,
  SingleFlight,
  submitPendingRanking,
  updateIfCurrentRankingSubmission
} from '../js/ranking-submission-flow.js';
import {
  RANKING_CLIENT_VERSION,
  RANKING_GAME_SLUGS,
  RANKING_SUBMISSION_CONTRACT_VERSION
} from '../js/ranking-client.js';

const IDS = [
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
];
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
    idFactory: () => IDS[0],
    now: () => 100
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
    idFactory: () => IDS[0],
    now: () => 100
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
      idFactory: () => IDS[0],
      now: () => 100
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
    idFactory: () => IDS[0],
    now: () => 100
  });

  const submitted = await submitPendingRanking({
    rankingClient, pendingSubmissions, submission
  });
  assert.deepEqual(submitted.cleanup, cleanupFailure);
});

test('登録番号が別内容と衝突した場合は新しい番号を作り直してから送る', async () => {
  const seen = [];
  const ids = [...IDS];
  const pendingSubmissions = {
    enqueue: async (submission) => {
      seen.push(submission.submissionId);
      return submission.submissionId === IDS[0]
        ? { ok: false, persisted: false, code: 'submission-conflict' }
        : { ok: true, persisted: true, code: 'queued' };
    },
    markAccepted: async () => ({
      ok: true, removed: true, persisted: true, code: 'removed'
    })
  };
  let sentId = null;
  const rankingClient = {
    submitScore: async (request) => {
      sentId = request.submissionId;
      return acceptedOutcome(request);
    }
  };
  const submission = await prepareRankingSubmission({
    pendingSubmissions,
    displayName: 'プレイヤー',
    result: RESULT,
    idFactory: () => ids.shift(),
    now: () => 100
  });
  await submitPendingRanking({ rankingClient, pendingSubmissions, submission });

  assert.deepEqual(seen, IDS);
  assert.equal(submission.submissionId, IDS[1]);
  assert.equal(sentId, IDS[1]);
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
    idFactory: () => IDS[0],
    now: () => 100,
    clientVersion: RANKING_CLIENT_VERSION
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
