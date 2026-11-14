// Synthetic client capture/persist tests. FAKE data only, injected fetcher/storage.
import test from'node:test';import assert from'node:assert/strict';
import{createSessionCapture,persistSession,flushQueue,loadQueue,loadDead,MAX_ENTRY_CHARS}from'../src/notes-persist.ts';
const okResponse=()=>new Response('{}',{status:200});
const fakeStorage=()=>{const m=new Map();return{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),_map:m};};
const bundle=id=>({session_id:id,started_at:'2026-01-07T00:00:00Z',duration_s:60,lesson_id:'fake',voice_mode:null,end_state:'completed',transcript:[{role:'clerk',text:'fake',ts:'2026-01-07T00:00:01Z'}],evidence:[]});
const noSleep=()=>Promise.resolve();

test('streaming merge: same-role appends merge, role boundaries always start a new entry',()=>{
 const c=createSessionCapture();
 c.add('user','안녕',false);c.add('user','하세요',true); // one learner entry
 c.add('model','いらっしゃいませ',false);c.add('model','。',true); // one clerk entry
 c.add('user','다음턴',true); // role boundary: new entry even with append=true
 c.add('guide','안내',false);
 assert.deepEqual(c.transcript.map(e=>e.role),['learner','clerk','learner','guide']);
 assert.equal(c.transcript[0].text,'안녕하세요');
 assert.equal(c.transcript[1].text,'いらっしゃいませ。');
 assert.equal(c.transcript[2].text,'다음턴');
});

test('overflow: a turn longer than MAX_ENTRY_CHARS spills into continuation entries with zero loss',()=>{
 const c=createSessionCapture();
 const big='가'.repeat(MAX_ENTRY_CHARS)+'나'.repeat(2500);
 c.add('model',big,false);
 assert.equal(c.transcript.length,2);
 assert.equal(c.transcript[0].text.length,MAX_ENTRY_CHARS);
 assert.equal(c.transcript.map(e=>e.text).join(''),big); // full text preserved
 // streaming append that crosses the boundary also spills, never clips
 c.reset();
 c.add('user','x'.repeat(MAX_ENTRY_CHARS-10),false);
 c.add('user','y'.repeat(50),true);
 assert.equal(c.transcript.length,2);
 assert.equal(c.transcript.map(e=>e.text).join(''),'x'.repeat(MAX_ENTRY_CHARS-10)+'y'.repeat(50));
});

test('transient network failure retried with backoff until ok',async()=>{
 let calls=0;
 const fetcher=async()=>{calls++;if(calls<3)throw Error('network down');return okResponse();};
 const r=await persistSession('https://w.test',()=>'tok',bundle('s1'),{fetcher,sleep:noSleep});
 assert.equal(r,'ok');assert.equal(calls,3);
});

test('401 triggers one silent refresh and retries with the fresh token',async()=>{
 const seen=[];
 const fetcher=async(_url,init)=>{seen.push(init.headers.Authorization);return seen.length===1?new Response('{}',{status:401}):okResponse();};
 const r=await persistSession('https://w.test',()=>'stale-token',bundle('s2'),{fetcher,sleep:noSleep,refresh:async()=>'fresh-token'});
 assert.equal(r,'ok');
 assert.deepEqual(seen,['Bearer stale-token','Bearer fresh-token']);
});

test('401 with unavailable refresh does not hammer: queued, visible to caller',async()=>{
 let calls=0;
 const fetcher=async()=>{calls++;return new Response('{}',{status:401});};
 const storage=fakeStorage();
 const r=await persistSession('https://w.test',()=>'tok',bundle('s3'),{fetcher,sleep:noSleep,refresh:async()=>null,storage,scope:'owner'});
 assert.equal(r,'queued');
 assert.equal(calls,1); // refresh unavailable -> no fresh-token retry; 401 is permanent so the backoff loop breaks immediately
 assert.equal(loadQueue(storage,'owner').length,1);
});

test('whole-session retry is idempotent at the client: same session_id queued once; flush clears in order',async()=>{
 const storage=fakeStorage();
 const fail=async()=>{throw Error('down');};
 await persistSession('https://w.test',()=>'t',bundle('same'),{fetcher:fail,sleep:noSleep,storage,scope:'owner'});
 await persistSession('https://w.test',()=>'t',bundle('same'),{fetcher:fail,sleep:noSleep,storage,scope:'owner'});
 assert.equal(loadQueue(storage,'owner').length,1);
 const posted=[];
 const good=async(_u,init)=>{posted.push(JSON.parse(init.body).session_id);return okResponse();};
 const flushed=await flushQueue('https://w.test',()=>'t',{fetcher:good,sleep:noSleep,storage,scope:'owner'});
 assert.equal(flushed,1);
 assert.equal(loadQueue(storage,'owner').length,0);
 const r=await persistSession('https://w.test',()=>'t',bundle('next'),{fetcher:good,sleep:noSleep,storage,scope:'owner'});
 assert.equal(r,'ok');
 assert.deepEqual(posted,['same','next']);
});

