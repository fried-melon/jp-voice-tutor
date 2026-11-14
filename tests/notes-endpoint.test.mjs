// Synthetic notes-endpoint tests: fake env + node:sqlite D1 shim. FAKE data only.
// Owner auth/origin/gate are enforced in worker/index.mjs upstream of handleNotes;
// these tests cover the handler contract itself.
import test from'node:test';import assert from'node:assert/strict';import{DatabaseSync}from'node:sqlite';import{readFileSync}from'node:fs';import{handleNotes}from'../worker/notes-endpoint.mjs';
function d1Shim(db){function prepare(sql){function bind(...args){const stmt=db.prepare(sql);return{run:async()=>{const r=stmt.run(...args);return{success:true,meta:{changes:r.changes}};},all:async()=>({results:stmt.all(...args)}),first:async()=>stmt.get(...args)};}return{bind};}return{prepare};}
function setup(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(readFileSync('worker/notes-schema.sql','utf8'));db.exec(readFileSync('worker/notes-migration-002.sql','utf8'));const env={NOTES_DB:d1Shim(db)};const reply=(status,data)=>({status,data});const identity={sub:'fake-owner-sub'};return{env,reply,identity,db};}
const post=(path,payload)=>new Request('https://worker.test'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
const SESSION={session_id:'fake-s1',started_at:'2026-01-07T00:00:00Z',duration_s:240,lesson_id:'M1-S1',voice_mode:'natural',end_state:'completed',transcript:[{role:'clerk',text:'いらっしゃいませ',ts:'2026-01-07T00:00:01Z'},{role:'learner',text:'テストです',ts:'2026-01-07T00:00:05Z'}],evidence:[{card_id:'CARD-1',heard_asr_phrases:['ポイントカード'],mo_ichido_count:1,completed:true}]};
test('write session: 200 + rows stored; server assigns seq by array order',async()=>{
 const{env,reply,identity}=setup();
 const r=await handleNotes(post('/api/notes/session',SESSION),env,identity,reply);
 assert.equal(r.status,200);assert.deepEqual(r.data,{recorded:true,transcript_entries:2,evidence_cards:1,snapshot:'none'});
 const g=await handleNotes(post('/api/notes/get',{session_id:'fake-s1'}),env,identity,reply);
 assert.deepEqual(g.data.transcript.map(x=>x.seq),[0,1]);assert.equal(g.data.transcript[1].role,'learner');
});
test('idempotent retry: identical re-POST keeps single rows',async()=>{
 const{env,reply,identity}=setup();
 await handleNotes(post('/api/notes/session',SESSION),env,identity,reply);
 const r=await handleNotes(post('/api/notes/session',SESSION),env,identity,reply);
 assert.equal(r.status,200);
 const g=await handleNotes(post('/api/notes/get',{session_id:'fake-s1'}),env,identity,reply);
 assert.equal(g.data.transcript.length,2);assert.equal(g.data.evidence.length,1);
});

test('review events: client promotion fields are never honored (forged rating/count stored normalized)',async()=>{
 const{env,reply,identity,db}=setup();
 const ev={event_id:'fake-ev-1',card_id:'M1-S1:word',kind:'word',outcome:'hinted',scheduler_rating:4,at:'2026-01-07T00:01:00Z',counts_for_schedule:true};
 const r=await handleNotes(post('/api/notes/session',{...SESSION,review_events:[ev]}),env,identity,reply);
 assert.equal(r.status,200);
 const row=db.prepare('SELECT outcome,scheduler_rating,counts_for_schedule FROM review_events WHERE event_id=?').get('fake-ev-1');
 assert.equal(row.outcome,'hinted');
 assert.equal(row.scheduler_rating,null,'forged rating dropped');
 assert.equal(row.counts_for_schedule,0,'forged schedule count dropped');
 const g=await handleNotes(post('/api/notes/get',{session_id:'fake-s1'}),env,identity,reply);
 assert.equal(g.data.review_events[0].scheduler_rating,null);
 assert.equal(!!g.data.review_events[0].counts_for_schedule,false);
});
test('review events: invalid rating/outcome still rejected',async()=>{
 const{env,reply,identity}=setup();
 const bad1={event_id:'e1',card_id:'M1-S1:word',kind:'word',outcome:'hinted',scheduler_rating:9,at:'2026-01-07T00:01:00Z'};
 let r=await handleNotes(post('/api/notes/session',{...SESSION,review_events:[bad1]}),env,identity,reply);
 assert.equal(r.status,400);assert.equal(r.data.error,'invalid_review_event');
 const bad2={event_id:'e2',card_id:'M1-S1:word',kind:'word',outcome:'mastered',at:'2026-01-07T00:01:00Z'};
 r=await handleNotes(post('/api/notes/session',{...SESSION,review_events:[bad2]}),env,identity,reply);
 assert.equal(r.status,400);
});

test('list returns sessions newest-first',async()=>{
 const{env,reply,identity}=setup();
 await handleNotes(post('/api/notes/session',SESSION),env,identity,reply);
 await handleNotes(post('/api/notes/session',{...SESSION,session_id:'fake-s2',started_at:'2026-01-08T00:00:00Z',transcript:[],evidence:[]}),env,identity,reply);
 const r=await handleNotes(post('/api/notes/list',{}),env,identity,reply);
 assert.deepEqual(r.data.sessions.map(s=>s.session_id),['fake-s2','fake-s1']);
});
test('validation: bad role, oversized text, bad ids rejected; GET rejected',async()=>{
 const{env,reply,identity}=setup();
 let r=await handleNotes(post('/api/notes/session',{...SESSION,transcript:[{role:'hacker',text:'x',ts:'t'}]}),env,identity,reply);
 assert.equal(r.status,400);assert.equal(r.data.error,'invalid_transcript_entry');
 r=await handleNotes(post('/api/notes/session',{...SESSION,transcript:[{role:'clerk',text:'x'.repeat(4001),ts:'t'}]}),env,identity,reply);
 assert.equal(r.status,400);
 r=await handleNotes(post('/api/notes/session',{...SESSION,session_id:''}),env,identity,reply);
 assert.equal(r.status,400,'invalid_session');
 r=await handleNotes(new Request('https://worker.test/api/notes/list',{method:'GET'}),env,identity,reply);
 assert.equal(r.status,405);
});
test('sub-1s session WITH transcript is retained; empty sub-1s produces no session row',async()=>{
 const{env,reply,identity}=setup();
 const r=await handleNotes(post('/api/notes/session',{...SESSION,session_id:'fake-s3',duration_s:0}),env,identity,reply);
 assert.equal(r.status,200);
 const l=await handleNotes(post('/api/notes/list',{}),env,identity,reply);
 assert.equal(l.data.sessions.length,1); // transcript present -> retained
 const r2=await handleNotes(post('/api/notes/session',{...SESSION,session_id:'fake-s4',duration_s:0,transcript:[],evidence:[]}),env,identity,reply);
 assert.equal(r2.status,200); // endpoint reports accepted...
 const l2=await handleNotes(post('/api/notes/list',{}),env,identity,reply);
 assert.equal(l2.data.sessions.length,1); // ...but the empty sub-1s session row is skipped by the store
});

test('delete: removes session with cascade, idempotent on repeat',async()=>{
 const{env,reply}=setup();
 await handleNotes(post('/api/notes/session',SESSION),env,{sub:'fake-owner-sub'},reply);
 const del=await handleNotes(post('/api/notes/delete',{session_id:SESSION.session_id}),env,{sub:'fake-owner-sub'},reply);
 assert.equal(del.status,200);assert.deepEqual(del.data,{deleted:true,mastery_invalidated:0});
 const l=await handleNotes(post('/api/notes/list',{}),env,{sub:'fake-owner-sub'},reply);
 assert.equal(l.data.sessions.length,0);
 const again=await handleNotes(post('/api/notes/delete',{session_id:SESSION.session_id}),env,{sub:'fake-owner-sub'},reply);
 assert.equal(again.status,200); // repeat delete is a no-op success
 const badReq=await handleNotes(post('/api/notes/delete',{}),env,{sub:'fake-owner-sub'},reply);
 assert.equal(badReq.status,400);
});

test('oversize snapshot: transcript+evidence preserved, visible rejection flag, snapshot absent',async()=>{
 const{env,reply,identity}=setup();
 const big={notes_version:'notes-v1',content_version:'1.3.2',summary:{comments:['x'.repeat(9000)]}};
 const r=await handleNotes(post('/api/notes/session',{...SESSION,session_id:'fake-big',notes_version:'notes-v1',content_version:'1.3.2',notes_snapshot:big}),env,identity,reply);
 assert.equal(r.status,200); // NOT a 400 drop: the conversation itself is never lost over a note
 assert.equal(r.data.snapshot_rejected,'invalid_notes_snapshot');
 assert.equal(r.data.snapshot,'rejected_invalid');
 const g=await handleNotes(post('/api/notes/get',{session_id:'fake-big'}),env,identity,reply);
 assert.equal(g.data.transcript.length,2); // transcript preserved separately
 assert.equal(g.data.evidence.length,1);
 assert.equal(g.data.snapshot,null);
});
test('snapshot retry after rejection: valid retry attaches; conflicting retry still 409',async()=>{
 const{env,reply,identity}=setup();
 const big={notes_version:'notes-v1',content_version:'1.3.2',summary:{comments:['x'.repeat(9000)]}};
 await handleNotes(post('/api/notes/session',{...SESSION,session_id:'fake-retry',notes_snapshot:big}),env,identity,reply);
 const good={notes_version:'notes-v1',content_version:'1.3.2',summary:{comments:['ok']}};
 const r2=await handleNotes(post('/api/notes/session',{...SESSION,session_id:'fake-retry',notes_snapshot:good}),env,identity,reply);
 assert.equal(r2.status,200);assert.equal(r2.data.snapshot,'recorded');
 const g=await handleNotes(post('/api/notes/get',{session_id:'fake-retry'}),env,identity,reply);
 assert.equal(g.data.snapshot.summary.comments[0],'ok');
 // immutability: a DIFFERENT snapshot for the same session is a conflict, never an overwrite
 const r3=await handleNotes(post('/api/notes/session',{...SESSION,session_id:'fake-retry',notes_snapshot:{notes_version:'notes-v1',content_version:'1.3.2',summary:{comments:['CHANGED']}}}),env,identity,reply);
 assert.equal(r3.status,409);assert.equal(r3.data.error,'notes_snapshot_immutable_conflict');
 // and the stored snapshot is untouched
 const g2=await handleNotes(post('/api/notes/get',{session_id:'fake-retry'}),env,identity,reply);
 assert.equal(g2.data.snapshot.summary.comments[0],'ok');
});
test('malformed snapshot (missing fields): also rejected-but-preserved, no silent drop',async()=>{
 const{env,reply,identity}=setup();
 const r=await handleNotes(post('/api/notes/session',{...SESSION,session_id:'fake-mal',notes_snapshot:{notes_version:'notes-v1'}}),env,identity,reply);
 assert.equal(r.status,200);assert.equal(r.data.snapshot_rejected,'invalid_notes_snapshot');
 const g=await handleNotes(post('/api/notes/get',{session_id:'fake-mal'}),env,identity,reply);
 assert.equal(g.data.transcript.length,2);assert.equal(g.data.snapshot,null);
});
