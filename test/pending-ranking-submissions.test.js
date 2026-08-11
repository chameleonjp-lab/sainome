import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_PENDING_RANKING_SUBMISSIONS,
  PendingRankingSubmissions,
  PENDING_RANKING_STORAGE_VERSION
} from '../js/pending-ranking-submissions.js';
import {
  RANKING_CLIENT_VERSION,
  RANKING_SUBMISSION_CONTRACT_VERSION
} from '../js/ranking-client.js';

const SUBMISSION_ID = '12345678-1234-4234-8234-123456789012';
const ALTERNATE_IDS = Object.freeze([
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'ffffffff-ffff-4fff-8fff-ffffffffffff'
]);

const CREATED_AT = 1_785_000_000_000;
const TICKET_FIELDS = Object.freeze({
  issuedAt: CREATED_AT - 1_000,
  earliestSubmitAt: CREATED_AT + 62_000,
  expiresAt: CREATED_AT + 86_399_000
});

function createSubmission(overrides = {}) {
  return {
    submissionId: SUBMISSION_ID,
    contractVersion: RANKING_SUBMISSION_CONTRACT_VERSION,
    clientVersion: RANKING_CLIENT_VERSION,
    displayName: 'プレイヤー',
    result: {
      modeId: '60-seconds',
      score: 3200,
      clearedDice: 8,
      maxChain: 2,
      endedReason: 'time-up'
    },
    createdAt: CREATED_AT,
    ...TICKET_FIELDS,
    ...overrides
  };
}

function savedValue(submission, version = PENDING_RANKING_STORAGE_VERSION) {
  return JSON.stringify({ version, submission });
}

function recordFor(submission, version = PENDING_RANKING_STORAGE_VERSION) {
  return {
    submissionId: submission.submissionId,
    serialized: savedValue(submission, version)
  };
}

function createAtomicMemoryStorage(initial = [], options = {}) {
  const records = new Map(initial.map((record) => [record.submissionId, { ...record }]));
  const quarantined = new Map();
  let transactionTail = Promise.resolve();
  let failList = Boolean(options.failList);
  let failAdd = Boolean(options.failAdd);
  let failDelete = Boolean(options.failDelete);
  let failQuarantine = Boolean(options.failQuarantine);
  let failRecoveryDelete = Boolean(options.failRecoveryDelete);

  function exclusive(action) {
    const current = transactionTail.then(action, action);
    transactionTail = current.then(() => undefined, () => undefined);
    return current;
  }

  return {
    list: async () => {
      if (failList) throw new Error('read failed');
      return [...records.values()].map((record) => ({ ...record }));
    },
    addIfAbsent: (entry) => exclusive(async () => {
      if (failAdd) throw new Error('write failed');
      const existing = records.get(entry.submissionId);
      if (existing) return { status: 'existing', record: { ...existing } };
      if (records.size >= entry.maxItems) return { status: 'full', record: null };
      const record = { submissionId: entry.submissionId, serialized: entry.serialized };
      records.set(entry.submissionId, record);
      return { status: 'added', record: { ...record } };
    }),
    deleteIfMatch: (entry) => exclusive(async () => {
      if (failDelete) throw new Error('delete failed');
      const existing = records.get(entry.submissionId);
      if (!existing) return { status: 'not-found', record: null };
      if (existing.serialized !== entry.serialized) {
        return { status: 'conflict', record: { ...existing } };
      }
      records.delete(entry.submissionId);
      return { status: 'removed', record: { ...existing } };
    }),
    listQuarantined: async () => [...quarantined.values()].map((record) => ({ ...record })),
    quarantineIfMatch: (entry) => exclusive(async () => {
      if (failQuarantine) throw new Error('quarantine failed');
      const quarantineId = `pending:${entry.submissionId}`;
      const existingQuarantine = quarantined.get(quarantineId);
      const existing = records.get(entry.submissionId);
      if (existingQuarantine) {
        if (existingQuarantine.serialized !== entry.serialized) {
          return { status: 'conflict', record: { ...existingQuarantine } };
        }
        records.delete(entry.submissionId);
        return { status: 'already-quarantined', record: { ...existingQuarantine } };
      }
      if (!existing) return { status: 'not-found', record: null };
      if (existing.serialized !== entry.serialized) {
        return { status: 'conflict', record: { ...existing } };
      }
      const record = {
        quarantineId,
        source: 'pending-submission',
        submissionId: entry.submissionId,
        serialized: entry.serialized,
        reason: entry.reason,
        code: entry.code,
        quarantinedAt: entry.quarantinedAt
      };
      quarantined.set(quarantineId, record);
      records.delete(entry.submissionId);
      return { status: 'quarantined', record: { ...record } };
    }),
    deleteQuarantinedIfMatch: (entry) => exclusive(async () => {
      if (failRecoveryDelete) throw new Error('recovery delete failed');
      const existing = quarantined.get(entry.quarantineId);
      if (!existing) return { status: 'not-found', record: null };
      if (existing.serialized !== entry.serialized) {
        return { status: 'conflict', record: { ...existing } };
      }
      quarantined.delete(entry.quarantineId);
      return { status: 'removed', record: { ...existing } };
    }),
    peek: (submissionId) => records.get(submissionId) ?? null,
    entries: () => [...records.values()].map((record) => ({ ...record })),
    quarantineEntries: () => [...quarantined.values()].map((record) => ({ ...record })),
    putRaw: (record) => records.set(record.submissionId, { ...record }),
    setFailures: (next = {}) => {
      if ('list' in next) failList = next.list;
      if ('add' in next) failAdd = next.add;
      if ('delete' in next) failDelete = next.delete;
      if ('quarantine' in next) failQuarantine = next.quarantine;
      if ('recoveryDelete' in next) failRecoveryDelete = next.recoveryDelete;
    }
  };
}

