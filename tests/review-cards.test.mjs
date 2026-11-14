import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{deriveReviewCards}from'../shared/review-cards.mjs';
import{planPreviewRecall}from'../shared/review-queue.mjs';
import{selectDueCards}from'../shared/fsrs-adapter.mjs';
const{lessons}=JSON.parse(readFileSync('content/lessons.v1.json'));
test('derives sentence and word cards from actual content with contract QA gates',()=>{
 const cards=deriveReviewCards(lessons);
 assert.equal(cards.filter(c=>c.kind==='sentence').length,21);
 assert.equal(cards.filter(c=>c.kind==='word').length,38);
 const approved=cards.filter(c=>!c.suspended&&c.qa==='approved');
 assert.equal(approved.filter(c=>c.kind==='word').length,12);
 assert.deepEqual(approved.filter(c=>c.kind==='word').map(c=>c.id)[0],'M1-S1:word:ポイントカード');
 assert.ok(cards.every(c=>c.kind!=='sentence'||!c.suspended));
 assert.ok(cards.find(c=>c.id==='M1-S2:word:袋').suspended);
 assert.ok(cards.find(c=>c.id==='M1-S5:word:クレジットカード').suspended);
 assert.throws(()=>deriveReviewCards([{id:'X'}]),/Invalid lesson schema/);
 assert.ok(!cards.some(c=>c.lessonId==='M1-S6'),'composite session mints no cards');
 assert.ok(!cards.some(c=>c.lessonId==='M2-S12'),'M2 composite mints no cards');
 assert.ok(cards.filter(c=>c.lessonId.startsWith('M2-')&&c.kind==='word').every(c=>!c.suspended&&c.qa==='approved'),'M2 reading cards cleared by allowlist v3');
 assert.ok(cards.filter(c=>(c.lessonId.startsWith('M3-')||c.lessonId.startsWith('M4-'))&&c.kind==='word').every(c=>c.suspended&&c.qa==='pending'),'M3/M4 word cards stay suspended pending curriculum-owner approval');
 assert.ok(!cards.some(c=>c.lessonId==='M3-S18'),'M3 composite mints no cards');
});
test('derived cards flow through the preview planner: suspended cards never surface',()=>{
 const cards=deriveReviewCards(lessons);const day=86400000,now=Date.now();
 const events=[{reviewId:'r0',contract:'cycle1-preview-1',cardId:'M1-S1:sentence',lessonId:'M1-S1',kind:'sentence',at:now-3600000,outcome:'independent',hintUsed:false,independent:true,countsForSchedule:false,mode:'preview-practice'},{reviewId:'r1',contract:'cycle1-preview-1',cardId:'M1-S1:word:ポイントカード',lessonId:'M1-S1',kind:'word',at:now-2*day,outcome:'independent',hintUsed:false,independent:true,countsForSchedule:false,mode:'preview-practice'},{reviewId:'r2',contract:'cycle1-preview-1',cardId:'M1-S2:word:袋',lessonId:'M1-S2',kind:'word',at:now-9*day,outcome:'independent',hintUsed:false,independent:true,countsForSchedule:false,mode:'preview-practice'}];
 assert.deepEqual(planPreviewRecall(cards,events,{now,lessonId:'M1-S1'}).map(x=>x.card.id),['M1-S1:word:ポイントカード']);
 const s2=planPreviewRecall(cards,events,{now,lessonId:'M1-S2'}).map(x=>x.card.id);assert.deepEqual(s2,['M1-S2:sentence']);assert.ok(!s2.includes('M1-S2:word:袋'));
});
test('derived cards flow through the FSRS due selection with the same gates',()=>{
 const cards=deriveReviewCards(lessons);const now=Date.now();
 const due={due:new Date(now-1000),stability:1,difficulty:1,elapsed_days:1,scheduled_days:1,reps:1,lapses:0,state:2,last_review:new Date(now-86400000)};
 const withState=cards.map(c=>({...c,card:structuredClone(due)}));
 assert.deepEqual(selectDueCards(withState,{now,lessonId:'M1-S2'}).map(x=>x.id),['M1-S2:sentence']);
 assert.equal(selectDueCards(withState,{now,lessonId:'M1-S3'}).length,1);
});
