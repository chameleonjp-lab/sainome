import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PendingRankingSubmissions,
  PENDING_RANKING_LEGACY_CONTRACT_VERSION,
  PENDING_RANKING_STORAGE_VERSION
} from '../js/pending-ranking-submissions.js';
import {
  RANKING_CLIENT_VERSION,
  RANKING_NAME_CONTRACT_VERSION,
  RANKING_SUBMISSION_CONTRACT_VERSION
} from '../js/ranking-client.js';

const SUBMISSION_ID = '12345678-1234-4234-8234-123456789012';
const SECOND_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CREATED_AT = 1_785_000_000_000;

function createSubmission(overrides = {}) {
  const result = {
    modeId: '300-seconds',
    score: 3200,
    clearedDice: 8,
    maxChain: 0,
    endedReason: 'time-up',
    ...(overrides.result ?? {})
  };
  return {
    submissionId: SUBMISSION_ID,
    contractVersion: RANKING_SUBMISSION_CONTRACT_VERSION,
    clientVersion: RANKING_CLIENT_VERSION,
    displayName: 'プレイヤー',
    result,
    createdAt: CREATED_AT,
    issuedAt: CREATED_AT,
    earliestSubmitAt: CREATED_AT + 303_000,
    expiresAt: CREATED_AT + 86_400_000,
    ...overrides,
    result
  };
}

function createDirectSubmission(overrides = {}) {
  const result = {
    modeId: '300-seconds',
    score: 1800,
    clearedDice: 5,
    maxChain: 0,
    endedReason: 'retired',
    ...(overrides.result ?? {})
  };
  return {
    kind: 'direct-name',
    submissionId: 'direct-test-12345678',
    contractVersion: RANKING_NAME_CONTRACT_VERSION,
    clientVersion: RANKING_CLIENT_VERSION,
    displayName: 'プレイヤー',
    result,
    createdAt: CREATED_AT,
    ...overrides,
    result
  };
}

function serialize(submission, version = PENDING_RANKING_STORAGE_VERSION) {
  return JSON.stringify({ version, submission });
}

function createMemoryStorage(initial = []) {
  const records = new Map(initial.map((record) => [record.submissionId, { ...record }]));
  const quarantined = new Map();
  return {
    async list() {
      return [...records.values()].map((record) => ({ ...record }));
    },
    async addIfAbsent({ submissionId, serialized, maxItems }) {
      const existing = records.get(submissionId);
      if (existing) return { status: 'existing', record: { ...existing } };
      if (records.size >= maxItems) return { status: 'full', record: null };
      const record = { submissionId, serialized };
      records.set(submissionId, record);
      return { status: 'added', record: { ...record } };
    },
    async deleteIfMatch({ submissionId, serialized }) {
      const existing = records.get(submissionId);
      if (!existing) return { status: 'not-found', record: null };
      if (existing.serialized !== serialized) {
        return { status: 'conflict', record: { ...existing } };
      }
      records.delete(submissionId);
      return { status: 'removed', record: { ...existing } };
    },
    async listQuarantined() {
      return [...quarantined.values()].map((record) => ({ ...record }));
    },
    async quarantineIfMatch(entry) {
      const existing = records.get(entry.submissionId);
      if (!existing) return { status: 'not-found', record: null };
      if (existing.serialized !== entry.serialized) {
        return { status: 'conflict', record: { ...existing } };
      }
      const quarantineId = `pending:${entry.submissionId}`;
      const record = { quarantineId, source: 'pending-submission', ...entry };
      quarantined.set(quarantineId, record);
      records.delete(entry.submissionId);
      return { status: 'quarantined', record: { ...record } };
    },
    async deleteQuarantinedIfMatch({ quarantineId, serialized }) {
      const existing = quarantined.get(quarantineId);
      if (!existing) return { status: 'not-found', record: null };
      if (existing.serialized !== serialized) {
        return { status: 'conflict', record: { ...existing } };
      }
      quarantined.delete(quarantineId);
      return { status: 'removed', record: { ...existing } };
    },
    get(submissionId) {
      return records.get(submissionId) ?? null;
    }
  };
}

test('300秒の未送信記録を保存し、作り直しても復元する', async () => {
  const storage = createMemoryStorage();
  const first = new PendingRankingSubmissions({ storage });
  const queued = await first.enqueue(createSubmission());

  assert.equal(queued.ok, true);
  assert.equal(queued.persisted, true);
  assert.equal(queued.code, 'queued');

  const restored = await new PendingRankingSubmissions({ storage }).refresh();
  assert.equal(restored.count, 1);
  assert.deepEqual(restored.items[0], createSubmission());
});

test('プレイ番号なしの300秒結果も保存して復元する', async () => {
  const storage = createMemoryStorage();
  const manager = new PendingRankingSubmissions({ storage });
  const direct = createDirectSubmission();

  assert.equal((await manager.enqueue(direct)).ok, true);
  const snapshot = await new PendingRankingSubmissions({ storage }).refresh();
  assert.equal(snapshot.count, 1);
  assert.deepEqual(snapshot.items[0], direct);
});

test('廃止した60秒・180秒記録は再送待ちへ入れない', async () => {
  const manager = new PendingRankingSubmissions({ storage: createMemoryStorage() });
  for (const modeId of ['60-seconds', '180-seconds']) {
    const result = await manager.enqueue(createDirectSubmission({
      submissionId: `direct-${modeId}-record`,
      result: { modeId }
    }));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'invalid-submission');
  }
  assert.equal((await manager.refresh()).count, 0);
});

