import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{buildSessionNotes}from'../shared/session-notes.mjs';
const{lessons}=JSON.parse(readFileSync('content/lessons.v1.json'));
const l1=lessons.find(l=>l.id==='M1-S1');
test('matched target reported with ASR uncertainty wording',()=>{
 const n=buildSessionNotes({lesson:l1,userText:'持っていません',modelText:'x',seconds:150});
 assert.equal(n.matched.length,1);assert.equal(n.duration,'2:30');
 assert.ok(n.comments[0].includes('의미 이해·정확한 사용·발음의 증거는 아니에요'),'uncertainty wording required');
});
test('no match, no speech, repairs',()=>{
 const n=buildSessionNotes({lesson:l1,userText:'すみません、もう一度お願いします\nわかりません',modelText:'',seconds:61});
 assert.equal(n.matched.length,0);assert.equal(n.repairsUser,1);assert.equal(n.repairsModel,0);assert.equal(n.turns,2);assert.ok(n.comments.some(c=>c.includes('단순 등장 횟수')&&c.includes('학습자 발화 1회')),'repair occurrence label required');
 const n0=buildSessionNotes({lesson:l1,userText:'',modelText:'',seconds:10});
 assert.ok(n0.comments[0].includes('인식된 발화가 없어요'));
});
test('invalid input throws',()=>{assert.throws(()=>buildSessionNotes({}));});

import {mintSessionEvidence} from '../shared/session-notes.mjs';
test('finish evidence carries grounded signals only',()=>{
 const notes={matched:[{key:'hit1',hit:'おつりはとっておきます'},{key:'hit2',hit:'またきます'}],repairsUser:2,repairsModel:1};
 const lesson={id:'M1-S1'};
 assert.deepEqual(mintSessionEvidence(notes,lesson,'duration_complete'),[{card_id:'M1-S1:sentence',heard_asr_phrases:['おつりはとっておきます','またきます'],mo_ichido_count:3,completed:true}]);
});
test('evidence: completed only on duration_complete; caps phrases at 50; null notes yields none',()=>{
 const big={matched:Array.from({length:60},(_,i)=>({hit:'h'+i})),repairsUser:0,repairsModel:0};
 const ev=mintSessionEvidence(big,{id:'M1-S2'},'manual_stop');
 assert.equal(ev[0].heard_asr_phrases.length,50);assert.equal(ev[0].completed,false);
 assert.deepEqual(mintSessionEvidence(null,{id:'M1-S1'},'duration_complete'),[]);
 assert.deepEqual(mintSessionEvidence(big,{},'duration_complete'),[]);
});

import {reconstructionStatus} from '../shared/session-notes.mjs';
test('reconstruction trust: stored versions compared, never inferred',()=>{
 const cur={notes_version:'notes-v1',content_version:'1.3.2'};
 assert.equal(reconstructionStatus({notes_version:'notes-v1',content_version:'1.3.2'},cur),'same');
 assert.equal(reconstructionStatus({notes_version:'notes-v1',content_version:'1.2.0'},cur),'changed');
 assert.equal(reconstructionStatus({notes_version:'notes-v0',content_version:'1.3.2'},cur),'changed');
 assert.equal(reconstructionStatus({},cur),'unverifiable');
 assert.equal(reconstructionStatus(null,cur),'unverifiable');
 assert.equal(reconstructionStatus({notes_version:'notes-v1'},cur),'unverifiable');
});
