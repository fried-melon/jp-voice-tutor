// Isolated notes/progress store over a D1-compatible binding (prepare/bind/run/all).
// No live writes yet: wired behind a disabled flag; tested against node:sqlite shim.
export function createNotesStore(db){
 const run=(sql,...args)=>db.prepare(sql).bind(...args).run();
 const all=(sql,...args)=>db.prepare(sql).bind(...args).all().then(r=>r.results);
 return{
  async recordSession(s,transcriptCount=0,versions=null){
   // Notes-UI boundary: sub-1s sessions produce no notes - but only when they are empty
   // (accidental start/stop). A real user's transcript is never silently discarded.
   if(!(s.duration_s>=1)&&transcriptCount===0)return{recorded:false,reason:'under_1s_empty_no_notes'};
   // UPSERT, never REPLACE: REPLACE deletes the row first and ON DELETE CASCADE would silently
   // wipe transcript/evidence/snapshot/review_events on a finish retry (found on production 05:32).
   await run('INSERT INTO sessions(session_id,started_at,duration_s,lesson_id,voice_mode,end_state,notes_version,content_version) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET started_at=excluded.started_at,duration_s=excluded.duration_s,lesson_id=excluded.lesson_id,voice_mode=excluded.voice_mode,end_state=excluded.end_state,notes_version=excluded.notes_version,content_version=excluded.content_version',s.session_id,s.started_at,s.duration_s,s.lesson_id,s.voice_mode||null,s.end_state,versions&&versions.notes_version||null,versions&&versions.content_version||null);
   return{recorded:true};
  },
  // Immutable end-session notes snapshot: insert once; a conflicting second write is rejected,
  // an identical retry is a no-op (idempotent finish retry).
  async saveNotesSnapshot(session_id,snap){
   const existing=await db.prepare('SELECT summary_json,notes_version,content_version FROM session_notes_snapshot WHERE session_id=?').bind(session_id).first();
   const body=JSON.stringify(snap.summary);
   if(existing)return (existing.summary_json===body&&existing.notes_version===snap.notes_version&&existing.content_version===snap.content_version)?{saved:true,dedup:true}:{saved:false,reason:'immutable_conflict'};
   await run('INSERT INTO session_notes_snapshot(session_id,notes_version,content_version,summary_json,created_at) VALUES(?,?,?,?,?)',session_id,snap.notes_version,snap.content_version,body,snap.created_at);
   return{saved:true};
  },
  sessionSnapshot:session_id=>all('SELECT notes_version,content_version,summary_json,created_at FROM session_notes_snapshot WHERE session_id=?',session_id),
  sessionMeta:async session_id=>(await db.prepare('SELECT notes_version,content_version FROM sessions WHERE session_id=?').bind(session_id).first())||null,
  // Review events per cycle1-fsrs6-evidence-v1: append-only, UUID dedup, strict monotonic per card,
  // <=1 schedule-counting event per card per Asia-Seoul day (later same-day events are practice, rating NULL).
  async addReviewEvent(ev){
   const seoulDay=new Date(new Date(ev.at).getTime()+9*3600e3).toISOString().slice(0,10);
   const dup=await db.prepare('SELECT event_id FROM review_events WHERE event_id=?').bind(ev.event_id).first();
   if(dup)return{recorded:true,dedup:true}; // UUID dedup before monotonic: a retry carries the same instant
   const last=await db.prepare('SELECT MAX(at) AS m FROM review_events WHERE card_id=?').bind(ev.card_id).first();
   if(last&&last.m&&!(ev.at>last.m))return{recorded:false,reason:'non_monotonic'};
   if(ev.counts_for_schedule){
    const rows=await all("SELECT at FROM review_events WHERE card_id=? AND counts_for_schedule=1",ev.card_id);
    if(rows.some(r=>new Date(new Date(r.at).getTime()+9*3600e3).toISOString().slice(0,10)===seoulDay))return{recorded:false,reason:'day_cap'};
   }
   await run('INSERT OR IGNORE INTO review_events(event_id,session_id,card_id,kind,outcome,scheduler_rating,at,counts_for_schedule) VALUES(?,?,?,?,?,?,?,?)',ev.event_id,ev.session_id,ev.card_id,ev.kind,ev.outcome,ev.scheduler_rating??null,ev.at,ev.counts_for_schedule?1:0);
   return{recorded:true};
  },
  sessionReviewEvents:session_id=>all('SELECT event_id,card_id,kind,outcome,scheduler_rating,at,counts_for_schedule FROM review_events WHERE session_id=? ORDER BY at',session_id),
  cardReviewEvents:card_id=>all('SELECT event_id,session_id,card_id,kind,outcome,scheduler_rating,at,counts_for_schedule FROM review_events WHERE card_id=? ORDER BY at',card_id),
  addTranscript:(session_id,seq,role,text,ts)=>run('INSERT OR REPLACE INTO transcript_entries(session_id,seq,role,text,ts) VALUES(?,?,?,?,?)',session_id,seq,role,text,ts),
  recordCardEvidence:(session_id,card_id,ev)=>run('INSERT OR REPLACE INTO card_evidence(session_id,card_id,heard_asr_phrases,mo_ichido_count,completed) VALUES(?,?,?,?,?)',session_id,card_id,JSON.stringify(ev.heard_asr_phrases||[]),ev.mo_ichido_count||0,ev.completed?1:0),
  // Mastery = independent recall in a LATER session, recorded explicitly - never derived from completion.
  markMastery:(card_id,recall_session_id,confirmed_at)=>run('INSERT OR IGNORE INTO mastery(card_id,first_independent_recall_session_id,confirmed_at) VALUES(?,?,?)',card_id,recall_session_id,confirmed_at),
  sessionTranscript:session_id=>all('SELECT seq,role,text,ts FROM transcript_entries WHERE session_id=? ORDER BY seq',session_id),
  sessionEvidence:session_id=>all('SELECT card_id,heard_asr_phrases,mo_ichido_count,completed FROM card_evidence WHERE session_id=?',session_id),
  masteryFor:card_id=>all('SELECT * FROM mastery WHERE card_id=?',card_id),
  listSessions:()=>all('SELECT session_id,started_at,duration_s,lesson_id,end_state FROM sessions ORDER BY started_at DESC'),
  // Cascades transcript/evidence/snapshot/review_events. mastery anchored to this session is
  // explicitly invalidated first (anchor gone -> recall proof gone); the count is returned, not silent.
  deleteSession:async session_id=>{
   const inv=await run('DELETE FROM mastery WHERE first_independent_recall_session_id=?',session_id);
   await run('DELETE FROM sessions WHERE session_id=?',session_id);
   return{mastery_invalidated:inv.meta&&typeof inv.meta.changes==='number'?inv.meta.changes:0};
  },
  pragmaTableInfo:async t=>(await all('PRAGMA table_info('+t+')')).map(r=>r.name),
  listTables:async()=>(await all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).map(r=>r.name),
  rawDdl:sql=>run(sql),
  // Table-aware: works pre- and post-migration (absent tables export as null, never throw).
  exportAll:async()=>{
   const have=new Set((await all("SELECT name FROM sqlite_master WHERE type='table'")).map(r=>r.name));
   const grab=t=>have.has(t)?all('SELECT * FROM '+t):Promise.resolve(null);
   return{sessions:await grab('sessions'),transcript_entries:await grab('transcript_entries'),card_evidence:await grab('card_evidence'),mastery:await grab('mastery'),session_notes_snapshot:await grab('session_notes_snapshot'),review_events:await grab('review_events')};
  },
 };
}