test('通信前に契約版とクライアント版付きで保存し、作り直しても同じ登録番号を復元する', async () => {
  const storage = createAtomicMemoryStorage();
  const first = new PendingRankingSubmissions({ storage });
  const queued = await first.enqueue(createSubmission());

  assert.equal(queued.ok, true);
  assert.equal(queued.persisted, true);
  const saved = JSON.parse(storage.peek(SUBMISSION_ID).serialized);
  assert.equal(saved.version, PENDING_RANKING_STORAGE_VERSION);
  assert.equal(saved.submission.contractVersion, RANKING_SUBMISSION_CONTRACT_VERSION);
  assert.equal(saved.submission.clientVersion, RANKING_CLIENT_VERSION);

  const restoredManager = new PendingRankingSubmissions({ storage });
  const restored = await restoredManager.refresh();
  assert.equal(restored.count, 1);
  assert.deepEqual(restored.items[0], createSubmission());
});

test('無効な名前は保存処理を呼ばずinvalid-submissionとして拒否する', async () => {
  let addIfAbsentCalls = 0;
  const storage = {
    list: async () => [],
    addIfAbsent: async () => {
      addIfAbsentCalls += 1;
      throw new Error('must not add');
    }
  };
  const pending = new PendingRankingSubmissions({ storage });

  const result = await pending.enqueue(createSubmission({ displayName: '\u2800' }));

  assert.equal(result.ok, false);
  assert.equal(result.persisted, false);
  assert.equal(result.code, 'invalid-submission');
  assert.equal(result.submission, null);
  assert.equal(addIfAbsentCalls, 0);
});

test('受付成功を明示するまで未送信結果を削除せず、完全一致した対象だけ削除する', async () => {
  const storage = createAtomicMemoryStorage();
  const pending = new PendingRankingSubmissions({ storage });
  const submission = createSubmission();
  await pending.enqueue(submission);

  assert.equal(pending.getSnapshot().count, 1);
  const removed = await pending.markAccepted(submission);
  assert.equal(removed.ok, true);
  assert.equal(removed.removed, true);
  assert.equal((await pending.refresh()).count, 0);
  assert.equal(storage.peek(SUBMISSION_ID), null);
});

test('同じ登録番号と完全に同じ結果は1件のまま保持する', async () => {
  const pending = new PendingRankingSubmissions({ storage: createAtomicMemoryStorage() });
  await pending.enqueue(createSubmission());
  const duplicate = await pending.enqueue(createSubmission());

  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.code, 'already-queued');
  assert.equal(pending.getSnapshot().count, 1);
});

test('同じ登録番号を別内容へ使い回した場合は拒否する', async () => {
  const pending = new PendingRankingSubmissions({ storage: createAtomicMemoryStorage() });
  await pending.enqueue(createSubmission());
  const conflict = await pending.enqueue(createSubmission({
    result: { ...createSubmission().result, score: 9999 }
  }));

  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, 'submission-conflict');
  assert.equal(pending.getSnapshot().items[0].result.score, 3200);
});

