import test from'node:test';import assert from'node:assert/strict';import{DatabaseSync}from'node:sqlite';
import{createReviewAppendHandler}from'../shared/review-live-append.mjs';
import{acceptReviewRequest}from'../shared/review-endpoint-contract.mjs';
import{loadProjectionStatus}from'../shared/review-projection-coordinator.mjs';
import{REVIEW_HEADERS,REVIEW_SCHEMA_FINGERPRINT as schema}from'../shared/review-schema.mjs';
const row=['TEST-C1-live-001','card','2026-10-27T00:00:00Z',3,'rule','normal','N','Y',8,'test-harness','[synthetic]','Y','Good'];
function store(){const sqlite=new DatabaseSync(':memory:');return{sqlite,sql:{exec(query,...args){const q=sqlite.prepare(query);return{toArray:()=>q.all(...args),...(query.startsWith('SELECT')?{}:(q.run(...args),{}))}}},transactionSync(fn){sqlite.exec('BEGIN IMMEDIATE');try{const r=fn();sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}}}
function sheet({throwAfter=false,missing=false}={}){const rows=[[...REVIEW_HEADERS]];let calls=0;return{rows,get calls(){return calls},options:{targetId:'private-test',allowedTestCopyId:'private-test',prefix:'TEST-C1-live-',readRows:async()=>structuredClone(rows),appendRaw:async(id,r,opts)=>{assert.equal(opts.valueInputOption,'RAW');calls++;if(!missing)rows.push(r.map((v,i)=>[3,8].includes(i)?String(v):v));if(throwAfter)throw Error('timeout')}}}}
const request=(body={schema,row},headers={})=>new Request('https://test.invalid/api/reviews',{method:'POST',headers:{Origin:'https://test.invalid',Authorization:'Bearer synthetic.local.token000000',...headers},body:JSON.stringify(body)});
function rig(sheetOpts={}){const s=store(),sh=sheet(sheetOpts);const options={enabled:true,origin:'https://test.invalid',ownerSub:'owner',verifyIdentity:async()=>({sub:'owner'}),atomicAppend:createReviewAppendHandler({storage:s,projectionOptions:sh.options})};return{s,sh,options}}
test('enabled end-to-end: POST commits ledger, projects once, durable status projected',async()=>{
 const{s,sh,options}=rig();try{
  const res=await acceptReviewRequest(request(),options);assert.equal(res.status,200);
  const body=await res.json();assert.equal(body.committed,true);assert.deepEqual(body.row,row);
  assert.equal(sh.rows.length,2);assert.equal(sh.calls,1);
  assert.equal(s.sqlite.prepare('SELECT count(*) n FROM review_test_outbox').get().n,1);
  assert.equal(loadProjectionStatus(s,row[0]).status,'projected');
 }finally{s.sqlite.close()}});
test('retry of the same event is idempotent: one sheet row, one append',async()=>{
 const{s,sh,options}=rig();try{
  for(let i=0;i<2;i++){const res=await acceptReviewRequest(request(),options);assert.equal(res.status,200);assert.equal((await res.json()).committed,true)}
  assert.equal(sh.rows.length,2);assert.equal(sh.calls,1);
 }finally{s.sqlite.close()}});
test('conflicting same-UUID content is rejected; sheet and durable status untouched',async()=>{
 const{s,sh,options}=rig();try{
  assert.equal((await acceptReviewRequest(request(),options)).status,200);
  const conflict=row.map((v,i)=>i===3?1:i===12?'Again':v);
  const res=await acceptReviewRequest(request({schema,row:conflict}),options);assert.equal(res.status,400);
  assert.equal(sh.rows.length,2);assert.equal(sh.calls,1);
  assert.equal(loadProjectionStatus(s,row[0]).status,'projected');
 }finally{s.sqlite.close()}});
test('disabled endpoint never touches ledger or projection',async()=>{
 const{s,sh,options}=rig();try{
  assert.equal((await acceptReviewRequest(request(),{...options,enabled:false})).status,503);
  assert.equal(s.sqlite.prepare("SELECT count(*) n FROM sqlite_master WHERE name='review_test_outbox'").get().n,0);
  assert.equal(sh.rows.length,1);assert.equal(sh.calls,0);
 }finally{s.sqlite.close()}});
test('projection timeout still acks ledger commit; uncertainty reconciles later without re-append',async()=>{
 const{s,sh,options}=rig({throwAfter:true,missing:true});try{
  const res=await acceptReviewRequest(request(),options);assert.equal(res.status,200);
  assert.equal((await res.json()).committed,true);
  assert.equal(loadProjectionStatus(s,row[0]).status,'uncertain');
  sh.rows.push(row.map((v,i)=>[3,8].includes(i)?String(v):v));
  const retry=await acceptReviewRequest(request(),options);assert.equal(retry.status,200);
  assert.equal(sh.calls,1);assert.equal(loadProjectionStatus(s,row[0]).status,'projected');
 }finally{s.sqlite.close()}});
