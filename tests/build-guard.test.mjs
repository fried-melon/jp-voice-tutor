import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{execFileSync}from'node:child_process';

function runGuard(env){try{execFileSync('node',['scripts/assert-build-env.mjs'],{env:{PATH:process.env.PATH,...env},stdio:'pipe'});return 0;}catch(e){return e.status??1;}}

test('npm build chains the fail-closed env guard and the post-build bundle check',()=>{
 const pkg=JSON.parse(readFileSync('package.json','utf8'));
 assert.ok(pkg.scripts.build.startsWith('node scripts/assert-build-env.mjs &&'),pkg.scripts.build);
 assert.ok(pkg.scripts.build.includes('vite build && node scripts/verify-production-bundle.mjs'),pkg.scripts.build);
});

test('build guard fails closed without owner-token env and passes with it',()=>{
 assert.notEqual(runGuard({}),0,'no env must fail');
 assert.notEqual(runGuard({VITE_OWNER_TOKEN_SERVICE_ENABLED:'true'}),0,'missing endpoint must fail');
 assert.notEqual(runGuard({VITE_OWNER_TOKEN_SERVICE_ENABLED:'true',VITE_OWNER_TOKEN_ENDPOINT:'http://insecure.example.com/api/live-token',VITE_GOOGLE_CLIENT_ID:'x'}),0,'http endpoint outside localhost must fail');
 assert.notEqual(runGuard({VITE_OWNER_TOKEN_SERVICE_ENABLED:'true',VITE_OWNER_TOKEN_ENDPOINT:'https://example.com/api/live-token'}),0,'missing client id must fail');
 assert.notEqual(runGuard({VITE_OWNER_TOKEN_SERVICE_ENABLED:'true',VITE_OWNER_TOKEN_ENDPOINT:'https://jp-tutor-owner-token.leejeongjin7178.workers.dev/api/live-token',VITE_GOOGLE_CLIENT_ID:'410292686280-79kcfl4b1bcvb9okkl2ptjmh77qksm5v.apps.googleusercontent.com'}),0,'missing VITE_FACE_MODE must fail (face-mode regression guard)');
 assert.notEqual(runGuard({VITE_OWNER_TOKEN_SERVICE_ENABLED:'true',VITE_OWNER_TOKEN_ENDPOINT:'https://jp-tutor-owner-token.leejeongjin7178.workers.dev/api/live-token',VITE_GOOGLE_CLIENT_ID:'410292686280-79kcfl4b1bcvb9okkl2ptjmh77qksm5v.apps.googleusercontent.com',VITE_FACE_MODE:'2d'}),0,'non-human3d face mode must fail');
 assert.equal(runGuard({VITE_OWNER_TOKEN_SERVICE_ENABLED:'true',VITE_OWNER_TOKEN_ENDPOINT:'https://jp-tutor-owner-token.leejeongjin7178.workers.dev/api/live-token',VITE_GOOGLE_CLIENT_ID:'410292686280-79kcfl4b1bcvb9okkl2ptjmh77qksm5v.apps.googleusercontent.com',VITE_FACE_MODE:'human3d'}),0,'full env passes');
});
