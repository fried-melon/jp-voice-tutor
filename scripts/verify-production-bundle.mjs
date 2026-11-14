#!/usr/bin/env node
// Post-build fail-closed check: the emitted bundle must actually carry the
// owner-token configuration (guards against env loss between assert and emit).
import{readFileSync,readdirSync}from'node:fs';
const fail=(msg)=>{console.error('[bundle-guard] FAIL: '+msg);process.exit(1);};
const endpoint=process.env.VITE_OWNER_TOKEN_ENDPOINT||'';
const clientId=process.env.VITE_GOOGLE_CLIENT_ID||'';
if(!endpoint||!clientId)fail('env missing at post-build check; run via npm run build with build-env sourced');
const html=readFileSync('dist/index.html','utf8');
if(!html.includes('https://accounts.google.com/gsi/'))fail('dist CSP lacks accounts.google.com/gsi - Google client id was not applied at build time');
const tokenOrigin=new URL(endpoint).origin;
if(!html.includes(tokenOrigin))fail('dist CSP connect-src lacks the token origin '+tokenOrigin);
const assets=readdirSync('dist/assets').filter(f=>f.endsWith('.js'));
let foundEndpoint=false,foundClientId=false;
for(const f of assets){const s=readFileSync('dist/assets/'+f,'utf8');if(s.includes('/api/live-token'))foundEndpoint=true;if(s.includes(clientId))foundClientId=true;}
if(!foundEndpoint)fail('no dist bundle references /api/live-token - token-service branch not compiled in');
if(!foundClientId)fail('no dist bundle carries the Google client id - owner login would render hidden');
console.log('[bundle-guard] dist ok: CSP gsi+token origin, endpoint and client id embedded');
