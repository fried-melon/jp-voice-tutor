import {identityFailure} from '../shared/identity-failure.mjs';
import {validateVoiceMode} from '../shared/voice-mode.mjs';
import {validateNickname} from '../shared/nickname.mjs';
// Owner-only token API. Public assets contain no private configuration or data.
import{createRemoteJWKSet,jwtVerify}from'jose';
import{lessonPrompt,tokenSetup}from'../shared/live-contract.mjs';
import{acceptReviewRequest}from'../shared/review-endpoint-contract.mjs';
import{evaluateGate}from'../shared/gate-window.mjs';
import{handleNotes}from'./notes-endpoint.mjs';
import{mintSession,verifySession,renewSession,parseSessionKey,sessionCookieHeader,clearSessionCookieHeader,SESSION_DEFAULTS}from'../shared/session-cookie.mjs';
// Disabled by default: no route is reachable unless REVIEW_WRITES_ENABLED==='yes'.
export{ReviewProjectionDO}from'./review-projection-do.mjs';
export{GrantDO}from'./grant-do.mjs';
import lessons from'../content/lessons.v1.json';
import prompt from'../prompts/tutor-ja.md';
const JWKS=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'),{timeoutDuration:5000,cooldownDuration:30000,cacheMaxAge:3600000});
export async function verifyOwner(token,env,keys=JWKS){const{payload}=await jwtVerify(token,keys,{algorithms:['RS256'],audience:env.GOOGLE_CLIENT_ID,issuer:['https://accounts.google.com','accounts.google.com'],requiredClaims:['sub','aud','iss','exp','iat']});if(payload.sub!==env.OWNER_GOOGLE_SUB)throw Error('owner_only');return payload;}
export class IssuanceLimit {
 constructor(ctx){this.ctx=ctx;}
 async fetch(request){
  if(request.method!=='POST')return new Response(null,{status:405});const now=Date.now();const day=new Date(now).toISOString().slice(0,10);
  const doPath=new URL(request.url).pathname;
  // Global session revocation floor, stored in this EXISTING object (no new store).
  // Lives in session_meta, a table the /reserve rate-counter path never touches:
  // daily rollover (limit_state day change) cannot reset it. Semantics: cookies
  // with iat <= nbf are invalid (a same-millisecond mint before revoke must not survive).
  if(doPath==='/session-nbf'){const sql=this.ctx.storage.sql;sql.exec('CREATE TABLE IF NOT EXISTS session_meta (id INTEGER PRIMARY KEY, nbf INTEGER NOT NULL)');const row=sql.exec('SELECT nbf FROM session_meta WHERE id=1').toArray()[0];return Response.json({nbf:row?.nbf||0});}
  if(doPath==='/revoke-all'){const sql=this.ctx.storage.sql;sql.exec('CREATE TABLE IF NOT EXISTS session_meta (id INTEGER PRIMARY KEY, nbf INTEGER NOT NULL)');sql.exec('INSERT OR REPLACE INTO session_meta (id,nbf) VALUES (1,?)',now);return Response.json({nbf:now});}
  // Synchronous SQLite transaction commits before provider mint; no await gap.
  const accepted=this.ctx.storage.transactionSync(()=>{
   const sql=this.ctx.storage.sql;sql.exec('CREATE TABLE IF NOT EXISTS limit_state (id INTEGER PRIMARY KEY, day TEXT NOT NULL, count INTEGER NOT NULL, last INTEGER NOT NULL)');
   const previous=sql.exec('SELECT day,count,last FROM limit_state WHERE id=1').toArray()[0];const count=previous?.day===day?previous.count:0;
   if(count>=5||(previous&&now-previous.last<60000))return false;
   sql.exec('INSERT OR REPLACE INTO limit_state (id,day,count,last) VALUES (1,?,?,?)',day,count+1,now);return true;
  });return new Response(null,{status:accepted?204:429});
 }
}
function headers(origin){return{'Cache-Control':'no-store','Pragma':'no-cache','Content-Type':'application/json','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",'X-Frame-Options':'DENY','Vary':'Origin',...(origin?{'Access-Control-Allow-Origin':origin}:{})};}
export default{async fetch(request,env){
 if(!new URL(request.url).pathname.startsWith('/api/')&&env.ASSETS)return env.ASSETS.fetch(request);
 const origin=request.headers.get('Origin');const allowed=env.APP_ORIGIN;
 // Extra public app origins (e.g. the GitHub Pages mirror) may reach the same
 // owner-verified APIs. Widens browser-origin reach only; every request still
 // requires a valid owner credential or session. Comma-separated exact https origins.
 const extraOrigins=(env.APP_EXTRA_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
 const matchedOrigin=origin&&[allowed,...extraOrigins].includes(origin)?origin:null;
 const reply=(status,data,extra={})=>new Response(JSON.stringify(data),{status,headers:{...headers(matchedOrigin),...extra}});
 const ownerCheck=new URL(request.url).pathname==='/api/owner-check';
 const notesApi=new URL(request.url).pathname.startsWith('/api/notes/');
 if(new URL(request.url).pathname==='/api/review-events'){
  if(env.REVIEW_WRITES_ENABLED!=='yes'||!env.REVIEW_PROJECTION)return reply(503,{error:'review_writes_disabled'});
  return acceptReviewRequest(request,{enabled:true,origin:matchedOrigin,ownerSub:env.OWNER_GOOGLE_SUB,verifyIdentity:async credential=>verifyOwner(credential,env),atomicAppend:async row=>{const stub=env.REVIEW_PROJECTION.get(env.REVIEW_PROJECTION.idFromName(env.OWNER_GOOGLE_SUB));const response=await stub.fetch('https://review.internal/project',{method:'POST',body:JSON.stringify({row})});return response.json()}});
 }
 const path0=new URL(request.url).pathname;
 // Sheets TEST connection (GrantDO). Disabled unless SHEETS_AUTH_ENABLED==='yes'.
 // The callback is a browser redirect: no Origin and no JWT — it is bound by the
 // one-time owner-bound state (+PKCE) created under an authenticated /start.
 if(path0==='/api/sheets-auth/callback'&&request.method==='GET'){
  if(env.SHEETS_AUTH_ENABLED!=='yes'||!env.GRANT_STORE||!env.SHEETS_GRANT_KEY||!env.GOOGLE_CLIENT_SECRET||!env.GOOGLE_CLIENT_ID||!env.OWNER_GOOGLE_SUB||!allowed)return reply(503,{error:'sheets_auth_disabled'});
  return env.GRANT_STORE.get(env.GRANT_STORE.idFromName('owner')).fetch('https://grant.internal/callback'+new URL(request.url).search);
 }
 if(path0==='/api/sheets-auth/start'||path0==='/api/sheets-test'||path0==='/api/sheets-disconnect'){
  if(env.SHEETS_AUTH_ENABLED!=='yes'||!env.GRANT_STORE||!env.SHEETS_GRANT_KEY||!env.GOOGLE_CLIENT_SECRET)return reply(503,{error:'sheets_auth_disabled'});
  if(origin!==allowed)return reply(403,{error:'origin_denied'});
  if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
  const authToken=request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9._-]{20,8192})$/)?.[1];if(!authToken)return reply(401,{error:'sign_in_required'});
  try{await verifyOwner(authToken,env);}catch(error){const failure=identityFailure(error);return reply(failure.status,{error:failure.error,reason:failure.reason});}
  const target=path0==='/api/sheets-auth/start'?'/start':path0==='/api/sheets-test'?'/test':'/disconnect';
  return env.GRANT_STORE.get(env.GRANT_STORE.idFromName('owner')).fetch('https://grant.internal'+target,{method:'POST'});
 }
 const sessionMgmt=path0==='/api/session-logout'||path0==='/api/session-revoke-all';
 if((!ownerCheck&&!sessionMgmt&&!notesApi&&(!env.GEMINI_API_KEY||!evaluateGate({flag:env.API_PRIVACY_CONFIRMED,openUntil:env.GATE_OPEN_UNTIL,now:Date.now()}).open||!env.LIMITS))||!env.GOOGLE_CLIENT_ID||!env.OWNER_GOOGLE_SUB||!allowed)return reply(503,{error:'not_configured'});
 try{for(const configuredOrigin of [allowed,...extraOrigins]){const configured=new URL(configuredOrigin);if(configured.origin!==configuredOrigin||configured.protocol!=='https:')return reply(503,{error:'invalid_origin_configuration'});}}catch{return reply(503,{error:'invalid_origin_configuration'});}
 if(!matchedOrigin)return reply(403,{error:'origin_denied'});
 if(!ownerCheck&&!notesApi&&path0!=='/api/live-token'&&path0!=='/api/session-logout'&&path0!=='/api/session-revoke-all')return reply(404,{error:'not_found'});
 if(request.method==='OPTIONS'){
  const method=request.headers.get('Access-Control-Request-Method');const fields=(request.headers.get('Access-Control-Request-Headers')||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
  if(method!=='POST'||fields.some(x=>!['authorization','content-type'].includes(x)))return reply(403,{error:'preflight_denied'});
  return new Response(null,{status:204,headers:{...headers(matchedOrigin),'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'authorization, content-type','Access-Control-Max-Age':'600','Vary':'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'}});
 }
 if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
 // Owner session cookie: an HttpOnly HMAC-signed re-auth credential scoped to /api
 // (owner-check, live-token, session-logout only). Absolute cap plus inactivity
 // window; revocation is global via OWNER_SESSION_VERSION. Never accepted for
 // Sheets/TEST, review writes or any learner data. See docs/SESSION-COOKIE.md.
 let sessionKey=null;try{sessionKey=env.SESSION_KEY?parseSessionKey(env.SESSION_KEY):null;}catch{sessionKey=null;}
 const sessionVersion=Number(env.OWNER_SESSION_VERSION||'1');
 if(path0==='/api/session-logout')return reply(200,{loggedOut:true},{'Set-Cookie':clearSessionCookieHeader()});
 const token=request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9._-]{20,8192})$/)?.[1];
 let identity,setCookie='';
 if(token){
  try{identity=await verifyOwner(token,env);}catch(error){const failure=identityFailure(error);return reply(failure.status,{error:failure.error,reason:failure.reason});}
  if(sessionKey){const value=await mintSession(sessionKey,identity.sub,{version:sessionVersion});setCookie=sessionCookieHeader(value,Math.floor(SESSION_DEFAULTS.absMs/1000));}
 }else{
  if(!sessionKey)return reply(401,{error:'sign_in_required'});
  const presented=(/(?:^|;\s*)owner_session=([^;]+)/.exec(request.headers.get('Cookie')||'')||[])[1]||'';
  const verified=await verifySession(sessionKey,presented,{version:sessionVersion,ownerSub:env.OWNER_GOOGLE_SUB});
  if(!verified.ok)return reply(401,{error:'session_invalid',reason:verified.reason},{'Set-Cookie':clearSessionCookieHeader()});
  if(env.LIMITS){
   let nbf=0;try{const floor=await env.LIMITS.get(env.LIMITS.idFromName(env.OWNER_GOOGLE_SUB)).fetch('https://quota.internal/session-nbf',{method:'POST'});if(!floor.ok)throw Error();nbf=(await floor.json()).nbf||0;}catch{return reply(503,{error:'session_store_unavailable'});}
   if(verified.iat<=nbf)return reply(401,{error:'session_invalid',reason:'revoked'},{'Set-Cookie':clearSessionCookieHeader()});
  }
  identity={sub:verified.sub};
  const renewed=await renewSession(sessionKey,presented,{version:sessionVersion,ownerSub:env.OWNER_GOOGLE_SUB});
  if(renewed)setCookie=sessionCookieHeader(renewed,Math.floor(SESSION_DEFAULTS.absMs/1000));
 }
 const sessionExtra=setCookie?{'Set-Cookie':setCookie}:{};
 if(path0==='/api/session-revoke-all'){
  if(!env.LIMITS)return reply(503,{error:'not_configured'});
  try{const revoked=await env.LIMITS.get(env.LIMITS.idFromName(identity.sub)).fetch('https://quota.internal/revoke-all',{method:'POST'});if(!revoked.ok)throw Error();}catch{return reply(503,{error:'session_store_unavailable'});}
  return reply(200,{revokedAll:true},{'Set-Cookie':clearSessionCookieHeader()});
 }
 if(notesApi){
  if(env.NOTES_ENABLED!=='yes'||!env.NOTES_DB)return reply(503,{error:'notes_disabled'});
  if(!token)return reply(401,{error:'sign_in_required'}); // Bearer-only: the owner session cookie never covers learner data
  return handleNotes(request,env,identity,reply);
 }
 if(ownerCheck)return reply(200,{ownerVerified:true,voiceEnabled:evaluateGate({flag:env.API_PRIVACY_CONFIRMED,openUntil:env.GATE_OPEN_UNTIL,now:Date.now()}).open},sessionExtra);
 let body;try{let size=0;const chunks=[];const reader=request.body?.getReader();if(!reader)return reply(400,{error:'invalid_json'});while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2048){await reader.cancel();return reply(413,{error:'too_large'});}chunks.push(value);}const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}body=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply(400,{error:'invalid_json'});}
 let voiceMode;try{voiceMode=validateVoiceMode(body?.voiceMode);}catch{return reply(400,{error:'invalid_voice_mode'});}
 let nickname;try{nickname=validateNickname(body?.nickname);}catch{return reply(400,{error:'invalid_nickname'});}
 const lesson=lessons.lessons.find(l=>l.id===body?.lessonId);if(!lesson)return reply(400,{error:'invalid_lesson'});
 try{
  const quota=env.LIMITS.get(env.LIMITS.idFromName(identity.sub));const reservation=await quota.fetch('https://quota.internal/reserve',{method:'POST'});if(reservation.status!==204)return reply(429,{error:'session_limit'});
  const now=Date.now();const response=await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},signal:AbortSignal.timeout(10000),body:JSON.stringify({uses:1,newSessionExpireTime:new Date(now+60000).toISOString(),expireTime:new Date(now+360000).toISOString(),bidiGenerateContentSetup:tokenSetup(lessonPrompt(prompt,lesson,nickname),voiceMode)})});
  if(!response.ok)return reply(502,{error:'provider_failed'});const data=await response.json();if(typeof data.name!=='string'||!data.name.startsWith('auth_tokens/'))return reply(502,{error:'invalid_provider_response'});
  return reply(200,{token:data.name,startBefore:new Date(now+60000).toISOString(),expiresAt:new Date(now+360000).toISOString()},sessionExtra);
 }catch{return reply(502,{error:'unavailable'});}
}};
