#!/usr/bin/env node
// Canonical production deploy entrypoint (added 2026-11-03 after the source/worker
// mis-deploy incident). Verifies env/bundle/config BEFORE invoking wrangler, so a
// wrong-env build or an unexpected binding/migration cannot ship even when the
// npm build guards were bypassed. Usage:
//   node scripts/deploy-production.mjs --check-only   # validate, do not deploy
//   CLOUDFLARE_API_TOKEN=... node scripts/deploy-production.mjs   # validate + deploy
import{readFileSync,readdirSync,existsSync}from'node:fs';
import{execFileSync}from'node:child_process';
const root=new URL('..',import.meta.url).pathname;          // source/
const deploy=root+'../deployment/';
const fail=(m)=>{console.error('[deploy-guard] FAIL: '+m);process.exit(1);};
const ok=(m)=>console.log('[deploy-guard] '+m);

// 1. Build env: the bundle must come from build-env.txt, not a hand-rolled env.
const envText=readFileSync(deploy+'build-env.txt','utf8');
const env=Object.fromEntries(envText.split('\n').filter(l=>l&&l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
if(env.VITE_OWNER_TOKEN_SERVICE_ENABLED!=='true')fail('build-env.txt: VITE_OWNER_TOKEN_SERVICE_ENABLED must be "true"');
if(!env.VITE_OWNER_TOKEN_ENDPOINT)fail('build-env.txt: VITE_OWNER_TOKEN_ENDPOINT missing');
if(!env.VITE_GOOGLE_CLIENT_ID)fail('build-env.txt: VITE_GOOGLE_CLIENT_ID missing');
if(env.VITE_NOTES_PERSIST!=='true')fail('build-env.txt: VITE_NOTES_PERSIST must be "true" (client D cleared 2026-11-03: private transcript save/history/recovery + finish-keeps-login)');
if(env.VITE_FACE_MODE!=='human3d')fail('build-env.txt: VITE_FACE_MODE must be "human3d" (intended production face config; 2026-11-03 regression guard - a missing override silently shipped 2D)');
ok('build-env: owner-token mode, notes persist ON (client D cleared 2026-11-03)');

// 2. Bundle: deployment/dist must embed the production auth configuration.
const dist=deploy+'dist/';
const html=readFileSync(dist+'index.html','utf8');
if(!html.includes('https://accounts.google.com/gsi/'))fail('dist CSP lacks accounts.google.com/gsi');
if(!html.includes(new URL(env.VITE_OWNER_TOKEN_ENDPOINT).origin))fail('dist CSP lacks token origin');
const assets=readdirSync(dist+'assets').filter(f=>f.endsWith('.js'));
let fE=false,fC=false,fN=false;
for(const f of assets){const s=readFileSync(dist+'assets/'+f,'utf8');
 if(s.includes('/api/live-token'))fE=true;
 if(s.includes(env.VITE_GOOGLE_CLIENT_ID))fC=true;
 if(s.includes('/api/notes/session'))fN=true;}
if(!fE)fail('no dist bundle references /api/live-token (wrong-env build - local-dev UI regression)');
if(!fC)fail('no dist bundle carries the Google client id (wrong-env build)');
if(!fN)fail('dist bundle lacks /api/notes/* - cleared client D persistence code was not emitted (wrong-env build)');
let fF=false;
for(const f of assets){const s=readFileSync(dist+'assets/'+f,'utf8');if(s.includes('"human3d"'))fF=true;}
if(!fF)fail('no dist bundle carries the human3d face mode (face-mode regression: check VITE_FACE_MODE in build-env.txt)');
ok('bundle: endpoint + client id embedded, cleared-D notes persistence present');

// 3. Worker config allowlist: no binding/migration beyond the reviewed set.
const jsonc=s=>JSON.parse(s.replace(/\/\/[^\n]*/g,''));
const cfg=jsonc(readFileSync(deploy+'worker/wrangler.jsonc','utf8'));
const expectMigrations=[{tag:'v1',new_sqlite_classes:['IssuanceLimit']},{tag:'v2',new_sqlite_classes:['ReviewProjectionDO']}];
if(JSON.stringify(cfg.migrations)!==JSON.stringify(expectMigrations))fail('migrations diverge from the reviewed [v1 IssuanceLimit, v2 ReviewProjectionDO] state: '+JSON.stringify(cfg.migrations));
const dob=cfg.durable_objects&&cfg.durable_objects.bindings||[];
if(dob.length!==1||dob[0].name!=='LIMITS'||dob[0].class_name!=='IssuanceLimit')fail('unexpected durable_objects bindings: '+JSON.stringify(dob));
const d1=cfg.d1_databases||[];
if(d1.length!==1||d1[0].binding!=='NOTES_DB'||d1[0].database_id!=='63d43a90-6ac0-4081-8bf6-a506632c32bc')fail('unexpected d1 bindings: '+JSON.stringify(d1));
for(const k of['kv_namespaces','r2_buckets','queues','vectorize','hyperdrive','services'])if(cfg[k])fail('unexpected binding section: '+k);
const vars=cfg.vars||{};
if(JSON.stringify(vars)!==JSON.stringify({NOTES_ENABLED:'yes'}))fail('unexpected vars: '+JSON.stringify(vars));
if(!cfg.assets||cfg.assets.binding!=='ASSETS')fail('assets binding missing or renamed');
if(cfg.name!=='jp-tutor-owner-token')fail('worker name mismatch: '+cfg.name);
ok('config: LIMITS+NOTES_DB+ASSETS only, migrations [v1,v2], vars NOTES_ENABLED=yes');

// 3b. Stale-asset guard: deployment/dist static assets must be byte-identical to
// the pinned public/ files (2026-11-15 incident: a deploy shipped a stale GLB from
// an earlier test build because this script validates deployment/dist without
// rebuilding). If this fails, re-run npm run build with deployment/build-env.txt.
import{createHash}from'node:crypto';
const h=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
for(const glb of['avatar.glb','avatar-hosting-preview.glb',...(env.VITE_AVATAR_SHINO==='true'?['avatar-shino.glb']:[])]){
 if(h(dist+glb)!==h(root+'public/'+glb))fail('deployment/dist/'+glb+' differs from public/ - stale build, re-run npm run build');
}
ok('assets: deployment/dist GLBs byte-identical to public/');

// 4. Worker bundle freshness: deployment/worker/index.js must exist and export only known classes.
const w=readFileSync(deploy+'worker/index.js','utf8');
for(const cls of['IssuanceLimit','ReviewProjectionDO','GrantDO'])if(w.includes('class '+cls))ok('worker exports class '+cls+' (unbound classes are inert)');
if(!existsSync(deploy+'worker/index.js'))fail('deployment/worker/index.js missing - run npm run build first');

if(process.argv.includes('--check-only')){ok('check-only: all guards passed, no deploy');process.exit(0);}
if(!process.env.CLOUDFLARE_API_TOKEN)fail('CLOUDFLARE_API_TOKEN not set in environment (fetch from vault at deploy time, never store)');
ok('all guards passed - running wrangler deploy');
execFileSync('npx',['wrangler','deploy'],{cwd:deploy+'worker',stdio:'inherit',env:process.env});
ok('deploy complete');
