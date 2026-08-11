import test from 'node:test';
import assert from 'node:assert/strict';

import { indexedDB } from 'fake-indexeddb';

import { IndexedDbRankingStorage } from '../js/pending-ranking-submissions.js';

function trackReadwriteCompletions(database) {
  const originalTransaction = database.transaction.bind(database);
  let completed = 0;
  database.transaction = (...args) => {
    const transaction = originalTransaction(...args);
    if (args[1] === 'readwrite') {
      transaction.addEventListener('complete', () => { completed += 1; }, { once: true });
    }
    return transaction;
  };
  return () => completed;
}

function deleteDatabase(databaseName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.addEventListener('success', () => resolve(), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
    request.addEventListener(
      'blocked',
      () => reject(new Error('test database deletion was blocked')),
      { once: true }
    );
  });
}

test('実IndexedDBアダプタは同じ番号の確保と完全一致削除を原子的に行う', async () => {
  const databaseName = `sainome-ranking-test-${process.pid}-${Date.now()}-${Math.random()}`;
  const first = new IndexedDbRankingStorage({ indexedDB, databaseName });
  const second = new IndexedDbRankingStorage({ indexedDB, databaseName });
  const reopened = new IndexedDbRankingStorage({ indexedDB, databaseName });
  const adapters = [first, second, reopened];
  const submissionId = '11111111-1111-1111-1111-111111111111';
  const serializedA = JSON.stringify({ source: 'first' });
  const serializedB = JSON.stringify({ source: 'second' });

  try {
    const [firstDatabase, secondDatabase] = await Promise.all([
      first.open(),
      second.open()
    ]);
    const firstCompletions = trackReadwriteCompletions(firstDatabase);
    const secondCompletions = trackReadwriteCompletions(secondDatabase);

    const [firstAdd, secondAdd] = await Promise.all([
      first.addIfAbsent({ submissionId, serialized: serializedA, maxItems: 50 })
        .then((result) => ({ result, completions: firstCompletions() })),
      second.addIfAbsent({ submissionId, serialized: serializedB, maxItems: 50 })
        .then((result) => ({ result, completions: secondCompletions() }))
    ]);

    assert.deepEqual(
      [firstAdd.result.status, secondAdd.result.status].sort(),
      ['added', 'existing']
    );
    assert.equal(firstAdd.completions, 1);
    assert.equal(secondAdd.completions, 1);

    const winner = firstAdd.result.status === 'added'
      ? firstAdd.result.record
      : secondAdd.result.record;
    const observed = firstAdd.result.status === 'existing'
      ? firstAdd.result.record
      : secondAdd.result.record;
    assert.deepEqual(observed, winner);

    const reopenedDatabase = await reopened.open();
    const reopenedCompletions = trackReadwriteCompletions(reopenedDatabase);
    assert.deepEqual(await reopened.list(), [winner]);

    const losingSerialized = winner.serialized === serializedA ? serializedB : serializedA;
    const mismatch = await reopened.deleteIfMatch({
      submissionId,
      serialized: losingSerialized
    });
    assert.equal(mismatch.status, 'conflict');
    assert.equal(reopenedCompletions(), 1);
    assert.deepEqual(await reopened.list(), [winner]);

    const removed = await reopened.deleteIfMatch({
      submissionId,
      serialized: winner.serialized
    });
    assert.equal(removed.status, 'removed');
    assert.equal(reopenedCompletions(), 2);
    assert.deepEqual(await reopened.list(), []);

    const alreadyRemoved = await reopened.deleteIfMatch({
      submissionId,
      serialized: winner.serialized
    });
    assert.equal(alreadyRemoved.status, 'not-found');
    assert.equal(reopenedCompletions(), 3);

    const quarantineSubmissionId = '22222222-2222-4222-8222-222222222222';
    const quarantineSerialized = JSON.stringify({ source: 'quarantine' });
    const addedForQuarantine = await reopened.addIfAbsent({
      submissionId: quarantineSubmissionId,
      serialized: quarantineSerialized,
      maxItems: 50
    });
    assert.equal(addedForQuarantine.status, 'added');
    assert.equal(reopenedCompletions(), 4);

    const quarantined = await reopened.quarantineIfMatch({
      submissionId: quarantineSubmissionId,
      serialized: quarantineSerialized,
      reason: 'permanent-rejection',
      code: 'request-failed',
      quarantinedAt: 1_785_000_000_000
    });
    assert.equal(quarantined.status, 'quarantined');
    assert.equal(reopenedCompletions(), 5);
    assert.deepEqual(await reopened.list(), []);
    assert.deepEqual(await reopened.listQuarantined(), [quarantined.record]);

    const quarantineMismatch = await reopened.deleteQuarantinedIfMatch({
      quarantineId: quarantined.record.quarantineId,
      serialized: `${quarantineSerialized}-mismatch`
    });
    assert.equal(quarantineMismatch.status, 'conflict');
    assert.equal(reopenedCompletions(), 6);

    const quarantineRemoved = await reopened.deleteQuarantinedIfMatch({
      quarantineId: quarantined.record.quarantineId,
      serialized: quarantineSerialized
    });
    assert.equal(quarantineRemoved.status, 'removed');
    assert.equal(reopenedCompletions(), 7);
    assert.deepEqual(await reopened.listQuarantined(), []);
  } finally {
    for (const adapter of adapters) {
      if (!adapter.databasePromise) continue;
      try {
        const database = await adapter.databasePromise;
        database.close();
      } catch {
        // Opening may have failed before cleanup.
      }
    }
    await deleteDatabase(databaseName);
  }
});
