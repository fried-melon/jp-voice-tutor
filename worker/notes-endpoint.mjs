// Flag-disabled private notes/progress endpoints. Bearer Google identity only
// (session cookie NEVER covers learner data - docs/SESSION-COOKIE.md).
// Owner isolation: identity.sub is already verified === OWNER_GOOGLE_SUB upstream.
import{createNotesStore}from'../shared/notes-store.mjs';
const MAX_BODY=256*1024,MAX_ENTRIES=500,MAX_TEXT=4000,MAX_CARDS=200;
const okId=s=>typeof s==='string'&&s.length>=1&&s.length<=100;
function bad(reply,status,error){return reply(status,{error});}
async function readJson(request,reply){
 try{
  let size=0;const chunks=[];const reader=request.body?.getReader();if(!reader)return null;
  while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();return{error:'too_large'};}chunks.push(value);}
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
  return{body:JSON.parse(new TextDecoder().decode(bytes))};
 }catch{return{error:'invalid_json'};}
}
export async function handleNotes(request,env,identity,reply){
 const path=new URL(request.url).pathname;
 const store=createNotesStore(env.NOTES_DB);
 if(request.method!=='POST')return bad(reply,405,'method_not_allowed');
 const parsed=await readJson(request,reply);
 if(!parsed)return bad(reply,400,'invalid_json');
 if(parsed.error)return bad(reply,parsed.error==='too_large'?413:400,parsed.error);
 const body=parsed.body;
 // The /api/notes/admin surface was removed 2026-11-03 (reviewed corrective deploy):
 // migration 002 is already applied and export is superseded by the proven
 // Cloudflare dashboard-session D1 route. Unknown paths fall through to 404.
 if(path==='/api/notes/session'){
  if(!body||!okId(body.session_id)||typeof body.started_at!=='string'||!(Number.isInteger(body.duration_s)&&body.duration_s>=0)||!okId(body.lesson_id)||typeof body.end_state!=='string')return bad(reply,400,'invalid_session');
  const transcript=Array.isArray(body.transcript)?body.transcript:[];
  const evidence=Array.isArray(body.evidence)?body.evidence:[];
  if(transcript.length>MAX_ENTRIES||evidence.length>MAX_CARDS)return bad(reply,413,'too_large');
  for(const[seq,e]of transcript.entries()){
   if(!e||!['clerk','learner','guide'].includes(e.role)||typeof e.text!=='string'||e.text.length>MAX_TEXT||typeof e.ts!=='string')return bad(reply,400,'invalid_transcript_entry');
   e.seq=seq; // server assigns order by array position; client-supplied seq ignored
  }
  for(const c of evidence){
   if(!c||!okId(c.card_id)||!Array.isArray(c.heard_asr_phrases)||c.heard_asr_phrases.length>50||c.heard_asr_phrases.some(p=>typeof p!=='string'||p.length>200)||!(Number.isInteger(c.mo_ichido_count)&&c.mo_ichido_count>=0&&c.mo_ichido_count<=1000))return bad(reply,400,'invalid_card_evidence');
  }
  const okVer=v=>v==null||(typeof v==='string'&&v.length<=40);
  if(!okVer(body.notes_version)||!okVer(body.content_version))return bad(reply,400,'invalid_version');
  const snap=body.notes_snapshot;
  // An invalid/oversize snapshot must NOT drop the whole record (2026-11-03): the
  // conversation transcript + evidence are preserved, the rejection is flagged in the
  // response, and a later retry can still attach a valid snapshot (immutability and
  // conflict rules below are unchanged).
  const snapshotRejected=snap!=null&&(!snap||typeof snap.notes_version!=='string'||typeof snap.content_version!=='string'||snap.notes_version.length>40||snap.content_version.length>40||snap.summary==null||JSON.stringify(snap.summary).length>8000);
  const reviewEvents=Array.isArray(body.review_events)?body.review_events:[];
  if(reviewEvents.length>MAX_CARDS)return bad(reply,413,'too_large');
  for(const ev of reviewEvents){
   if(!ev||!okId(ev.event_id)||!okId(ev.card_id)||!['word','sentence','reading'].includes(ev.kind)||!['pending','modeled','independent','hinted','explicit-easy'].includes(ev.outcome)||typeof ev.at!=='string'||!Number.isFinite(new Date(ev.at).getTime()))return bad(reply,400,'invalid_review_event');
   if(ev.scheduler_rating!=null&&!(Number.isInteger(ev.scheduler_rating)&&ev.scheduler_rating>=1&&ev.scheduler_rating<=4))return bad(reply,400,'invalid_review_event');
  }
  // Idempotent: session upsert + (session_id,seq)/(session_id,card_id) primary keys make safe retries.
  await store.recordSession({session_id:body.session_id,started_at:body.started_at,duration_s:body.duration_s,lesson_id:body.lesson_id,voice_mode:typeof body.voice_mode==='string'?body.voice_mode:null,end_state:body.end_state},transcript.length,{notes_version:body.notes_version||null,content_version:body.content_version||null});
  if(snap&&!snapshotRejected){const sr=await store.saveNotesSnapshot(body.session_id,{notes_version:snap.notes_version,content_version:snap.content_version,summary:snap.summary,created_at:body.started_at});if(!sr.saved)return bad(reply,409,'notes_snapshot_immutable_conflict');}
  for(const ev of reviewEvents){
   // Client-minted recall events are practice-only evidence: the server never honors
   // client promotion fields. scheduler_rating and counts_for_schedule are forced
   // null/false so a forged payload cannot become schedule-counting independent
   // evidence; only the accepted review flow (review-record-builder) assigns grades.
   const rr=await store.addReviewEvent({event_id:ev.event_id,session_id:body.session_id,card_id:ev.card_id,kind:ev.kind,outcome:ev.outcome,scheduler_rating:null,at:ev.at,counts_for_schedule:false});
   if(!rr.recorded)return bad(reply,409,rr.reason);
  }
  for(const e of transcript)await store.addTranscript(body.session_id,e.seq,e.role,e.text,e.ts);
  for(const c of evidence)await store.recordCardEvidence(body.session_id,c.card_id,{heard_asr_phrases:c.heard_asr_phrases,mo_ichido_count:c.mo_ichido_count,completed:!!c.completed});
  if(Array.isArray(body.mastery))for(const m of body.mastery.slice(0,MAX_CARDS)){if(m&&okId(m.card_id)&&okId(m.recall_session_id)&&typeof m.confirmed_at==='string')await store.markMastery(m.card_id,m.recall_session_id,m.confirmed_at);}
  const result={recorded:true,transcript_entries:transcript.length,evidence_cards:evidence.length,snapshot:snap?(snapshotRejected?'rejected_invalid':'recorded'):'none'};
  if(snapshotRejected)result.snapshot_rejected='invalid_notes_snapshot';
  return reply(200,result);
 }
 if(path==='/api/notes/list'){
  const sessions=await store.listSessions();
  return reply(200,{sessions});
 }
 if(path==='/api/notes/get'){
  if(!body||!okId(body.session_id))return bad(reply,400,'invalid_session');
  const[transcript,evidence,meta,snapshotRows,reviewEvents]=[await store.sessionTranscript(body.session_id),await store.sessionEvidence(body.session_id),await store.sessionMeta(body.session_id),await store.sessionSnapshot(body.session_id),await store.sessionReviewEvents(body.session_id)];
  const snapshot=snapshotRows[0]?{notes_version:snapshotRows[0].notes_version,content_version:snapshotRows[0].content_version,summary:JSON.parse(snapshotRows[0].summary_json),created_at:snapshotRows[0].created_at}:null;
  return reply(200,{transcript,evidence,notes_version:meta?meta.notes_version:null,content_version:meta?meta.content_version:null,snapshot,review_events:reviewEvents});
 }
 if(path==='/api/notes/delete'){
  if(!body||!okId(body.session_id))return bad(reply,400,'invalid_session');
  const dr=await store.deleteSession(body.session_id); // cascade: transcript/evidence/snapshot/review_events; mastery anchored here explicitly invalidated
  return reply(200,{deleted:true,mastery_invalidated:dr.mastery_invalidated||0});
 }
 return bad(reply,404,'not_found');
}
