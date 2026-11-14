// Migration 002 rehearsal + contract tests: additive ALTER/CREATE on a v1-shaped DB,
// old rows readable with NULL versions (unverifiable, never back-filled), snapshot
// immutability, review-event dedup/monotonic/day-cap, cascade + mastery invalidation,
// replay determinism after event deletion. FAKE data only.
import {test}from'node:test';import assert from'node:assert/strict';import{DatabaseSync}from'node:sqlite';import{readFileSync}from'node:fs';import{createNotesStore}from'../shared/notes-store.mjs';
function d1Shim(db){function prepare(sql){function bind(...args){const stmt=db.prepare(sql);return{run:async()=>{const r=stmt.run(...args);return{success:true,meta:{changes:r.changes}};},all:async()=>({results:stmt.all(...args)}),first:async()=>stmt.get(...args)};}return{bind};}return{prepare};}
function v1Db(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(readFileSync('worker/notes-schema.sql','utf8'));return db;}
function migrated(db){db.exec(readFileSync('worker/notes-migration-002.sql','utf8'));return db;}

test('rehearsal: old v1 rows survive migration, NULL versions stay honest',async()=>{
 const db=v1Db();
 // pre-migration row written through the v1 column set
 db.prepare("INSERT INTO sessions(session_id,started_at,duration_s,lesson_id,end_state) VALUES('old1','2026-01-01T00:00:00Z',60,'M1-S1','duration_complete')").run();
 migrated(db);
 const s=createNotesStore(d1Shim(db));
 const meta=await s.sessionMeta('old1');
 assert.equal(meta.notes_version,null);assert.equal(meta.content_version,null); // unverifiable, not inferred
 const list=await s.listSessions();assert.equal(list.length,1);
 // restore drill: export old+new tables, wipe, re-create from export
 const dump=await s.exportAll();
 const db2=migrated(v1Db());const s2=createNotesStore(d1Shim(db2));
 for(const r of dump.sessions)await s2.recordSession(r,1,{notes_version:r.notes_version,content_version:r.content_version});
 const m2=await s2.sessionMeta('old1');assert.equal(m2.notes_version,null);assert.equal(m2.content_version,null);
});

test('snapshot: stored once, identical retry dedups, conflict rejected, readable back',async()=>{
 const s=createNotesStore(d1Shim(migrated(v1Db())));
 await s.recordSession({session_id:'s1',started_at:'2026-01-01T00:00:00Z',duration_s:60,lesson_id:'M1-S1',end_state:'duration_complete'},1,{notes_version:'notes-v1',content_version:'1.3.2'});
 const snap={notes_version:'notes-v1',content_version:'1.3.2',summary:{title:'t',comments:['c']},created_at:'2026-01-01T00:01:00Z'};
 assert.deepEqual(await s.saveNotesSnapshot('s1',snap),{saved:true});
 assert.deepEqual(await s.saveNotesSnapshot('s1',snap),{saved:true,dedup:true});
 const c=await s.saveNotesSnapshot('s1',{...snap,summary:{title:'CHANGED'}});
 assert.equal(c.saved,false);assert.equal(c.reason,'immutable_conflict');
 const back=await s.sessionSnapshot('s1');assert.equal(JSON.parse(back[0].summary_json).title,'t');
 const m3=await s.sessionMeta('s1');assert.equal(m3.notes_version,'notes-v1');assert.equal(m3.content_version,'1.3.2');
});