test('2タブ相当が同じ登録番号へ別内容を同時保存しても片方だけを原子的に確保する', async () => {
  const storage = createAtomicMemoryStorage();
  const firstTab = new PendingRankingSubmissions({ storage });
  const secondTab = new PendingRankingSubmissions({ storage });
  const first = createSubmission();
  const second = createSubmission({ result: { ...first.result, score: 9999 } });

  const results = await Promise.all([
    firstTab.enqueue(first),
    secondTab.enqueue(second)
  ]);

  assert.equal(results.filter((result) => result.code === 'queued').length, 1);
  assert.equal(results.filter((result) => result.code === 'submission-conflict').length, 1);
  assert.equal(storage.entries().length, 1);
});

test('同じ登録番号でも時刻やクライアント版が違う受付削除は拒否する', async () => {
  const storage = createAtomicMemoryStorage();
  const pending = new PendingRankingSubmissions({ storage });
  const original = createSubmission();
  await pending.enqueue(original);

  const mismatch = await pending.markAccepted({ ...original, createdAt: original.createdAt + 1 });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, 'submission-conflict');
  assert.equal((await pending.refresh()).count, 1);
});

test('壊れた1件は上書きせず保持し、別の正常な結果を保存できる', async () => {
  const brokenId = 'b'.repeat(16);
  const brokenRecord = { submissionId: brokenId, serialized: '{broken-json' };
  const storage = createAtomicMemoryStorage([brokenRecord]);
  const pending = new PendingRankingSubmissions({ storage });
  const valid = createSubmission({ submissionId: ALTERNATE_IDS[0] });

  assert.equal((await pending.refresh()).corrupted, true);
  assert.equal((await pending.enqueue(valid)).ok, true);
  assert.deepEqual(storage.peek(brokenId), brokenRecord);
  assert.equal((await pending.refresh()).count, 1);
  assert.equal(pending.getSnapshot().corruptedCount, 1);
});

test('壊れた保存データは非破壊で書き出せ、明示した完全一致対象だけ削除できる', async () => {
  const brokenId = 'c'.repeat(16);
  const brokenRecord = { submissionId: brokenId, serialized: '{broken-json' };
  const storage = createAtomicMemoryStorage([brokenRecord]);
  const pending = new PendingRankingSubmissions({ storage });

  const exported = JSON.parse(await pending.exportRecoveryData());

  assert.equal(exported.exportVersion, 'sainome-ranking-recovery-v1');
  assert.deepEqual(exported.corrupted, [{
    type: 'corrupted',
    submissionId: brokenId,
    serialized: brokenRecord.serialized,
    reason: 'saved-submission-unreadable'
  }]);
  assert.deepEqual(storage.peek(brokenId), brokenRecord);

  const removed = await pending.deleteRecoveryRecord(exported.corrupted[0]);
  assert.deepEqual(removed, { ok: true, removed: true, code: 'removed' });
  assert.equal(storage.peek(brokenId), null);
});

test('保全データの削除に失敗した場合も元の内容を保持する', async () => {
  const brokenRecord = { submissionId: ALTERNATE_IDS[2], serialized: '{broken-json' };
  const storage = createAtomicMemoryStorage([brokenRecord], { failDelete: true });
  const pending = new PendingRankingSubmissions({ storage });
  const snapshot = await pending.refresh();

  const failed = await pending.deleteRecoveryRecord(snapshot.corruptedItems[0]);

  assert.deepEqual(failed, { ok: false, removed: false, code: 'storage-unavailable' });
  assert.deepEqual(storage.peek(brokenRecord.submissionId), brokenRecord);
});

test('旧shared-v1記録は未検証のまま表示し、変換や自動再送をしない', async () => {
  const legacyId = ALTERNATE_IDS[5];
  const legacyRecord = {
    submissionId: legacyId,
    serialized: JSON.stringify({
      version: 'shared-v1',
      submission: { displayName: '旧データ', score: 3200 }
    })
  };
  const storage = createAtomicMemoryStorage([legacyRecord]);
  const pending = new PendingRankingSubmissions({ storage });

  const snapshot = await pending.refresh();
  assert.equal(snapshot.count, 0);
  assert.equal(snapshot.unverifiedCount, 1);
  assert.equal(snapshot.corruptedCount, 0);
  assert.deepEqual(storage.peek(legacyId), legacyRecord);

  const conflict = await pending.enqueue(createSubmission({ submissionId: legacyId }));
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, 'submission-conflict');

  const exported = JSON.parse(await pending.exportRecoveryData());
  assert.equal(exported.unverified[0].contractVersion, 'shared-v1');
  const removed = await pending.deleteRecoveryRecord(exported.unverified[0]);
  assert.equal(removed.removed, true);
  assert.equal(storage.peek(legacyId), null);
});

