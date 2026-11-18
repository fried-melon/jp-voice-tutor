// Identity proof lives only in memory. Only the server verifies owner authority.
// Must match token-client.SESSION_PROOF (tests assert equality).
const SESSION_PROOF='cookie:owner-session';
export interface SessionEndpoints {checkEndpoint:string;logoutEndpoint:string;}
interface GoogleIdentity {
 initialize(options:{client_id:string;nonce:string;callback:(response:{credential?:string})=>void;auto_select:boolean}):void;
 prompt(listener?:(notification:{isNotDisplayed?:()=>boolean;isSkippedMoment?:()=>boolean})=>void):void;
 renderButton(element:HTMLElement,options:{theme:string;size:string;text:string}):void;
 disableAutoSelect():void;
}
declare global {interface Window {google?:{accounts:{id:GoogleIdentity}}}}
let identityLoader:Promise<void>|undefined;
function loadIdentityScript(){
 if(window.google?.accounts.id)return Promise.resolve();
 if(!identityLoader)identityLoader=new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.onload=()=>resolve();script.onerror=()=>{identityLoader=undefined;reject(Error('Google login unavailable'));};document.head.append(script);});
 return identityLoader;
}
export async function mountOwnerLogin(container:HTMLElement,clientId:string,onProof:(proof:string)=>void,session?:SessionEndpoints){
 if(!/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId))throw Error('Invalid Google client ID');
 const button=document.createElement('div');button.id='google-signin-ui';const account=document.createElement('span');account.id='owner-account-chip';account.className='pill';account.textContent='Google 로그인됨';account.hidden=true;const note=document.createElement('p');note.className='privacy';note.textContent='Google 로그인은 본인 확인에만 사용해요. 음성 연결은 별도 승인 전까지 꺼져 있어요.';
 const signout=document.createElement('button');signout.type='button';signout.className='text-button';signout.textContent='이 브라우저에서 로그아웃';signout.hidden=true;
 const revokeAll=document.createElement('button');revokeAll.type='button';revokeAll.className='text-button';revokeAll.textContent='모든 기기에서 로그아웃';revokeAll.hidden=true;
 container.replaceChildren(button,account,note,signout,revokeAll);let expiry:ReturnType<typeof setTimeout>|undefined;
 let currentProof='';let resumedCookie=false;
 // forget: memory only (page hide). clear: also ends this browser's server session cookie.
 // Neither can invalidate a credential copied elsewhere — only revokeAll does (server-side floor).
 const forget=()=>{clearTimeout(expiry);currentProof='';button.hidden=false;account.hidden=true;onProof('');signout.hidden=true;revokeAll.hidden=true;window.google?.accounts.id.disableAutoSelect();};
 const clear=()=>{if(session)void fetch(new URL('/api/session-logout',session.logoutEndpoint),{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error'}).catch(()=>{});forget();note.textContent='이 브라우저의 로그인만 해제됐어요. 다른 기기나 복사된 로그인 정보까지 무효화하려면 "모든 기기에서 로그아웃"을 눌러 주세요.';};
 const revokeEverywhere=async()=>{if(!session)return;revokeAll.disabled=true;
  try{const cookieAttempt=!currentProof||currentProof===SESSION_PROOF;const response=await fetch(new URL('/api/session-revoke-all',session.logoutEndpoint),{method:'POST',headers:cookieAttempt?{}:{Authorization:'Bearer '+currentProof},credentials:'same-origin',cache:'no-store',redirect:'error'});if(!response.ok)throw Error();
   forget();note.textContent='모든 기기의 저장된 로그인을 무효화했어요. 다음 사용부터 다시 로그인해 주세요.';
  }catch{revokeAll.disabled=false;note.textContent='전체 로그아웃에 실패했어요. 네트워크를 확인하고 다시 시도해 주세요.';}
 };
 signout.addEventListener('click',clear);revokeAll.addEventListener('click',()=>void revokeEverywhere());window.addEventListener('pagehide',forget);
 // Silent resume: a valid HttpOnly session cookie skips the Google tap entirely.
 if(session){try{const resumed=await fetch(new URL('/api/owner-check',session.checkEndpoint),{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error'});if(resumed.ok){const data=await resumed.json();if(data.ownerVerified===true){currentProof=SESSION_PROOF;button.hidden=true;account.hidden=false;onProof(SESSION_PROOF);signout.hidden=false;revokeAll.hidden=false;note.textContent='저장된 로그인 정보로 본인 확인을 마쳤어요. 다시 로그인할 필요가 없어요.';resumedCookie=true;}}}catch{}}
 await loadIdentityScript();
 const nonce=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
 const identity=window.google?.accounts.id;if(!identity)throw Error('Google login unavailable');
 identity.initialize({client_id:clientId,nonce,auto_select:false,callback:response=>{
  try{const credential=response.credential;if(!credential||credential.length>8192)throw Error();const part=credential.split('.')[1];const claims=JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/')));const remaining=Number(claims.exp)*1000-Date.now();if(claims.nonce!==nonce||claims.aud!==clientId||remaining<=0||!Number.isFinite(remaining))throw Error();
   clearTimeout(expiry);currentProof=credential;button.hidden=true;account.hidden=false;onProof(credential);signout.hidden=false;revokeAll.hidden=false;note.textContent='Google 로그인 정보를 받았어요. 본인 여부는 연결할 때 서버에서 확인해요.';expiry=setTimeout(forget,Math.min(remaining,3600000));
  }catch{forget();note.textContent='로그인 응답을 사용할 수 없어요. 다시 로그인해 주세요.';}
 }});identity.renderButton(button,{theme:'outline',size:'large',text:'signin_with'});
 // One Tap: the credential is delivered in-page, which also covers browsers
 // where the button's popup flow cannot return the credential to this tab.
 if(!resumedCookie)identity.prompt();
 return clear;
}

// Silent re-auth for background saves: auto_select returns a fresh credential
// without a tap when the browser still has a consented Google session. Resolves
// null on any failure/timeout; never throws, never blocks the session.
export async function refreshGoogleCredential(clientId:string):Promise<string|null>{
 // Cookie resume need not load GIS; load it only when records need a Bearer.
 try{await loadIdentityScript();}catch{return null;}
 return new Promise(resolve=>{
  const identity=window.google?.accounts.id;
  if(!identity||!/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId)){resolve(null);return;}
  let done=false;
  const finish=(value:string|null)=>{if(!done){done=true;clearTimeout(timer);resolve(value);}};
  const timer=setTimeout(()=>finish(null),10000);
  try{
   const nonce=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
   identity.initialize({client_id:clientId,nonce,auto_select:true,callback:response=>{
    try{
     const credential=response.credential;if(!credential||credential.length>8192){finish(null);return;}
     const part=credential.split('.')[1];const claims=JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/')));
     if(claims.nonce!==nonce||claims.aud!==clientId||!(Number(claims.exp)*1000>Date.now())){finish(null);return;}
     finish(credential);
    }catch{finish(null);}
   }});
   identity.prompt(notification=>{if(notification?.isNotDisplayed?.()||notification?.isSkippedMoment?.())finish(null);});
  }catch{finish(null);}
 });
}
