import test from'node:test';import assert from'node:assert/strict';import{DatabaseSync}from'node:sqlite';
import{coordinatedProjection,loadProjectionStatus}from'../shared/review-projection-coordinator.mjs';
import{acceptIntoLedger}from'../shared/review-test-ledger.mjs';
import{REVIEW_HEADERS}from'../shared/review-schema.mjs';
const row=['TEST-C1-coord-001','card','2026-10-27T00:00:00Z',3,'rule','normal','N','Y',8,'test-harness','[synthetic]','Y','Good'];
function store(){const sqlite=new DatabaseSync(':memory:');return{sqlite,sql:{exec(query,...args){const q=sqlite.prepare(query);return{toArray:()=>q.all(...args),...(query.startsWith('SELECT')?{}:(q.run(...args),{}))}}},transactionSync(fn){sqlite.exec('BEGIN IMMEDIATE');try{const r=fn();sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}}}
function rig({throwAfter=false,missing=false,slow=false}={}){const rows=[[...REVIEW_HEADERS]];let calls=0;return{rows,get calls(){return calls},options:{targetId:'private-test',allowedTestCopyId:'private-test',prefix:'TEST-C1-coord-',readRows:async()=>structuredClone(rows),appendRaw:async(id,r,opts)=>{assert.equal(opts.valueInputOption,'RAW');calls++;if(slow)await new Promise(r=>setTimeout(r,50));if(!missing)rows.push(r.map((v,i)=>[3,8].includes(i)?String(v):v));if(throwAfter)throw Error('timeout')}}}}
test('fresh row projects once, persists durable status and ledger mark; later call is a no-op',async()=>{
 const s=store(),r=rig();try{
  const a=await coordinatedProjection(s,row,r.options);assert.equal(a.projected,true);assert.equal(a.appended,true);assert.equal(a.attempts,1);
  assert.deepEqual(loadProjectionStatus(s,row[0]).status,'projected');
  assert.equal(s.sqlite.prepare('SELECT projected FROM review_test_outbox WHERE review_id=?').get(row[0]).projected,1);
  const b=await coordinatedProjection(s,row,r.options);assert.equal(b.projected,true);assert.equal(b.appended,false);assert.equal(r.calls,1);
 }finally{s.sqlite.close()}});
test('lost reply reconciles via readback and is never appended twice',async()=>{
 const s=store(),r=rig({throwAfter:true});try{
  const a=await coordinatedProjection(s,row,r.options);assert.equal(a.projected,true);assert.equal(a.reconciled,true);
  assert.equal(loadProjectionStatus(s,row[0]).status,'projected');
  await coordinatedProjection(s,row,r.options);assert.equal(r.calls,1);
 }finally{s.sqlite.close()}});
test('missing readback stays uncertain across restart; owner reconciliation closes it without append',async()=>{
 const s=store(),r=rig({throwAfter:true,missing:true});try{
  const a=await coordinatedProjection(s,row,r.options);assert.equal(a.projected,false);assert.equal(a.pending,true);
  assert.equal(loadProjectionStatus(s,row[0]).status,'uncertain');
  // Simulated restart path: durable uncertain disables append on retry.
  const b=await coordinatedProjection(s,row,r.options);assert.equal(b.projected,false);assert.equal(r.calls,1);
  // Owner verified the row exists in the copy; next attempt only reconciles.
  r.rows.push(row.map((v,i)=>[3,8].includes(i)?String(v):v));
  const c=await coordinatedProjection(s,row,r.options);assert.equal(c.projected,true);assert.equal(c.appended,false);assert.equal(r.calls,1);
  assert.equal(loadProjectionStatus(s,row[0]).status,'projected');
 }finally{s.sqlite.close()}});
test('coordinator failure leaves in_flight, which coerces to uncertain and blocks append after recovery',async()=>{
 const s=store(),r=rig();try{
  r.rows[0]=['broken','header'];
  await assert.rejects(coordinatedProjection(s,row,r.options),/Header mismatch/);
  assert.equal(loadProjectionStatus(s,row[0]).status,'in_flight');
  r.rows[0]=[...REVIEW_HEADERS];
  const b=await coordinatedProjection(s,row,r.options);assert.equal(b.projected,false);assert.equal(r.calls,0);
  assert.equal(loadProjectionStatus(s,row[0]).status,'uncertain');
  r.rows.push([...row]);
  const c=await coordinatedProjection(s,row,r.options);assert.equal(c.projected,true);assert.equal(r.calls,0);
 }finally{s.sqlite.close()}});
test('concurrent same-key calls serialize to a single append; both callers see projected',async()=>{
 const s=store(),r=rig({slow:true});try{
  const[a,b]=await Promise.all([coordinatedProjection(s,row,r.options),coordinatedProjection(s,row,r.options)]);
  assert.equal(a.projected,true);assert.equal(b.projected,true);assert.equal(r.calls,1);
  assert.equal(s.sqlite.prepare('SELECT count(*) n FROM review_test_outbox').get().n,1);
 }finally{s.sqlite.close()}});
test('conflicting duplicate UUID is rejected before any status change or append',async()=>{
 const s=store(),r=rig();try{
  acceptIntoLedger(s,row.map((v,i)=>i===12?'Again':v));
  await assert.rejects(coordinatedProjection(s,row,r.options),/Conflicting/);
  assert.equal(loadProjectionStatus(s,row[0]),null);assert.equal(r.calls,0);
 }finally{s.sqlite.close()}});
