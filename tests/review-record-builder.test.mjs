import test from'node:test';import assert from'node:assert/strict';import{DatabaseSync}from'node:sqlite';
import{buildAcceptedReviewRecord}from'../shared/review-record-builder.mjs';
import{acceptIntoLedger}from'../shared/review-test-ledger.mjs';
import{validateReviewRow}from'../shared/review-schema.mjs';
const base={reviewId:'ev-1',completed:true,mode:'normal',independentAttempt:true,unaidedCorrect:true,hintUsed:false,performanceRating:4,performanceSource:'rule'};
const at='2026-10-27T00:00:00Z';
const build=(over={},opts={})=>buildAcceptedReviewRecord({event:{...base,...over},cardId:'M1-S1:word:ポイントカード',reviewedAtUtc:at,durationSec:8,source:'app-review-v1',...opts});
test('independent correct maps to eligible Good with preserved raw evidence',()=>{
 const row=build();validateReviewRow(row);
 assert.equal(row[3],'4');assert.equal(row[4],'rule');assert.equal(row[7],'Y');
 assert.equal(row[11],'Y');assert.equal(row[12],'Good');assert.ok(row[10].includes('[scheduler:independent-correct]'));
});
test('explicit self easy/hard become self-sourced eligible grades; unaided failure is Again',()=>{
 const easy=build({selfReport:'easy',performanceRating:4});assert.equal(easy[12],'Easy');assert.equal(easy[4],'self');
 const hard=build({selfReport:'hard',performanceRating:4});assert.equal(hard[12],'Hard');
 const failed=build({unaidedCorrect:false,performanceRating:1});assert.equal(failed[12],'Again');assert.equal(failed[11],'Y');
});
test('hint-assisted, ambiguous, technical and extra-mode evidence never earn a schedule grade',()=>{
 assert.equal(build({hintBeforeAttempt:true})[11],'N');
 assert.equal(build({hintUsed:true})[12],'');
 assert.equal(build({modeled:true})[11],'N');
 const tech=build({technicalIssue:true},{ });assert.equal(tech[11],'N');assert.equal(tech[3],'');assert.equal(tech[4],'pending');
 assert.equal(build({mode:'extra'})[11],'N');
 assert.equal(build({completed:false})[4],'pending');
});
test('same-day policy input yields practice-only record, never a second schedule count',()=>{
 const row=build({},{alreadyScheduledToday:true});
 assert.equal(row[11],'N');assert.equal(row[12],'');assert.ok(row[10].includes('same-day-extra'));
});
test('records flow into the atomic ledger: commit once, conflict rejected',()=>{
 const sqlite=new DatabaseSync(':memory:');
 const s={sql:{exec(query,...args){const q=sqlite.prepare(query);return{toArray:()=>q.all(...args),...(query.startsWith('SELECT')?{}:(q.run(...args),{}))}}},transactionSync(fn){sqlite.exec('BEGIN IMMEDIATE');try{const r=fn();sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}};
 try{
  const row=build();const a=acceptIntoLedger(s,row);assert.equal(a.committed,true);assert.equal(a.duplicate,false);
  assert.equal(acceptIntoLedger(s,build()).duplicate,true);
  assert.throws(()=>acceptIntoLedger(s,build({unaidedCorrect:false,performanceRating:1})),/Conflicting/);
 }finally{sqlite.close()}});
test('missing identity/time and invalid mode are rejected before any row exists',()=>{
 assert.throws(()=>buildAcceptedReviewRecord({event:{...base,reviewId:''},cardId:'c',reviewedAtUtc:at,source:'app-review-v1'}));
 assert.throws(()=>buildAcceptedReviewRecord({event:{...base,mode:'weird'},cardId:'c',reviewedAtUtc:at,source:'app-review-v1'}));
 assert.throws(()=>buildAcceptedReviewRecord({event:base,cardId:'c',reviewedAtUtc:'not-a-date',source:'app-review-v1'}));
});
