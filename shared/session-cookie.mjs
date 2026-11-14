// Worker-issued owner session cookie (additive to the GIS ID-token path).
// Honest contract, single-owner app:
// - Stateless signed bearer: a stolen cookie replays until expiry or a
//   global version bump. There is NO per-session server-side revocation.
// - Absolute lifetime (expAbs) is a hard cap; rolling inactivity renewal
//   (expIdle) can never extend past it.
// - Logout clears the browser cookie only; it does NOT invalidate a stolen
//   copy. Global revocation = bump OWNER_SESSION_VERSION (sign out everywhere).
// - Scope: cookie auth is accepted ONLY for minting ephemeral Live tokens
//   (/api/live-token) and /api/owner-check. Sheets/TEST/review endpoints and
//   any future learner-history endpoint stay Bearer-ID-token-only unless
//   re-reviewed. Cookie grants no learner-data access today.
// - Cookie is bound to the already-verified owner sub at mint; verify
//   re-checks sub === expected owner. Origin checks on /api still apply.
const te=new TextEncoder();
async function hmac(keyBytes,data){
 const key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return new Uint8Array(await crypto.subtle.sign('HMAC',key,te.encode(data)));
}
const b64=u=>btoa(String.fromCharCode(...u)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export const SESSION_DEFAULTS={idleMs:48*3600*1000,absMs:14*24*3600*1000,version:1};
export function generateSessionKey(){return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));}
export function parseSessionKey(secret){
 const bytes=unb64(String(secret||''));
 if(bytes.byteLength!==32)throw Error('session_key_invalid');
 return bytes;
}
async function sign(keyBytes,v,sub,iat,expAbs,expIdle){return b64(await hmac(keyBytes,`${v}.${sub}.${iat}.${expAbs}.${expIdle}`));}
export async function mintSession(keyBytes,sub,{now=Date.now(),idleMs=SESSION_DEFAULTS.idleMs,absMs=SESSION_DEFAULTS.absMs,version=SESSION_DEFAULTS.version,iat}={}){
 if(!sub||typeof sub!=='string')throw Error('sub_required');
 const issuedAt=iat??now;
 const expAbs=issuedAt+absMs, expIdle=now+idleMs;
 return `${version}.${sub}.${issuedAt}.${expAbs}.${expIdle}.${await sign(keyBytes,version,sub,issuedAt,expAbs,expIdle)}`;
}
const parse=v=>{const m=/^(\d{1,4})\.([A-Za-z0-9_-]+)\.(\d{10,16})\.(\d{10,16})\.(\d{10,16})\.([A-Za-z0-9_-]{43})$/.exec(String(v||''));return m?{version:Number(m[1]),sub:m[2],iat:Number(m[3]),expAbs:Number(m[4]),expIdle:Number(m[5]),sig:m[6]}:null;};
export async function verifySession(keyBytes,cookieValue,{now=Date.now(),version=SESSION_DEFAULTS.version,ownerSub}={}){
 const p=parse(cookieValue);if(!p)return{ok:false,reason:'malformed'};
 if(p.version!==version)return{ok:false,reason:'version'};
 if(p.expAbs<=now)return{ok:false,reason:'expired_absolute'};
 if(p.expIdle<=now)return{ok:false,reason:'expired_idle'};
 if(ownerSub&&p.sub!==ownerSub)return{ok:false,reason:'wrong_owner'};
 const expect=unb64(await sign(keyBytes,p.version,p.sub,p.iat,p.expAbs,p.expIdle));
 const got=unb64(p.sig);let diff=got.byteLength!==expect.byteLength?1:0;
 for(let i=0;i<got.byteLength&&i<expect.byteLength;i++)diff|=got[i]^expect[i];
 if(diff)return{ok:false,reason:'bad_sig'};
 return{ok:true,sub:p.sub,iat:p.iat,expAbs:p.expAbs,expIdle:p.expIdle};
}
// Rolling inactivity renewal, hard-capped by the original absolute expiry.
// Returns null when no renewal is needed (more than half the idle window left).
export async function renewSession(keyBytes,cookieValue,{now=Date.now(),idleMs=SESSION_DEFAULTS.idleMs,absMs=SESSION_DEFAULTS.absMs,version=SESSION_DEFAULTS.version,ownerSub}={}){
 const v=await verifySession(keyBytes,cookieValue,{now,version,ownerSub});
 if(!v.ok)return null;
 if(v.expIdle-now>idleMs/2)return null;
 return mintSession(keyBytes,v.sub,{now,idleMs,absMs,version,iat:v.iat});
}
export function sessionCookieHeader(value,maxAgeSec){
 return `owner_session=${value}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSec}`;
}
export function clearSessionCookieHeader(){
 return 'owner_session=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
}
export const SESSION_COOKIE_NAME='owner_session';