test('恒久拒否の未送信記録は原子的に隔離し、再送対象から外す', async () => {
  const submission = createSubmission({ submissionId: ALTERNATE_IDS[0] });
  const storage = createAtomicMemoryStorage([recordFor(submission)]);
  const pending = new PendingRankingSubmissions({ storage });

  const isolated = await pending.quarantine(submission, {
    reason: 'ranking-submit-permanent-rejection',
    code: 'request-failed'
  });

  assert.equal(isolated.ok, true);
  assert.equal(isolated.isolated, true);
  assert.equal(isolated.persisted, true);
  const snapshot = await pending.refresh();
  assert.equal(snapshot.count, 0);
  assert.equal(snapshot.quarantineCount, 1);
  assert.equal(storage.peek(submission.submissionId), null);
  assert.equal(storage.quarantineEntries()[0].serialized, recordFor(submission).serialized);
});

test('隔離保存に失敗した場合は未送信記録を残す', async () => {
  const submission = createSubmission({ submissionId: ALTERNATE_IDS[1] });
  const storage = createAtomicMemoryStorage([recordFor(submission)], { failQuarantine: true });
  const pending = new PendingRankingSubmissions({ storage });

  const isolated = await pending.quarantine(submission);

  assert.equal(isolated.ok, false);
  assert.equal(isolated.code, 'storage-unavailable');
  assert.equal((await pending.refresh()).count, 1);
  assert.deepEqual(storage.peek(submission.submissionId), recordFor(submission));
  assert.equal(storage.quarantineEntries().length, 0);
});

test('保存不能でも現在の画面内では結果を保持し、既存の保存値を変更しない', async () => {
  const existing = createSubmission({ submissionId: ALTERNATE_IDS[1] });
  const storage = createAtomicMemoryStorage([recordFor(existing)], { failAdd: true });
  const pending = new PendingRankingSubmissions({ storage });
  const volatile = createSubmission({ submissionId: ALTERNATE_IDS[2] });
  const queued = await pending.enqueue(volatile);

  assert.equal(queued.ok, true);
  assert.equal(queued.persisted, false);
  assert.equal(queued.code, 'storage-unavailable');
  assert.equal(pending.getSnapshot().count, 2);
  assert.deepEqual(storage.peek(existing.submissionId), recordFor(existing));
});

test('永続保存機能がない場合も現在画面内の結果を受付後に消せる', async () => {
  const pending = new PendingRankingSubmissions({ storage: null });
  const submission = createSubmission();
  await pending.enqueue(submission);

  const removed = await pending.markAccepted(submission);
  assert.equal(removed.ok, true);
  assert.equal(removed.removed, true);
  assert.equal(removed.persisted, false);
  assert.equal(pending.getSnapshot().count, 0);
});

test('受付後の保存削除失敗では未送信結果を保持する', async () => {
  const submission = createSubmission();
  const storage = createAtomicMemoryStorage([recordFor(submission)], { failDelete: true });
  const pending = new PendingRankingSubmissions({ storage });

  const removed = await pending.markAccepted(submission);
  assert.equal(removed.ok, false);
  assert.equal(removed.code, 'storage-unavailable');
  assert.deepEqual(storage.peek(SUBMISSION_ID), recordFor(submission));
});

test('対象の保存値が壊れた場合はnot-found成功にせず保持する', async () => {
  const submission = createSubmission();
  const broken = { submissionId: SUBMISSION_ID, serialized: '{broken-json' };
  const storage = createAtomicMemoryStorage([broken]);
  const pending = new PendingRankingSubmissions({ storage });

  const removed = await pending.markAccepted(submission);
  assert.equal(removed.ok, false);
  assert.equal(removed.code, 'submission-conflict');
  assert.deepEqual(storage.peek(SUBMISSION_ID), broken);
});

test('保存領域を確認できない場合はnot-found成功にせず保持する', async () => {
  const submission = createSubmission();
  const storage = createAtomicMemoryStorage(
    [recordFor(submission)],
    { failList: true, failDelete: true }
  );
  const pending = new PendingRankingSubmissions({ storage });

  const removed = await pending.markAccepted(submission);
  assert.equal(removed.ok, false);
  assert.equal(removed.code, 'storage-unavailable');
  assert.deepEqual(storage.peek(SUBMISSION_ID), recordFor(submission));
});

