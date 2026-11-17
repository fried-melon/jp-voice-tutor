import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {notesApiEndpoint,retryRetained,loadDead,loadQueue} from '../src/notes-persist.ts';
const worker='https://owner.example.test/api/live-token';
const scope='fake-owner';
const bundle=id=>({session_id:id,started_at:'2026-11-17T12:00:00Z',duration_s:60,lesson_id:'fake',voice_mode:null,end_state:'manual_stop',transcript:[],evidence:[]});
function storage(){const m=new Map();return{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
test('Pages notes resolve to configured owner API, local harness stays local, missing production endpoint fails closed',()=>{
 assert.equal(notesApiEndpoint(true,worker,'https://pages.example.test'),'https://owner.example.test');
 assert.equal(notesApiEndpoint(false,undefined,'http://localhost:4336'),'http://localhost:4336');
 assert.throws(()=>notesApiEndpoint(true,undefined,'https://pages.example.test'));
});
test('all app notes calls use resolved API, never Pages origin',()=>{
 const s=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
 for(const fn of ['listSessions','getSession','deleteSession','persistSession','flushQueue']){
  assert.equal(s.includes(fn+'(location.origin,'),false,fn);
  assert.ok(s.includes(fn+'(notesEndpoint,'),fn);
 }
});
test('explicit retry recovers dead and queued copies once, preserves failures and foreign scope',async()=>{
 const s=storage();
 s.setItem('jp-notes-queue-v1:'+scope,JSON.stringify([bundle('same'),bundle('network')]));
 s.setItem('jp-notes-dead-v1:'+scope,JSON.stringify([bundle('same'),bundle('invalid')]));
 s.setItem('jp-notes-dead-v1:foreign',JSON.stringify([bundle('private')]));
 const calls=[];
 const result=await retryRetained(notesApiEndpoint(true,worker,'https://pages.example.test'),()=> 'fake-token',{storage:s,scope,sleep:async()=>{},fetcher:async(url,init)=>{
  const id=JSON.parse(init.body).session_id;calls.push([url,id]);
  if(id==='network')throw Error('synthetic network');
  return new Response('{}',{status:id==='invalid'?400:200});
 }});
 assert.deepEqual(result,{saved:1,remaining:2});
 assert.equal(calls.filter(c=>c[1]==='same').length,1);
 assert.ok(calls.every(c=>c[0]==='https://owner.example.test/api/notes/session'));
 assert.deepEqual(loadQueue(s,scope).map(b=>b.session_id),['network']);
 assert.deepEqual(loadDead(s,scope).map(b=>b.session_id),['invalid']);
 assert.equal(loadDead(s,'foreign')[0].session_id,'private');
});
test('snapshot rejected still keeps local original for export; signed-out retry cannot read records',async()=>{
 const s=storage();s.setItem('jp-notes-dead-v1:'+scope,JSON.stringify([bundle('large')]));
 const result=await retryRetained(worker,()=> 'fake-token',{storage:s,scope,fetcher:async()=>new Response('{"snapshot_rejected":"invalid_notes_snapshot"}',{status:200})});
 assert.deepEqual(result,{saved:1,remaining:1});assert.equal(loadDead(s,scope).length,1);
 assert.deepEqual(await retryRetained(worker,()=> 'fake-token',{storage:s}),{saved:0,remaining:0});
});
