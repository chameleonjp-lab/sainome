import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';
import { captureRankingRun, normalizeRankingRun } from '../js/ranking-run.js';
import { RankingClient, RANKING_CLIENT_VERSION, RANKING_NAME_CONTRACT_VERSION, createSubmissionId, isValidRankingSubmissionId } from '../js/ranking-client.js';
import { IndexedDbRankingStorage, PendingRankingSubmissions } from '../js/pending-ranking-submissions.js';
import { prepareDirectRankingSubmission, submitPendingDirectRanking } from '../js/ranking-submission-flow.js';
const MODE='300-seconds', ID='11111111-1111-4111-8111-111111111111';
const result=Object.freeze({modeId:MODE,score:1200,clearedDice:4,maxChain:0,endedReason:'time-up'});

test('start captures immutable participation and secure UUID; guests and unavailable crypto cannot publish',()=>{
 const run=captureRankingRun('開始名',MODE,{randomUUID:()=>ID});
 assert.equal(run.submissionId,ID);assert.equal(run.displayName,'開始名');assert.equal(run.clientVersion,RANKING_CLIENT_VERSION);assert.equal(Object.isFrozen(run),true);
 assert.equal(captureRankingRun('',MODE),null);assert.equal(captureRankingRun('名前',MODE,{}),null);
 assert.equal(isValidRankingSubmissionId(createSubmissionId({getRandomValues:bytes=>bytes.fill(42)})),true);
 assert.throws(()=>normalizeRankingRun(run,{displayName:'後の名前',modeId:MODE}));
 assert.deepEqual(normalizeRankingRun(JSON.parse(JSON.stringify(run)),{displayName:'開始名',modeId:MODE}),run);
});

test('lost acceptance response survives IndexedDB reload and resends the same UUID/name/version once',async()=>{
 const storage=new IndexedDbRankingStorage({indexedDB,databaseName:`receipt-${crypto.randomUUID()}`});
 const queue=new PendingRankingSubmissions({storage});
 const run=captureRankingRun('開始名',MODE,{randomUUID:()=>ID});
 const submission=await prepareDirectRankingSubmission({pendingSubmissions:queue,displayName:run.displayName,result,submissionId:run.submissionId,clientVersion:'sainome-old-client',now:()=>run.createdAt});
 const calls=[], receipts=new Map();let writes=0,lose=true;
 const client=new RankingClient({url:'https://example.supabase.co',publishableKey:'sb_publishable_test_test_test',fetchImpl:async(url,options)=>{
  const payload=JSON.parse(options.body);calls.push({url,payload});
  assert.ok(url.endsWith('/submit_score_once_shared_v1'));
  let receipt=receipts.get(payload.p_submission_id);
  if(!receipt){writes++;receipt={accepted:true,result_normalized_name:payload.p_display_name,result_first_score:payload.p_score,result_display_name:payload.p_display_name,result_best_score:payload.p_score,result_play_count:1,is_first_play:true,is_new_best:true,was_duplicate:false};receipts.set(payload.p_submission_id,receipt);}
  else receipt={...receipt,was_duplicate:true};
  if(lose){lose=false;throw Error('accepted response was lost');}
  return {ok:true,status:200,json:async()=>[receipt]};
 }});
 await assert.rejects(()=>submitPendingDirectRanking({rankingClient:client,pendingSubmissions:queue,submission}));
 const restored=new PendingRankingSubmissions({storage:new IndexedDbRankingStorage({indexedDB,databaseName:storage.databaseName})});
 const saved=(await restored.refresh()).items[0];
 assert.equal(saved.displayName,'開始名');assert.equal(saved.clientVersion,'sainome-old-client');assert.equal(saved.submissionId,ID);
 const outcome=await submitPendingDirectRanking({rankingClient:client,pendingSubmissions:restored,submission:saved});
 assert.equal(outcome.outcome.wasDuplicate,true);assert.equal(writes,1);assert.equal((await restored.refresh()).count,0);assert.deepEqual(calls[1].payload,calls[0].payload);
});

test('old direct-score records are preserved as unverified and never assigned a new UUID',async()=>{
 const storage=new IndexedDbRankingStorage({indexedDB,databaseName:`legacy-${crypto.randomUUID()}`});
 const submission={kind:'direct-name',submissionId:'direct-old-12345678',contractVersion:'sainome-name-v1',clientVersion:RANKING_CLIENT_VERSION,displayName:'旧名',result,createdAt:100};
 const serialized=JSON.stringify({version:2,submission});
 await storage.addIfAbsent({submissionId:submission.submissionId,serialized,maxItems:50});
 const queue=new PendingRankingSubmissions({storage});const snapshot=await queue.refresh();
 assert.equal(snapshot.count,0);assert.equal(snapshot.unverifiedItems.length,1);assert.equal((await storage.list())[0].serialized,serialized);
 assert.ok((await queue.exportRecoveryData()).includes('direct-old-12345678'));
});

test('finalized UUID rejects a changed result and retains the original queue entry',async()=>{
 const queue=new PendingRankingSubmissions({storage:null});
 const args={pendingSubmissions:queue,displayName:'同じ名前',result,submissionId:ID,now:()=>100};
 assert.equal((await prepareDirectRankingSubmission(args)).canSubmit,true);
 const conflict=await prepareDirectRankingSubmission({...args,result:{...result,score:9999}});
 assert.equal(conflict.canSubmit,false);assert.equal((await queue.refresh()).items[0].result.score,1200);
 assert.equal(RANKING_NAME_CONTRACT_VERSION,'common-score-receipt-v1');
});

test('a receipt acknowledgement clears only its matching active save, never a newer play',async()=>{
 const {clearAcceptedRankingState}=await import('../js/ranking-run.js');
 const run={submissionId:ID,displayName:'開始名',clientVersion:'captured-version'};let clears=0;
 const storage={load:async()=>({status:'available',state:{rankingRun:run},serialized:'original'}),clear:async options=>{clears++;assert.equal(options.expectedSerialized,'original');return {status:'removed'};}};
 assert.equal((await clearAcceptedRankingState(storage,{...run,submissionId:'another-play'})).status,'not-matching');assert.equal(clears,0);
 assert.equal((await clearAcceptedRankingState(storage,run)).status,'removed');assert.equal(clears,1);
 storage.load=async()=>({status:'available',state:{rankingRun:null},serialized:'legacy'});
 assert.equal((await clearAcceptedRankingState(storage,run)).status,'not-matching');assert.equal(clears,1);
});
