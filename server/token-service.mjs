import {validateNickname} from '../shared/nickname.mjs';
// Local prototype only. Deployment requires TLS, owner Google login, durable
// rate limits and confirmed API project/privacy settings. No default grants.
import{OAuth2Client}from'google-auth-library';
import{readFileSync}from'node:fs';
import{lessonPrompt,tokenSetup}from'../shared/live-contract.mjs';
export function createTokenService(config,{fetchImpl=fetch,verify,clock=Date.now}={}){
 const{apiKey,clientId,ownerSubject,allowedOrigin,privacyConfirmed}=config;
 if(!apiKey||!clientId||!ownerSubject||!allowedOrigin||privacyConfirmed!==true)throw Error('Required server configuration/privacy gate missing');
 const origin=new URL(allowedOrigin);if(origin.origin!==allowedOrigin)throw Error('Origin must be exact, no path');
 if(origin.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(origin.hostname))throw Error('TLS required');
 const auth=new OAuth2Client(clientId);
 const verifyIdentity=verify|| (async token=>(await auth.verifyIdToken({idToken:token,audience:clientId})).getPayload());
 const lessons=JSON.parse(readFileSync(new URL('../content/lessons.v1.json',import.meta.url))).lessons;
 const prompt=readFileSync(new URL('../prompts/tutor-ja.md',import.meta.url),'utf8');
 let lastIssue=-Infinity;let day='';let issued=0;let inflight=false;
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Pragma':'no-cache','Access-Control-Allow-Origin':allowedOrigin,'Vary':'Origin','X-Content-Type-Options':'nosniff'};
 const result=(status,data)=>({status,headers:{...headers},body:JSON.stringify(data)});
 return async function request({method,origin,authorization,body,requestMethod,requestHeaders}){
  if(origin!==allowedOrigin){const r=result(403,{error:'origin_denied'});delete r.headers['Access-Control-Allow-Origin'];return r;}
  if(method==='OPTIONS'){const requested=(requestHeaders||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);if(requestMethod!=='POST'||requested.some(h=>!['authorization','content-type'].includes(h)))return result(403,{error:'preflight_denied'});return{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'authorization, content-type','Access-Control-Max-Age':'600','Vary':'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'},body:''};}
  if(method!=='POST')return result(405,{error:'method_not_allowed'});
  const bearer=authorization?.match(/^Bearer ([A-Za-z0-9._-]{20,8192})$/)?.[1];if(!bearer)return result(401,{error:'sign_in_required'});
  let identity;try{identity=await verifyIdentity(bearer);}catch{return result(401,{error:'invalid_identity'});}
  if(!identity||identity.sub!==ownerSubject||identity.aud!==clientId||!['accounts.google.com','https://accounts.google.com'].includes(identity.iss)||!identity.exp||identity.exp*1000<=clock())return result(403,{error:'owner_only'});
  let nickname;try{nickname=validateNickname(body?.nickname);}catch{return result(400,{error:'invalid_nickname'});}
  const lesson=lessons.find(l=>l.id===body?.lessonId);if(!lesson)return result(400,{error:'invalid_lesson'});
  const today=new Date(clock()).toISOString().slice(0,10);if(today!==day){day=today;issued=0;}
  if(inflight||clock()-lastIssue<60000||issued>=5)return result(429,{error:'session_limit'});
  inflight=true;lastIssue=clock();issued++;
  try{
   // Empty fieldMask plus server setup ignores the client setup per AuthToken reference.
   // Tested against live provider: conflicting client system instruction did not win.
   const now=clock();const response=await fetchImpl('https://generativelanguage.googleapis.com/v1beta/auth_tokens',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},signal:AbortSignal.timeout(10000),body:JSON.stringify({uses:1,newSessionExpireTime:new Date(now+60000).toISOString(),expireTime:new Date(now+6*60000).toISOString(),bidiGenerateContentSetup:tokenSetup(lessonPrompt(prompt,lesson,nickname))})});
   if(!response.ok)return result(502,{error:'token_provider_failed'});
   const data=await response.json();if(typeof data.name!=='string'||!data.name.startsWith('auth_tokens/'))return result(502,{error:'invalid_provider_response'});
   // Never echo headers, owner identity, provider errors, request credentials or key.
   return result(200,{token:data.name,expiresAt:new Date(now+6*60000).toISOString(),startBefore:new Date(now+60000).toISOString()});
  }catch{return result(502,{error:'token_provider_unavailable'});}finally{inflight=false;}
 };
}
