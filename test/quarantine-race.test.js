import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';
import {IndexedDbRankingStorage, PendingRankingSubmissions} from '../js/pending-ranking-submissions.js';
import {RANKING_CLIENT_VERSION,RANKING_SUBMISSION_CONTRACT_VERSION} from '../js/ranking-client.js';
globalThis.fetch=()=>{throw new Error('network forbidden');};
const SUBMISSION_ID = '12345678-1234-4234-8234-123456789012';
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


test('stale quarantine preserves conflicting pending payload', async () => {
const databaseName='isolated-quarantine-race-'+process.pid+'-'+Date.now();
const sa=new IndexedDbRankingStorage({indexedDB,databaseName});
const sb=new IndexedDbRankingStorage({indexedDB,databaseName});
let reached,release; const atGap=new Promise(r=>reached=r);const gate=new Promise(r=>release=r);
const originalAdd=sb.addIfAbsent.bind(sb);
sb.addIfAbsent=async args=>{reached();await gate;return originalAdd(args);};
const qa=new PendingRankingSubmissions({storage:sa});const qb=new PendingRankingSubmissions({storage:sb});
const A=createSubmission();const B=createSubmission({result:{score:3300}});
const racing=qb.enqueue(B);await atGap;
assert.equal((await qa.enqueue(A)).ok,true);
assert.equal((await qa.quarantine(A)).ok,true);
release();const addB=await racing;
const before=await sa.list();
assert.equal(before.length,1);assert.equal(JSON.parse(before[0].serialized).submission.result.score,3300);
const stale=await qa.quarantine(A);const after=await sa.list();
assert.equal(stale.code,'submission-conflict');assert.equal(after.length,1);assert.equal(after[0].serialized,before[0].serialized);
(await sa.open()).close();(await sb.open()).close();

});

test('repeated quarantine preserves matching and conflicting cases', async () => {
  const storage = new IndexedDbRankingStorage({ indexedDB, databaseName: 'isolated-quarantine-cases-'+process.pid+'-'+Date.now() });
  const args = { submissionId: SUBMISSION_ID, serialized: JSON.stringify({ value: 'A' }), maxItems: 50 };
  await storage.addIfAbsent(args);
  assert.equal((await storage.quarantineIfMatch(args)).status, 'quarantined');
  const original = await storage.listQuarantined();
  assert.equal((await storage.quarantineIfMatch(args)).status, 'already-quarantined');
  await storage.addIfAbsent(args);
  assert.equal((await storage.quarantineIfMatch(args)).status, 'already-quarantined');
  assert.equal((await storage.list()).length, 0);
  const other = { ...args, serialized: JSON.stringify({ value: 'B' }) };
  await storage.addIfAbsent(other);
  const before = await storage.list();
  assert.equal((await storage.quarantineIfMatch(other)).status, 'conflict');
  assert.deepEqual(await storage.list(), before);
  assert.deepEqual(await storage.listQuarantined(), original);
  (await storage.open()).close();
});
