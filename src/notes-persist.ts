// Flag-disabled (VITE_NOTES_PERSIST==='true') private notes persistence client.
// Captures transcript entries with real timestamps at append time; posts one
// idempotent session bundle at session end. Bearer Google identity only.
//
// No silent loss rules:
// - Streaming chunks are merged into the current same-role entry; when an entry
//   reaches the server's 4000-char bound the text spills into a continuation
//   entry (same role) instead of being clipped. Full session text is preserved.
// - Save failures are never dropped: expired token -> one silent refresh +
//   retry; transient failures -> two backoff retries; anything still unsent is
//   queued in localStorage (bounded FIFO) and flushed on the next session
//   finish / page load, and the caller shows a visible notice.
export type TranscriptEntry={role:'clerk'|'learner'|'guide';text:string;ts:string};
export type StoredEvidence={card_id:string;heard_asr_phrases:string|string[];mo_ichido_count:number;completed:number|boolean};
export type NotesSnapshot={notes_version:string;content_version:string;summary:unknown;created_at?:string};
export type SessionBundle={session_id:string;started_at:string;duration_s:number;lesson_id:string;voice_mode:string|null;end_state:string;transcript:TranscriptEntry[];evidence:{card_id:string;heard_asr_phrases:string[];mo_ichido_count:number;completed:boolean}[];notes_version?:string;content_version?:string;notes_snapshot?:NotesSnapshot;review_events?:{event_id:string;card_id:string;kind:string;outcome:string;scheduler_rating:number|null;at:string;counts_for_schedule:boolean}[]};
// Route notes through the same configured owner API as voice/auth. GitHub
// Pages is a static mirror, not an API host. Never derive this from the page
// origin in token-service mode (2026-11-17 owner trial regression).
export function notesApiEndpoint(tokenServiceEnabled:boolean,tokenEndpoint:string|undefined,pageOrigin:string):string{
 if(!tokenServiceEnabled)return pageOrigin;
 if(!tokenEndpoint)throw Error('Owner API endpoint required for notes');
 return new URL(tokenEndpoint).origin;
}
// Explicit owner-triggered retry of retained records, including permanent
// failures caused by the old Pages routing bug. Never auto-retry the dead list.
// Clear only successful records; keep invalid/failed records and oversized notes.
export async function retryRetained(endpoint:string,getToken:()=>string,deps:PersistDeps):Promise<{saved:number;remaining:number}>{
 const {storage,scope}=deps;if(!storage||!scope)return{saved:0,remaining:0};
 const queued=loadQueue(storage,scope),dead=loadDead(storage,scope);
 const all=[...new Map([...queued,...dead].map(b=>[b.session_id,b])).values()];
 let saved=0;const keepQueue:SessionBundle[]=[],keepDead:SessionBundle[]=[];
 const deadIds=new Set(dead.map(b=>b.session_id));
 for(const bundle of all){
  const result=await persistSession(endpoint,getToken,bundle,{...deps,storage:undefined});
  if(result==='ok'){saved++;continue;}
  if(result==='ok_note_kept'){saved++;keepDead.push(bundle);continue;}
  (deadIds.has(bundle.session_id)||result==='rejected'?keepDead:keepQueue).push(bundle);
 }
 // Do not clear first: if a quota error occurs while updating, old copies survive.
 storage.setItem(QUEUE_PREFIX+scope,JSON.stringify(keepQueue));
 storage.setItem(DEAD_PREFIX+scope,JSON.stringify(keepDead));
 return{saved,remaining:keepQueue.length+keepDead.length};
}

