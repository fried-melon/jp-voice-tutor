#!/usr/bin/env node
// Fail-closed production build guard (added 2026-11-02 after the build-env regression
// shipped a local-dev credential UI to production twice in one day).
// The production client MUST be built with the owner-token mode configured.
// Harness/local builds bypass this by calling `vite build` directly, never `npm run build`.
const fail=(msg)=>{console.error('[build-guard] FAIL: '+msg);process.exit(1);};
const env=process.env;
if(env.VITE_OWNER_TOKEN_SERVICE_ENABLED!=='true')fail('VITE_OWNER_TOKEN_SERVICE_ENABLED must be exactly "true" (source deployment/build-env.txt before building). Without it the client exposes the local-dev API-key UI.');
const endpoint=env.VITE_OWNER_TOKEN_ENDPOINT;
if(!endpoint)fail('VITE_OWNER_TOKEN_ENDPOINT is required when the token service is enabled.');
try{const url=new URL(endpoint);
 if(url.username||url.password||url.search||url.hash)fail('token endpoint must not carry credentials, query or hash');
 if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))fail('token endpoint must be https outside localhost');
}catch(e){if(e&&e.message&&e.message.startsWith('token'))throw e;fail('token endpoint is not a valid URL: '+endpoint);}
if(!env.VITE_GOOGLE_CLIENT_ID)fail('VITE_GOOGLE_CLIENT_ID is required: without it the owner Google login never renders and the credential UI falls back to local-dev mode.');
console.log('[build-guard] env ok: owner-token mode, endpoint '+endpoint+', google client id configured');

// Face-mode regression guard (added 2026-11-03): the intended production face is human3d.
// A missing/typoed VITE_FACE_MODE must fail the production build instead of silently
// falling back (INITIAL_2D) as happened when the ad-hoc 02:41 override was not persisted.
if(env.VITE_FACE_MODE!=='human3d')fail('VITE_FACE_MODE must be exactly "human3d" for the production build (intended face config). Got: '+String(env.VITE_FACE_MODE));
