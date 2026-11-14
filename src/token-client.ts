// Flag-gated, login-provider-neutral preparation. No login SDK or secrets loaded.
export interface LoginProof {idToken:string;}
// Sentinel meaning "authenticate with the server-issued HttpOnly session cookie".
// Never a real credential; the worker Bearer regex rejects it, so it cannot leak
// into an Authorization header.
export const SESSION_PROOF='cookie:owner-session';
export class OwnerTokenError extends Error {constructor(public status:number,public code:string,public reason=''){super('Owner token service: '+code);this.name='OwnerTokenError';}}
export async function fetchLiveToken(endpoint:string,proof:LoginProof,lessonId:string,signal?:AbortSignal,fetcher:typeof fetch=fetch,nickname='',voiceMode='continuous'){
 if(!['continuous','push-to-talk'].includes(voiceMode))throw Error('Invalid voice mode');
 const url=new URL(endpoint,location.href);
 if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('TLS token endpoint required');
 if(url.username||url.password||url.search||url.hash)throw Error('Invalid token endpoint');
 if(proof.idToken.length>8192)throw Error('Owner sign-in required');
 const cookieAttempt=!proof.idToken||proof.idToken===SESSION_PROOF;
 const response=await fetcher(url.href,{method:'POST',headers:{...(cookieAttempt?{}:{Authorization:'Bearer '+proof.idToken}),'Content-Type':'application/json'},body:JSON.stringify({lessonId,...(nickname?{nickname}:{}),...(voiceMode!=='continuous'?{voiceMode}:{})}),credentials:'same-origin',cache:'no-store',redirect:'error',signal});
 if(!response.ok){let code='request_failed',reason='';try{const data=await response.json();if(['not_configured','invalid_identity','sign_in_required','session_invalid','session_store_unavailable','origin_denied','session_limit','provider_failed','unavailable','invalid_provider_response','invalid_lesson','invalid_nickname','invalid_voice_mode','identity_unavailable'].includes(data.error))code=data.error;if(['jwks_timeout','jwks_service','expired','claim_aud','claim_iss','claim_sub','claim_exp','claim_iat','claim_nbf','claims','key_not_found','signature','token_format','owner_mismatch','verification_service','malformed','revoked','version','expired_absolute','expired_idle','renewal_cap'].includes(data.reason))reason=data.reason;}catch{}throw new OwnerTokenError(response.status,code,reason);}
 const data=await response.json();if(typeof data.token!=='string'||!data.token.startsWith('auth_tokens/')||!Number.isFinite(Date.parse(data.startBefore))||Date.parse(data.startBefore)<=Date.now()||!Number.isFinite(Date.parse(data.expiresAt))||Date.parse(data.expiresAt)<=Date.now()||Date.parse(data.startBefore)>Date.parse(data.expiresAt))throw Error('Invalid token service response');
 return data.token as string;
}