export const MAX_ENTRY_CHARS=4000; // must match worker/notes-endpoint.mjs MAX_TEXT
const QUEUE_PREFIX='jp-notes-queue-v1:';
const DEAD_PREFIX='jp-notes-dead-v1:';
// Queues are account-scoped: a different signed-in identity cannot read or
// flush another identity's pending records. There is NO eviction - a full
// device stops recording visibly instead of dropping conversations.
export function createSessionCapture(){
 const transcript:TranscriptEntry[]=[];
 return{
  transcript,
  add(role:string,text:string,append=false){
   const r=role==='user'?'learner':role==='model'?'clerk':role==='guide'?'guide':null;
   if(!r||!text)return;
   let rest=text;
   let merging=append;
   while(rest.length>0){
    const last=transcript[transcript.length-1];
    if(merging&&last&&last.role===r&&last.text.length<MAX_ENTRY_CHARS){
     const room=MAX_ENTRY_CHARS-last.text.length;
     last.text+=rest.slice(0,room);
     rest=rest.slice(room);
    }else{
     transcript.push({role:r,text:rest.slice(0,MAX_ENTRY_CHARS),ts:new Date().toISOString()});
     rest=rest.slice(MAX_ENTRY_CHARS);
    }
    merging=true; // overflow spill is one logical turn continuing
   }
  },
  reset(){transcript.length=0;},
 };
}
// Identity-gated scope: queues are readable/writable ONLY for a server-verified
// owner sub. verified=false (signed out, wrong account, cookie without a
// previously verified sub) yields null - retained data is hidden, not deleted,
// and decode-only JWT subs are never accepted here (the caller passes a sub
// only after the server verified that credential).
export function resolveScope(verified:boolean,verifiedSub:string):string|null{
 return verified&&verifiedSub?verifiedSub:null;
}
export interface QueueStorage{getItem(k:string):string|null;setItem(k:string,v:string):void;removeItem(k:string):void;}
function loadList(storage:QueueStorage,key:string):SessionBundle[]{
 try{const raw=storage.getItem(key);const v=raw?JSON.parse(raw):[];return Array.isArray(v)?v.filter(b=>b&&typeof b.session_id==='string'):[];}catch{return[];}
}
export function loadQueue(storage:QueueStorage,scope:string):SessionBundle[]{return loadList(storage,QUEUE_PREFIX+scope);}
export function loadDead(storage:QueueStorage,scope:string):SessionBundle[]{return loadList(storage,DEAD_PREFIX+scope);}
// 'ok' when retained; 'full' when the device refused the write (quota) and the
// bundle could NOT be retained - caller must surface a recovery/export route.
export function pushQueue(storage:QueueStorage,scope:string,bundle:SessionBundle):'ok'|'full'{
 try{
  const q=loadQueue(storage,scope).filter(b=>b.session_id!==bundle.session_id);
  q.push(bundle);
  storage.setItem(QUEUE_PREFIX+scope,JSON.stringify(q));
  return'ok';
 }catch{return'full';}
}
export function pushDead(storage:QueueStorage,scope:string,bundle:SessionBundle):'ok'|'full'{
 try{
  const d=loadDead(storage,scope).filter(b=>b.session_id!==bundle.session_id);
  d.push(bundle);
  storage.setItem(DEAD_PREFIX+scope,JSON.stringify(d));
  return'ok';
 }catch{return'full';}
}
export function clearQueue(storage:QueueStorage,scope:string){try{storage.removeItem(QUEUE_PREFIX+scope);}catch{}}
export function clearDead(storage:QueueStorage,scope:string){try{storage.removeItem(DEAD_PREFIX+scope);}catch{}}
export interface PersistDeps{
 fetcher?:typeof fetch;
 refresh?:()=>Promise<string|null>; // silent token re-auth; null = unavailable
 sleep?: (ms:number)=>Promise<void>;
 storage?:QueueStorage; // required, with scope, for on-device retention
 scope?:string; // owner account scope for the queue keys
}
// 'ok' stored server-side; 'queued' retained on-device for retry; 'rejected'
// retained on-device in the dead list (permanent server refusal - never
// auto-retried, export route offered); 'failed' retained NOWHERE (device
// storage full or no scope - caller must show the strongest notice).
async function postOnce(fetcher:typeof fetch,endpoint:string,token:string,body:string):Promise<Response|null>{
 try{return await fetcher(new URL('/api/notes/session',endpoint).href,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body});}catch{return null;}
}
// Returns 'ok' when stored, 'queued' when kept on-device for a later retry.
export async function persistSession(endpoint:string,getToken:()=>string,bundle:SessionBundle,deps:PersistDeps={}):Promise<'ok'|'ok_note_kept'|'queued'|'rejected'|'failed'>{
 const fetcher=deps.fetcher||fetch;
 const sleep=deps.sleep||(ms=>new Promise<void>(res=>setTimeout(res,ms)));
 const body=JSON.stringify(bundle);
 let response=await postOnce(fetcher,endpoint,getToken(),body);
 if(response&&response.status===401&&deps.refresh){
  let fresh:string|null=null;
  try{fresh=await deps.refresh();}catch{fresh=null;}
  if(fresh)response=await postOnce(fetcher,endpoint,fresh,body);
 }
 // Transient failures (network null, 429, 5xx) get two backoff retries.
 // 'ok_note_kept': the session+transcript were stored but the end-session note was
 // rejected (e.g. over the 8KB server bound) - visible failure, full note stays on-device.
 const okResult=async(r:Response|null):Promise<'ok'|'ok_note_kept'|null>=>{if(!r||!r.ok)return null;try{const j=await r.clone().json();return j&&j.snapshot_rejected?'ok_note_kept':'ok';}catch{return'ok';}};
 for(const wait of[1000,3000]){
  const early=await okResult(response);if(early)return early;
  if(response&&response.status<500&&response.status!==429)break; // permanent: retrying the same body cannot help
  await sleep(wait);
  response=await postOnce(fetcher,endpoint,getToken(),body);
 }
 const done=await okResult(response);if(done)return done;
 const permanent=!!response&&response.status<500&&response.status!==429&&response.status!==401;
 if(deps.storage&&deps.scope){
  if(permanent)return pushDead(deps.storage,deps.scope,bundle)==='ok'?'rejected':'failed';
  return pushQueue(deps.storage,deps.scope,bundle)==='ok'?'queued':'failed';
 }
 return'failed';
}
// Flush queued bundles oldest-first; stops at the first failure so ordering is kept.
// Flushes the retry queue only; the dead list stays put until the user exports
// or discards it. A bundle that the server permanently rejects during flush is
// moved to the dead list, not retried forever.
export async function flushQueue(endpoint:string,getToken:()=>string,deps:PersistDeps={}):Promise<number>{
 const storage=deps.storage,scope=deps.scope;
 if(!storage||!scope)return 0;
 const pending=loadQueue(storage,scope);
 if(pending.length===0)return 0;
 let flushed=0;
 const stillQueued:SessionBundle[]=[];
 for(const bundle of pending){
  const result=await persistSession(endpoint,getToken,bundle,{...deps,storage:undefined});
  if(result==='ok'){flushed++;continue;}
  if(result==='rejected'){pushDead(storage,scope,bundle);continue;}
  stillQueued.push(bundle,...pending.slice(pending.indexOf(bundle)+1));
  break;
 }
 if(stillQueued.length===0)clearQueue(storage,scope);
 else try{storage.setItem(QUEUE_PREFIX+scope,JSON.stringify(stillQueued));}catch{}
 return flushed;
}