test('NO eviction: a 4th and 5th failed session are all retained',async()=>{
 const storage=fakeStorage();
 const fail=async()=>{throw Error('down');};
 for(const id of['a','b','c','d','e'])await persistSession('https://w.test',()=>'t',bundle(id),{fetcher:fail,sleep:noSleep,storage,scope:'owner'});
 assert.deepEqual(loadQueue(storage,'owner').map(b=>b.session_id),['a','b','c','d','e']);
});

test('account scoping: a different identity cannot read or flush the owner queue',async()=>{
 const storage=fakeStorage();
 const fail=async()=>{throw Error('down');};
 await persistSession('https://w.test',()=>'t',bundle('owner-session'),{fetcher:fail,sleep:noSleep,storage,scope:'owner'});
 assert.equal(loadQueue(storage,'intruder').length,0); // different scope sees nothing
 const posted=[];
 const good=async(_u,init)=>{posted.push(JSON.parse(init.body).session_id);return okResponse();};
 const flushed=await flushQueue('https://w.test',()=>'t',{fetcher:good,sleep:noSleep,storage,scope:'intruder'});
 assert.equal(flushed,0);assert.deepEqual(posted,[]);
 assert.equal(loadQueue(storage,'owner').length,1); // untouched
});

test('permanent 413 -> rejected into dead list, never auto-retried; flush skips dead but still drains queue',async()=>{
 const storage=fakeStorage();
 let calls=0;
 const oversize=async()=>{calls++;return new Response('{}',{status:413});};
 const r=await persistSession('https://w.test',()=>'t',bundle('huge'),{fetcher:oversize,sleep:noSleep,storage,scope:'owner'});
 assert.equal(r,'rejected');
 assert.equal(calls,1); // permanent refusal: no retries at all
 assert.equal(loadDead(storage,'owner').length,1);
 assert.equal(loadQueue(storage,'owner').length,0);
 const good=async()=>okResponse();
 await flushQueue('https://w.test',()=>'t',{fetcher:good,sleep:noSleep,storage,scope:'owner'});
 assert.equal(calls,1); // flush did not retry the dead bundle
 assert.equal(loadDead(storage,'owner').length,1); // kept for export
});

test('device storage full -> failed (nothing silently retained); caller shows the strongest notice',async()=>{
 const fullStorage={getItem:()=>null,setItem:()=>{throw Error('QuotaExceededError');},removeItem:()=>{}};
 const fail=async()=>{throw Error('down');};
 const r=await persistSession('https://w.test',()=>'t',bundle('x'),{fetcher:fail,sleep:noSleep,storage:fullStorage,scope:'owner'});
 assert.equal(r,'failed');
});

test('resolveScope: only a server-verified owner sub unlocks queue access',async()=>{
 const{resolveScope}=await import('../src/notes-persist.ts');
 assert.equal(resolveScope(true,'owner-sub'),'owner-sub');
 assert.equal(resolveScope(false,'owner-sub'),null); // signed out: hidden
 assert.equal(resolveScope(false,'attacker-sub'),null); // wrong account: hidden
 assert.equal(resolveScope(true,''),null); // verified cookie but no known sub: no scope
});

test("server 200 with snapshot_rejected -> 'ok_note_kept' (note stays on-device, no queue/dead write by persistSession)",async()=>{
 const fetcher=async()=>new Response(JSON.stringify({recorded:true,snapshot_rejected:'invalid_notes_snapshot'}),{status:200});
 const storage=fakeStorage();
 const r=await persistSession('https://w.test',()=>'tok',bundle('s-note'),{fetcher,sleep:noSleep,storage,scope:'sub1'});
 assert.equal(r,'ok_note_kept');
 assert.equal(loadQueue(storage,'sub1').length,0);assert.equal(loadDead(storage,'sub1').length,0); // caller retains the note (main.ts pushDead)
});
test('plain 200 still returns ok',async()=>{
 const fetcher=async()=>new Response(JSON.stringify({recorded:true,snapshot:'recorded'}),{status:200});
 const r=await persistSession('https://w.test',()=>'tok',bundle('s-ok'),{fetcher,sleep:noSleep});
 assert.equal(r,'ok');
});
