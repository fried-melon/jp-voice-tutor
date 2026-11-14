// Synthetic notes-store tests: node:sqlite in-memory behind a D1-API shim. FAKE data only - no real learner records.
import {test}from'node:test';import assert from'node:assert/strict';import{DatabaseSync}from'node:sqlite';import{readFileSync}from'node:fs';import{createNotesStore}from'../shared/notes-store.mjs';
function d1Shim(db){
 function prepare(sql){
  function bind(...args){
   const stmt=db.prepare(sql);
   return{
    run:async()=>{const r=stmt.run(...args);return{success:true,meta:{changes:r.changes}};},
    all:async()=>({results:stmt.all(...args)}),
    first:async()=>stmt.get(...args),
   };
  }
  return{bind};
 }
 return{prepare};
}
function store(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(readFileSync('worker/notes-schema.sql','utf8'));db.exec(readFileSync('worker/notes-migration-002.sql','utf8'));return createNotesStore(d1Shim(db));}
test('under-1s session produces no notes',async()=>{const s=store();const r=await s.recordSession({session_id:'fake0',started_at:'2026-01-01T00:00:00Z',duration_s:0,lesson_id:'M1-S1',end_state:'stop'});assert.equal(r.recorded,false);assert.equal((await s.listSessions()).length,0);});
test('session + full transcript + card evidence round-trip; completion is not mastery',async()=>{
 const s=store();await s.recordSession({session_id:'fake1',started_at:'2026-01-01T00:00:00Z',duration_s:240,lesson_id:'M1-S1',voice_mode:'natural',end_state:'completed'});
 await s.addTranscript('fake1',0,'clerk','いらっしゃいませ','2026-01-01T00:00:01Z');
 await s.addTranscript('fake1',1,'learner','テスト発話','2026-01-01T00:00:05Z');
 await s.recordCardEvidence('fake1','CARD-TEST-1',{heard_asr_phrases:['ポイントカード'],mo_ichido_count:1,completed:true});
 const t=await s.sessionTranscript('fake1');assert.equal(t.length,2);assert.equal(t[1].role,'learner');
 const ev=await s.sessionEvidence('fake1');assert.equal(ev[0].completed,1);assert.deepEqual(JSON.parse(ev[0].heard_asr_phrases),['ポイントカード']);
 assert.equal((await s.masteryFor('CARD-TEST-1')).length,0); // completion did not create mastery
});
test('mastery only via explicit later independent recall',async()=>{
 const s=store();await s.recordSession({session_id:'fake2',started_at:'2026-01-02T00:00:00Z',duration_s:240,lesson_id:'M1-S2',end_state:'completed'});
 await s.markMastery('CARD-TEST-1','fake2','2026-01-02T00:01:00Z');
 assert.equal((await s.masteryFor('CARD-TEST-1')).length,1);
});
test('delete cascades; export contains everything; wipe leaves nothing',async()=>{
 const s=store();await s.recordSession({session_id:'fake3',started_at:'2026-01-03T00:00:00Z',duration_s:120,lesson_id:'M1-S1',end_state:'stop'});
 await s.addTranscript('fake3',0,'clerk','テスト','2026-01-03T00:00:01Z');
 const exp=await s.exportAll();assert.equal(exp.sessions.length,1);assert.equal(exp.transcript_entries.length,1);
 await s.deleteSession('fake3');
 const exp2=await s.exportAll();assert.equal(exp2.sessions.length,0);assert.equal(exp2.transcript_entries.length,0);
});
test('sub-1s session WITH a real transcript is retained (never silently discarded)',async()=>{
 const s=store();const r=await s.recordSession({session_id:'fake4',started_at:'2026-01-04T00:00:00Z',duration_s:0,lesson_id:'M1-S1',end_state:'stop'},1);
 assert.equal(r.recorded,true);
});
test('transcript ordering stable across export; idempotent retry of evidence/mastery',async()=>{
 const s=store();await s.recordSession({session_id:'fake5',started_at:'2026-01-05T00:00:00Z',duration_s:240,lesson_id:'M1-S1',end_state:'completed'});
 for(let i=0;i<5;i++)await s.addTranscript('fake5',i,i%2?'learner':'clerk','行'+i,'2026-01-05T00:00:0'+i+'Z');
 await s.recordCardEvidence('fake5','CARD-R',{heard_asr_phrases:['a'],mo_ichido_count:0,completed:true});
 await s.recordCardEvidence('fake5','CARD-R',{heard_asr_phrases:['a'],mo_ichido_count:0,completed:true}); // retry same write
 await s.markMastery('CARD-R','fake5','2026-01-05T00:02:00Z');await s.markMastery('CARD-R','fake5','2026-01-05T00:02:00Z'); // retry
 const t=await s.sessionTranscript('fake5');assert.deepEqual(t.map(x=>x.seq),[0,1,2,3,4]);
 assert.equal((await s.sessionEvidence('fake5')).length,1);assert.equal((await s.masteryFor('CARD-R')).length,1);
});
test('LOCAL rehearsal: export -> wipe -> restore preserves content (local sqlite compatibility, NOT hosted D1 verification)',async()=>{
 const s=store();await s.recordSession({session_id:'fake6',started_at:'2026-01-06T00:00:00Z',duration_s:180,lesson_id:'M1-S2',end_state:'completed'});
 await s.addTranscript('fake6',0,'clerk','テスト','2026-01-06T00:00:01Z');
 await s.recordCardEvidence('fake6','CARD-B',{heard_asr_phrases:[],mo_ichido_count:2,completed:true});
 const before=await s.exportAll();
 // wipe
 await s.deleteSession('fake6');assert.equal((await s.exportAll()).sessions.length,0);
 // restore from export (idempotent path)
 for(const x of before.sessions)await s.recordSession({session_id:x.session_id,started_at:x.started_at,duration_s:x.duration_s,lesson_id:x.lesson_id,voice_mode:x.voice_mode,end_state:x.end_state},1);
 for(const x of before.transcript_entries)await s.addTranscript(x.session_id,x.seq,x.role,x.text,x.ts);
 for(const x of before.card_evidence)await s.recordCardEvidence(x.session_id,x.card_id,{heard_asr_phrases:JSON.parse(x.heard_asr_phrases),mo_ichido_count:x.mo_ichido_count,completed:!!x.completed});
 const after=await s.exportAll();
 assert.deepEqual(after,before);
});