test('review events: UUID dedup, strict monotonic, Asia-Seoul day cap',async()=>{
 const s=createNotesStore(d1Shim(migrated(v1Db())));
 await s.recordSession({session_id:'s1',started_at:'2026-01-01T00:00:00Z',duration_s:60,lesson_id:'M1-S1',end_state:'duration_complete'},1);
 const e1={event_id:'ev-1',session_id:'s1',card_id:'M1-S1:sentence',kind:'sentence',outcome:'independent',scheduler_rating:3,at:'2026-01-01T01:00:00Z',counts_for_schedule:true};
 assert.deepEqual(await s.addReviewEvent(e1),{recorded:true});
 assert.deepEqual(await s.addReviewEvent(e1),{recorded:true,dedup:true});
 // same Seoul day second counting event -> day_cap (01:00Z and 08:00Z are both 2026-01-01 in +9)
 const e2={...e1,event_id:'ev-2',at:'2026-01-01T08:00:00Z'};
 assert.equal((await s.addReviewEvent(e2)).reason,'day_cap');
 // same-day as PRACTICE (rating null, not counting) is allowed by the contract
 assert.deepEqual(await s.addReviewEvent({...e2,scheduler_rating:null,counts_for_schedule:false}),{recorded:true});
 // time travel rejected
 assert.equal((await s.addReviewEvent({event_id:'ev-3',session_id:'s1',card_id:'M1-S1:sentence',kind:'sentence',outcome:'independent',scheduler_rating:3,at:'2026-01-01T00:30:00Z',counts_for_schedule:false})).reason,'non_monotonic');
 // next Seoul day counting event accepted (16:00Z = 2026-01-02 01:00 +9)
 assert.deepEqual(await s.addReviewEvent({event_id:'ev-4',session_id:'s1',card_id:'M1-S1:sentence',kind:'sentence',outcome:'independent',scheduler_rating:3,at:'2026-01-01T16:00:00Z',counts_for_schedule:true}),{recorded:true});
});

test('deletion: cascade removes events; mastery anchored to session explicitly invalidated; replay recomputes from remaining',async()=>{
 const s=createNotesStore(d1Shim(migrated(v1Db())));
 await s.recordSession({session_id:'s1',started_at:'2026-01-01T00:00:00Z',duration_s:60,lesson_id:'M1-S1',end_state:'duration_complete'},1);
 await s.recordSession({session_id:'s2',started_at:'2026-01-02T00:00:00Z',duration_s:60,lesson_id:'M1-S1',end_state:'duration_complete'},1);
 await s.addReviewEvent({event_id:'ev-1',session_id:'s1',card_id:'C1',kind:'sentence',outcome:'independent',scheduler_rating:3,at:'2026-01-01T01:00:00Z',counts_for_schedule:true});
 await s.addReviewEvent({event_id:'ev-2',session_id:'s2',card_id:'C1',kind:'sentence',outcome:'independent',scheduler_rating:3,at:'2026-01-02T01:00:00Z',counts_for_schedule:true});
 await s.markMastery('C1','s2','2026-01-02T02:00:00Z');
 const d=await s.deleteSession('s2');
 assert.equal(d.mastery_invalidated,1); // explicit, not silent
 assert.deepEqual(await s.masteryFor('C1'),[]); // no stale mastery after anchor deletion
 const remaining=await s.cardReviewEvents('C1');
 assert.deepEqual(remaining.map(e=>e.event_id),['ev-1']); // replay input = remaining events only -> recomputed state, never stale
});

test('session re-save (finish retry) never cascades away review events or snapshot',async()=>{
 const s=createNotesStore(d1Shim(migrated(v1Db())));
 await s.recordSession({session_id:'s1',started_at:'2026-01-01T00:00:00Z',duration_s:60,lesson_id:'M1-S1',end_state:'manual_stop'},1);
 await s.addReviewEvent({event_id:'ev-1',session_id:'s1',card_id:'C1',kind:'sentence',outcome:'independent',scheduler_rating:3,at:'2026-01-01T01:00:00Z',counts_for_schedule:true});
 await s.saveNotesSnapshot('s1',{notes_version:'notes-v1',content_version:'1.3.2',summary:{a:1},created_at:'2026-01-01T00:01:00Z'});
 await s.recordSession({session_id:'s1',started_at:'2026-01-01T00:00:00Z',duration_s:61,lesson_id:'M1-S1',end_state:'duration_complete'},1); // retry/upsert
 assert.equal((await s.cardReviewEvents('C1')).length,1); // review event survived
 assert.equal((await s.sessionSnapshot('s1')).length,1); // snapshot survived
 const m=await s.sessionMeta('s1');assert.equal(m.notes_version,null); // upsert wrote nulls honestly
});