// Owner-only saved-history access (list/get/delete). Same Bearer+single-refresh
// pattern as persistSession; learner data never travels via the session cookie.
export interface SavedSession{session_id:string;started_at:string;duration_s:number;lesson_id:string;end_state:string}
// 'auth' = Google credential expired/rejected even after a refresh attempt (identity
// check may still pass via cookie - notes access needs a fresh Bearer).
// 'network' = request never completed; 'server' = reachable but not ok.
export type NotesFetchStatus='ok'|'auth'|'network'|'server';
async function authedRequest(endpoint:string,getToken:()=>string,path:string,body:unknown,refresh?:()=>Promise<string|null>):Promise<{status:NotesFetchStatus;response:Response|null}>{
 const send=(token:string)=>fetch(new URL(path,endpoint).href,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify(body||{})}).catch(()=>null);
 let response=await send(getToken());
 if(response&&response.status===401&&refresh){
  let fresh:string|null=null;try{fresh=await refresh();}catch{fresh=null;}
  if(fresh)response=await send(fresh);
 }
 if(!response)return{status:'network',response:null};
 if(response.status===401||response.status===403)return{status:'auth',response};
 if(!response.ok)return{status:'server',response};
 return{status:'ok',response};
}
export async function listSessions(endpoint:string,getToken:()=>string,deps:PersistDeps={}):Promise<{status:NotesFetchStatus;sessions:SavedSession[]}>{
 const {status,response}=await authedRequest(endpoint,getToken,'/api/notes/list',{},deps.refresh);
 if(status!=='ok'||!response)return{status:status==='ok'?'server':status,sessions:[]};
 try{const data=await response.json();return{status:'ok',sessions:Array.isArray(data.sessions)?data.sessions:[]};}catch{return{status:'server',sessions:[]};}
}
export async function getSession(endpoint:string,getToken:()=>string,sessionId:string,deps:PersistDeps={}):Promise<{status:NotesFetchStatus;transcript:TranscriptEntry[];evidence:StoredEvidence[];notes_version:string|null;content_version:string|null;snapshot:NotesSnapshot|null;review_events:{event_id:string;card_id:string;kind:string;outcome:string;scheduler_rating:number|null;at:string;counts_for_schedule:boolean|number}[]}>{
 const {status,response}=await authedRequest(endpoint,getToken,'/api/notes/get',{session_id:sessionId},deps.refresh);
 const empty={status:status==='ok'?'server' as NotesFetchStatus:status,transcript:[],evidence:[],notes_version:null,content_version:null,snapshot:null,review_events:[]};
 if(status!=='ok'||!response)return empty;
 try{const data=await response.json();return{status:'ok',transcript:Array.isArray(data.transcript)?data.transcript:[],evidence:Array.isArray(data.evidence)?data.evidence:[],notes_version:typeof data.notes_version==='string'?data.notes_version:null,content_version:typeof data.content_version==='string'?data.content_version:null,snapshot:data.snapshot&&typeof data.snapshot==='object'?data.snapshot:null,review_events:Array.isArray(data.review_events)?data.review_events:[]};}catch{return{...empty,status:'server'};}
}
export async function deleteSession(endpoint:string,getToken:()=>string,sessionId:string,deps:PersistDeps={}):Promise<NotesFetchStatus>{
 const {status}=await authedRequest(endpoint,getToken,'/api/notes/delete',{session_id:sessionId},deps.refresh);
 return status;
}
