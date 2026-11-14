// Recall-event minting: real-signal classification, no fabricated independence,
// no failure from ASR absence/technical issues. FAKE data only.
import test from'node:test';import assert from'node:assert/strict';
import{classifyRecallEvent,mintReviewEvent,OUTCOME_LABELS}from'../shared/review-events.mjs';
import{createRecallState,requestRecall}from'../shared/recall.mjs';
const LESSON={id:'M1-S1',target:'持っていません',accepted:{no:['持っていません','ありません'],yes:['はい、あります']}};
const at='2026-01-07T00:01:00.000Z';
const e=(role,text,ts)=>({role,text,ts});

test('no learner utterance after cue -> pending (never failure)',()=>{
 const r=classifyRecallEvent({variants:['ポイントカード'],after:[e('clerk','ポイントカードはお持ちですか','2026-01-07T00:01:05.000Z')],endCode:'duration_complete',hintSeen:true});
 assert.equal(r.outcome,'pending');assert.equal(r.reason,'no-attempt-evidence');
});
test('technical failure before any attempt -> pending',()=>{
 const r=classifyRecallEvent({variants:['ポイントカード'],after:[],endCode:'playback_interrupted',hintSeen:true});
 assert.equal(r.outcome,'pending');assert.equal(r.reason,'technical');
});
test('ASR no-match after attempt -> pending (ambiguity is not failure)',()=>{
 const r=classifyRecallEvent({variants:['持っていません','ありません'],after:[e('learner','えっと','2026-01-07T00:01:05.000Z')],endCode:'duration_complete',hintSeen:true});
 assert.equal(r.outcome,'pending');assert.equal(r.reason,'asr-no-match');
});
test('model revealed the answer before the learner match -> modeled',()=>{
 const r=classifyRecallEvent({variants:['持っていません'],after:[e('clerk','持っていません、と言えます','2026-01-07T00:01:05.000Z'),e('learner','持っていません','2026-01-07T00:01:09.000Z')],endCode:'duration_complete',hintSeen:true});
 assert.equal(r.outcome,'modeled');assert.equal(r.reason,'model-revealed-first');
});
test('もう一度 before the match -> hinted',()=>{
 const r=classifyRecallEvent({variants:['持っていません'],after:[e('learner','もう一度お願いします','2026-01-07T00:01:05.000Z'),e('learner','持っていません','2026-01-07T00:01:12.000Z')],endCode:'duration_complete',hintSeen:false});
 assert.equal(r.outcome,'hinted');assert.equal(r.reason,'repeat-request');
});
test('answer visible on the opening card (hintSeen) -> hinted, never independent',()=>{
 const r=classifyRecallEvent({variants:['持っていません'],after:[e('learner','持っていません','2026-01-07T00:01:08.000Z')],endCode:'duration_complete',hintSeen:true});
 assert.equal(r.outcome,'hinted');assert.equal(r.reason,'answer-visible');
});
test('spontaneous unaided match -> independent outcome, but never schedule-counting',()=>{
 const r=classifyRecallEvent({variants:['持っていません'],after:[e('learner','持っていません','2026-01-07T00:01:08.000Z')],endCode:'duration_complete',hintSeen:false});
 assert.equal(r.outcome,'independent');
});
test('mintReviewEvent: word recall uses the cue word; sentence recall uses accepted variants; always null rating + no schedule count',()=>{
 const state=createRecallState();
 const r=requestRecall(state,LESSON,'word',{active:true,ready:true,elapsed:10,limit:240,hintSeen:true,now:at});
 assert.ok(r);
 const evs=mintReviewEvent({recall:state.event,lesson:LESSON,transcript:[e('clerk','시작','2026-01-07T00:00:00.000Z'),e('learner','ポイントカード','2026-01-07T00:01:08.000Z')],endCode:'duration_complete',hintSeen:true,uuid:'uuid-fake-1'});
 assert.equal(evs.length,1);
 const ev=evs[0];
 assert.equal(ev.event_id,'uuid-fake-1');assert.equal(ev.card_id,'M1-S1:word');assert.equal(ev.kind,'word');
 assert.equal(ev.outcome,'hinted'); // opening card visible
 assert.equal(ev.scheduler_rating,null);assert.equal(ev.counts_for_schedule,false);
 assert.equal(ev.at,at);
 // no recall requested -> no events
 assert.deepEqual(mintReviewEvent({recall:null,lesson:LESSON,transcript:[],endCode:'duration_complete',hintSeen:true,uuid:'x'}),[]);
});
test('sentence recall matches any accepted variant',()=>{
 const evs=mintReviewEvent({recall:{kind:'sentence',at,cueJa:'持っていません'},lesson:LESSON,transcript:[e('learner','いいえ、ありません','2026-01-07T00:01:08.000Z')],endCode:'duration_complete',hintSeen:true,uuid:'u2'});
 assert.equal(evs[0].outcome,'hinted'); // matched ありません via accepted variants
 assert.equal(evs[0].card_id,'M1-S1:sentence');
});
test('labels exist for every storable outcome',()=>{
 for(const o of['pending','modeled','hinted','independent','explicit-easy'])assert.ok(OUTCOME_LABELS[o]);
});