test('同じ登録番号の同一内容は1件のまま、別内容は競合として拒否する', async () => {
  const manager = new PendingRankingSubmissions({ storage: createMemoryStorage() });
  const submission = createSubmission();

  assert.equal((await manager.enqueue(submission)).code, 'queued');
  assert.equal((await manager.enqueue(submission)).code, 'already-queued');
  const conflict = await manager.enqueue(createSubmission({ result: { score: 9999 } }));
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, 'submission-conflict');
  assert.equal((await manager.refresh()).count, 1);
});

test('受付済みになった完全一致記録だけを削除する', async () => {
  const storage = createMemoryStorage();
  const manager = new PendingRankingSubmissions({ storage });
  const submission = createSubmission();
  await manager.enqueue(submission);

  const conflict = await manager.markAccepted(createSubmission({ result: { score: 4000 } }));
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, 'submission-conflict');

  const accepted = await manager.markAccepted(submission);
  assert.equal(accepted.ok, true);
  assert.equal((await manager.refresh()).count, 0);
});

test('保存機能がない場合も現在画面内の未送信結果を保持する', async () => {
  const manager = new PendingRankingSubmissions({ storage: null });
  const queued = await manager.enqueue(createDirectSubmission());

  assert.equal(queued.ok, true);
  assert.equal(queued.persisted, false);
  assert.equal(queued.code, 'storage-unavailable');
  const snapshot = await manager.refresh();
  assert.equal(snapshot.count, 1);
  assert.equal(snapshot.persisted, false);
});

test('保存領域が応答しない場合は時間切れとして揮発保存へ切り替える', async () => {
  const manager = new PendingRankingSubmissions({
    storage: {
      list: () => new Promise(() => {}),
      addIfAbsent: () => new Promise(() => {}),
      listQuarantined: async () => []
    },
    storageTimeoutMs: 5
  });
  const queued = await manager.enqueue(createDirectSubmission());

  assert.equal(queued.ok, true);
  assert.equal(queued.persisted, false);
  assert.equal(queued.code, 'storage-timeout');
  assert.equal((await manager.refresh()).count, 1);
});

test('保存上限では既存記録を捨てない', async () => {
  const manager = new PendingRankingSubmissions({ storage: null, maxItems: 1 });
  await manager.enqueue(createSubmission());
  const full = await manager.enqueue(createSubmission({ submissionId: SECOND_ID }));

  assert.equal(full.ok, false);
  assert.equal(full.code, 'queue-full');
  assert.equal((await manager.refresh()).count, 1);
});

test('旧shared-v1記録は未検証として表示し、自動再送しない', async () => {
  const legacy = createSubmission();
  const storage = createMemoryStorage([{
    submissionId: legacy.submissionId,
    serialized: JSON.stringify({
      version: PENDING_RANKING_LEGACY_CONTRACT_VERSION,
      submission: {
        ...legacy,
        contractVersion: PENDING_RANKING_LEGACY_CONTRACT_VERSION
      }
    })
  }]);
  const snapshot = await new PendingRankingSubmissions({ storage }).refresh();

  assert.equal(snapshot.count, 0);
  assert.equal(snapshot.unverified, true);
  assert.equal(snapshot.unverifiedCount, 1);
});

test('恒久拒否された記録を再送対象から隔離する', async () => {
  const storage = createMemoryStorage();
  const manager = new PendingRankingSubmissions({ storage });
  const submission = createSubmission();
  await manager.enqueue(submission);

  const isolated = await manager.quarantine(submission, {
    reason: 'ranking-submit-permanent-rejection',
    code: 'game-not-found'
  });
  const snapshot = await manager.refresh();

  assert.equal(isolated.ok, true);
  assert.equal(isolated.isolated, true);
  assert.equal(snapshot.count, 0);
  assert.equal(snapshot.quarantineCount, 1);
  assert.equal(snapshot.quarantinedItems[0].code, 'game-not-found');
});

test('保全データを書き出し、確認した隔離記録だけ削除できる', async () => {
  const storage = createMemoryStorage();
  const manager = new PendingRankingSubmissions({ storage });
  const submission = createSubmission();
  await manager.enqueue(submission);
  await manager.quarantine(submission);

  const before = await manager.refresh();
  const exported = JSON.parse(await manager.exportRecoveryData());
  assert.equal(exported.exportVersion, 'sainome-ranking-recovery-v1');
  assert.equal(exported.quarantined.length, 1);

  const removed = await manager.deleteRecoveryRecord(before.quarantinedItems[0]);
  assert.equal(removed.ok, true);
  assert.equal(removed.removed, true);
  assert.equal((await manager.refresh()).quarantineCount, 0);
});

test('不正な名前・得点・終了理由は保存しない', async () => {
  const manager = new PendingRankingSubmissions({ storage: createMemoryStorage() });
  const invalid = [
    createSubmission({ displayName: '' }),
    createSubmission({ result: { score: -1 } }),
    createSubmission({ result: { endedReason: 'unknown' } })
  ];
  for (const submission of invalid) {
    const result = await manager.enqueue(submission);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'invalid-submission');
  }
});
