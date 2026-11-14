import{encryptGrant,decryptGrant}from'./sheets-oauth-security.mjs';
import{consumePendingAuth,saveGrant,loadGrant,revokeGrant}from'./sheets-grant-repository.mjs';
export const TOKEN_ENDPOINT='https://oauth2.googleapis.com/token';
// Disabled orchestration only: the HTTP exchange/refresh callers are injected,
// so this module has no network effect of its own and no live route exists.
// Access tokens return to the caller in memory and are never persisted.
export async function handleOwnerCallback(db,{binding,keyBytes,code,state,exchange,now=Date.now()}){
 if(typeof code!=='string'||!code||typeof exchange!=='function')throw Error('Invalid callback input');
 consumePendingAuth(db,{state,ownerSub:binding.ownerSub,clientId:binding.clientId,origin:binding.origin,now});
 const token=await exchange({code,endpoint:TOKEN_ENDPOINT});
 if(typeof token?.refresh_token!=='string'||!token.refresh_token)throw Error('Exchange returned no refresh token');
 if(typeof token?.access_token!=='string'||!token.access_token||!Number.isFinite(token?.expires_in))throw Error('Exchange returned no access token');
 saveGrant(db,await encryptGrant(token.refresh_token,keyBytes,binding),{ownerSub:binding.ownerSub,clientId:binding.clientId,keyVersion:binding.keyVersion,now});
 return{connected:true,accessToken:{token:token.access_token,expiresAt:now+token.expires_in*1000}};
}
export async function refreshGrantAccess(db,{binding,keyBytes,refresh,now=Date.now()}){
 if(typeof refresh!=='function')throw Error('Missing refresh caller');
 const state=loadGrant(db,{keyVersion:binding.keyVersion});
 if(!state.connected)return{connected:false,reason:'not_connected'};
 const refreshToken=await decryptGrant(state.encryptedGrant,keyBytes,binding);
 let token;try{token=await refresh({refreshToken,endpoint:TOKEN_ENDPOINT})}catch(error){
  if(String(error?.message||error).includes('invalid_grant')){revokeGrant(db,{now});return{connected:false,reason:'invalid_grant'}}
  throw error;
 }
 if(typeof token?.access_token!=='string'||!token.access_token||!Number.isFinite(token?.expires_in))throw Error('Refresh returned no access token');
 // Google may rotate the refresh token; persist the replacement atomically.
 if(typeof token.refresh_token==='string'&&token.refresh_token)saveGrant(db,await encryptGrant(token.refresh_token,keyBytes,binding),{ownerSub:binding.ownerSub,clientId:binding.clientId,keyVersion:binding.keyVersion,now});
 return{connected:true,accessToken:{token:token.access_token,expiresAt:now+token.expires_in*1000}};
}
