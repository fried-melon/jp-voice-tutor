// The /api/notes/admin surface was removed 2026-11-03 (reviewed corrective deploy).
// This test LOCKS the removal: unknown /api/notes/* paths must 404, and the worker
// must carry no admin DDL/export surface. Migration rehearsal continues here using
// the migration FILE directly (no production route). FAKE data only.
import {test}from'node:test';import assert from'node:assert/strict';import{DatabaseSync}from'node:sqlite';import{readFileSync}from'node:fs';import{handleNotes}from'../worker/notes-endpoint.mjs';
function d1Shim(db){function prepare(sql){function bind(...args){const stmt=db.prepare(sql);return{run:async()=>{const r=stmt.run(...args);return{success:true,meta:{changes:r.changes}};},all:async()=>({results:stmt.all(...args)}),first:async()=>stmt.get(...args)};}return{bind};}return{prepare};}
function setup(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(readFileSync('worker/notes-schema.sql','utf8'));const env={NOTES_DB:d1Shim(db)};const reply=(status,data)=>({status,data});return{env,reply,db};}
const post=(path,body)=>new Request('https://fake.local'+path,{method:'POST',body:JSON.stringify(body||{})});

test('admin route is gone: /api/notes/admin -> 404 even with a valid owner identity',async()=>{
 const{env,reply}=setup();
 for(const action of[undefined,'export','migrate_002']){
  const r=await handleNotes(post('/api/notes/admin',action?{action}:undefined),env,{sub:'fake-owner-sub'},reply);
  assert.equal(r.status,404,'action '+action+' must 404');
 }
});
test('worker endpoint carries no admin DDL surface',()=>{
 const ep=readFileSync('worker/notes-endpoint.mjs','utf8');
 assert.ok(!ep.includes("'/api/notes/admin'"),'admin route literal must be absent');
 assert.ok(!ep.includes('migrate_002'),'migrate action literal must be absent');
 assert.ok(!/ALTER TABLE/.test(ep),'no DDL in the request path');
});
test('migration rehearsal (no production route): v1 DB + migration file applied via pragma-conditional steps, old rows intact, idempotent',async()=>{
 const{db}=setup();
 db.prepare("INSERT INTO sessions(session_id,started_at,duration_s,lesson_id,end_state) VALUES('old1','2026-01-01T00:00:00Z',60,'M1-S1','duration_complete')").run();
 const file=readFileSync('worker/notes-migration-002.sql','utf8');
 const apply=()=>{ // mirrors the retired admin route's pragma-conditional logic
  const cols=db.prepare('PRAGMA table_info(sessions)').all().map(c=>c.name);
  if(!cols.includes('notes_version'))db.exec('ALTER TABLE sessions ADD COLUMN notes_version TEXT');
  if(!cols.includes('content_version'))db.exec('ALTER TABLE sessions ADD COLUMN content_version TEXT');
  const stripped=file.split('\n').map(l=>l.replace(/--.*$/,'')).join('\n'); // -- comments can contain ';'
  for(const stmt of stripped.split(';').map(x=>x.trim()).filter(x=>x.startsWith('CREATE TABLE')))db.exec(stmt);
 };
 apply();apply(); // idempotent re-run must not throw or duplicate
 const old=db.prepare('SELECT notes_version,content_version FROM sessions WHERE session_id=?').get('old1');
 assert.equal(old.notes_version,null);assert.equal(old.content_version,null); // honest NULL, never back-filled
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t=>t.name);
 assert.ok(tables.includes('session_notes_snapshot'));assert.ok(tables.includes('review_events'));
});
