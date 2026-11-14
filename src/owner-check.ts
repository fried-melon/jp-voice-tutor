// Identity-only diagnostic. No login/prompt, microphone, Live token mint or media.
// Must match token-client.SESSION_PROOF (tests assert equality).
const SESSION_PROOF='cookie:owner-session';
export type OwnerCheckState='signed_out'|'unverified'|'checking'|'verified_closed'|'verified_open'|'rejected'|'unavailable';
export function mountOwnerCheck(container:HTMLElement,endpoint:string,fetcher:typeof fetch=fetch,onState:(state:OwnerCheckState)=>void=()=>{}){
 const state=(value:OwnerCheckState)=>onState(value);
 let proof='',revision=0,busy=false,abort:AbortController|undefined;
 const panel=document.createElement('section');panel.className='owner-diagnostic';panel.setAttribute('aria-label','본인 확인 상세');
 const title=document.createElement('strong');title.textContent='본인 확인 상세 (점검용)';
 const result=document.createElement('p');result.className='privacy';result.setAttribute('role','status');result.setAttribute('aria-live','polite');result.textContent='이 탭에는 로그인 정보가 없어요. 아래 확인 버튼은 로그인 알림을 보내지 않아요.';
 const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='본인 확인만 점검 (음성 없음)';button.disabled=true;
 const help=document.createElement('p');help.className='privacy';help.textContent='현재 탭의 로그인 정보만 확인해요. 마이크·음성·사용 횟수는 쓰지 않아요. 새로고침하거나 로그인 정보를 지우면 다시 로그인해야 해요.';
 panel.append(title,result,button,help);container.append(panel);
 const check=async()=>{
  if(!proof||busy)return;busy=true;button.disabled=true;const current=revision;const controller=new AbortController();abort=controller;
  state('checking');result.textContent='본인 확인 서버에서 점검 중이에요. 마이크와 음성은 꺼져 있어요.';
  const timeout=setTimeout(()=>controller.abort(),10000);
  try{
   const cookieAttempt=!proof||proof===SESSION_PROOF;
   const response=await fetcher(new URL('/api/owner-check',endpoint||location.href),{method:'POST',headers:cookieAttempt?{}:{Authorization:'Bearer '+proof},credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});
   if(current!==revision)return;
   if(response.ok){const data=await response.json();if(current!==revision)return;if(data.ownerVerified!==true)throw Error('Invalid owner response');state(data.voiceEnabled===true?'verified_open':'verified_closed');result.textContent=data.voiceEnabled===true?'본인 확인 통과 · 음성 연결 문은 열려 있어요. 이 점검에서는 음성을 시작하지 않았어요.':'본인 확인 통과 · 음성 연결은 잠겨 있어요. 로그인은 정상이며 이 점검에서는 음성을 시작하지 않았어요.';}
   else if(response.status===401){const data=await response.json().catch(()=>({}));if(current!==revision)return;state(data.error==='session_invalid'?'signed_out':'rejected');const reason=['expired','claim_aud','claim_iss','claim_sub','claim_exp','claim_iat','claim_nbf','claims','signature','token_format','owner_mismatch'].includes(data.reason)?'/'+data.reason:'';result.textContent='본인 확인 미통과 [401/owner_check'+reason+']. 자동으로 다시 로그인하거나 알림을 보내지 않아요. 안내를 기다려 주세요.';}
   else {const data=await response.json().catch(()=>({}));if(current!==revision)return;state('unavailable');const reason=['jwks_timeout','jwks_service','key_not_found','verification_service'].includes(data.reason)?'/'+data.reason:'';result.textContent='본인 확인 서버 응답 ['+response.status+'/owner_check'+reason+']. 로그인 정보는 그대로예요. 반복 로그인하지 말고 이 문구를 알려 주세요.';}
  }catch{if(current===revision){state('unavailable');result.textContent='본인 확인 결과를 받지 못했어요. [network/owner_check] 로그인 정보는 그대로예요. 자동으로 다시 시도하지 않아요.';}}
  finally{clearTimeout(timeout);if(current===revision){busy=false;abort=undefined;button.disabled=!proof;}}
 };
 button.addEventListener('click',()=>void check());
 return{setProof(value:string){revision++;abort?.abort();abort=undefined;busy=false;proof=value;state(proof?'unverified':'signed_out');button.disabled=!proof;result.textContent=proof?'로그인 정보를 받았어요. 본인 확인만 점검할 수 있어요.':'이 탭에는 로그인 정보가 없어요. 아래 확인 버튼은 로그인 알림을 보내지 않아요.';},check};
}