test('別タブが先に対象を削除した場合は原子的な不存在確認後だけnot-foundにする', async () => {
  const submission = createSubmission();
  const storage = createAtomicMemoryStorage([recordFor(submission)]);
  const firstTab = new PendingRankingSubmissions({ storage });
  const secondTab = new PendingRankingSubmissions({ storage });

  assert.equal((await firstTab.markAccepted(submission)).code, 'removed');
  const second = await secondTab.markAccepted(submission);
  assert.equal(second.ok, true);
  assert.equal(second.code, 'not-found');
});

test('上限到達時に既存の未送信結果を捨てず、同時追加でも上限を超えない', async () => {
  const first = createSubmission({ submissionId: ALTERNATE_IDS[3], createdAt: 1 });
  const storage = createAtomicMemoryStorage([recordFor(first)]);
  const firstTab = new PendingRankingSubmissions({ storage, maxItems: 2 });
  const secondTab = new PendingRankingSubmissions({ storage, maxItems: 2 });
  const second = createSubmission({ submissionId: ALTERNATE_IDS[4], createdAt: 2 });
  const third = createSubmission({ submissionId: ALTERNATE_IDS[5], createdAt: 3 });

  const results = await Promise.all([firstTab.enqueue(second), secondTab.enqueue(third)]);
  assert.equal(results.filter((result) => result.code === 'queued').length, 1);
  assert.equal(results.filter((result) => result.code === 'queue-full').length, 1);
  assert.equal(storage.entries().length, 2);
  assert.deepEqual(storage.peek(first.submissionId), recordFor(first));
});

test('未知版、範囲外得点、必須項目欠落、不正な名前とモードを復元しない', async () => {
  const cases = [
    recordFor(createSubmission(), 999),
    recordFor(createSubmission({
      result: { ...createSubmission().result, score: 100_000_001 }
    })),
    recordFor({ ...createSubmission(), createdAt: undefined }),
    recordFor({
      ...createSubmission(),
      result: { ...createSubmission().result, endedReason: undefined }
    }),
    recordFor(createSubmission({ displayName: '\u200b' })),
    recordFor(createSubmission({ displayName: '\u2800' })),
    recordFor(createSubmission({ displayName: '\u0301' })),
    recordFor(createSubmission({ displayName: 'ＡＢＣ' })),
    recordFor(createSubmission({
      result: { ...createSubmission().result, modeId: 'unknown' }
    }))
  ];

  for (const record of cases) {
    const storage = createAtomicMemoryStorage([record]);
    const pending = new PendingRankingSubmissions({ storage });
    const snapshot = await pending.refresh();
    assert.equal(snapshot.corrupted, true);
    assert.equal(snapshot.count, 0);
    assert.deepEqual(storage.peek(record.submissionId), record);
  }
});

test('同時に開いた2タブ相当が別IDを追加しても両方を保持する', async () => {
  const storage = createAtomicMemoryStorage();
  const firstTab = new PendingRankingSubmissions({ storage });
  const secondTab = new PendingRankingSubmissions({ storage });
  const first = createSubmission({ submissionId: ALTERNATE_IDS[3], createdAt: 1 });
  const second = createSubmission({ submissionId: ALTERNATE_IDS[4], createdAt: 2 });

  await Promise.all([firstTab.enqueue(first), secondTab.enqueue(second)]);

  const restored = new PendingRankingSubmissions({ storage });
  assert.deepEqual(
    (await restored.refresh()).items.map((item) => item.submissionId),
    [first.submissionId, second.submissionId]
  );
});

test('古いタブ相当が1件を受付済みにしても別タブの追加を消さない', async () => {
  const storage = createAtomicMemoryStorage();
  const firstTab = new PendingRankingSubmissions({ storage });
  const secondTab = new PendingRankingSubmissions({ storage });
  const first = createSubmission({ submissionId: ALTERNATE_IDS[3], createdAt: 1 });
  const second = createSubmission({ submissionId: ALTERNATE_IDS[4], createdAt: 2 });

  await firstTab.enqueue(first);
  await secondTab.enqueue(second);
  await firstTab.markAccepted(first);

  const restored = new PendingRankingSubmissions({ storage });
  assert.deepEqual(
    (await restored.refresh()).items.map((item) => item.submissionId),
    [second.submissionId]
  );
});

test('既定の保存上限は未送信記録を複数回分保持できる', () => {
  assert.equal(MAX_PENDING_RANKING_SUBMISSIONS >= 20, true);
});
