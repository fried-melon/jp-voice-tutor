import{TOKEN_ENDPOINT}from'./sheets-oauth-flow.mjs';
// Real HTTP clients for the pinned Google token endpoint. Transport only:
// credentials come from the caller (worker env), the endpoint cannot be
// redirected, and Google error codes propagate verbatim so invalid_grant
// handling stays exact. Retry policy belongs to the caller's durable state.
async function post(fetcher,endpoint,params){
 if(endpoint!==TOKEN_ENDPOINT)throw Error('Unexpected token endpoint');
 let response;try{response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params).toString(),signal:AbortSignal.timeout(10000)})}catch(e){throw Object.assign(Error(`token_transport:${e?.name==='TimeoutError'?'timeout':'network'}`),{retryable:true})}
 let data;try{data=await response.json()}catch{throw Object.assign(Error('token_transport:bad_json'),{retryable:true})}
 if(!response.ok)throw Object.assign(Error(`token_error:${data?.error??response.status}`),{retryable:!['invalid_grant','invalid_client','unauthorized_client'].includes(data?.error)});
 return data;
}
export function createTokenClient({fetcher=globalThis.fetch}={}){
 if(typeof fetcher!=='function')throw Error('Missing fetch');
 return{
  exchange:async({code,clientId,clientSecret,redirectUri,endpoint=TOKEN_ENDPOINT})=>{
   if(!code||!clientId||!clientSecret||!redirectUri)throw Error('Missing exchange input');
   return post(fetcher,endpoint,{grant_type:'authorization_code',code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri});
  },
  refresh:async({refreshToken,clientId,clientSecret,endpoint=TOKEN_ENDPOINT})=>{
   if(!refreshToken||!clientId||!clientSecret)throw Error('Missing refresh input');
   return post(fetcher,endpoint,{grant_type:'refresh_token',refresh_token:refreshToken,client_id:clientId,client_secret:clientSecret});
  }
 };
}
