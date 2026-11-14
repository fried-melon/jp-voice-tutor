// Safe diagnostics only: no raw exception messages, token, payload or claim values.
export function identityFailure(error){
 const code=error?.code;
 if(code==='ERR_JWKS_TIMEOUT'||code==='ERR_JWKS_INVALID'||code==='ERR_JWKS_MULTIPLE_MATCHING_KEYS')return{status:503,error:'identity_unavailable',reason:code==='ERR_JWKS_TIMEOUT'?'jwks_timeout':'jwks_service'};
 if(code==='ERR_JWT_EXPIRED')return{status:401,error:'invalid_identity',reason:'expired'};
 if(code==='ERR_JWT_CLAIM_VALIDATION_FAILED')return{status:401,error:'invalid_identity',reason:['aud','iss','sub','exp','iat','nbf'].includes(error.claim)?'claim_'+error.claim:'claims'};
 if(code==='ERR_JWKS_NO_MATCHING_KEY')return{status:503,error:'identity_unavailable',reason:'key_not_found'};
 if(code==='ERR_JWS_SIGNATURE_VERIFICATION_FAILED')return{status:401,error:'invalid_identity',reason:'signature'};
 if(['ERR_JWS_INVALID','ERR_JWT_INVALID','ERR_JOSE_ALG_NOT_ALLOWED','ERR_JOSE_NOT_SUPPORTED'].includes(code))return{status:401,error:'invalid_identity',reason:'token_format'};
 if(error?.message==='owner_only')return{status:401,error:'invalid_identity',reason:'owner_mismatch'};
 // Network/runtime faults must never masquerade as expired/incorrect sign-in.
 return{status:503,error:'identity_unavailable',reason:'verification_service'};
}
