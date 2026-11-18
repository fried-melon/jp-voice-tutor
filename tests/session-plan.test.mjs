import test from 'node:test';import assert from 'node:assert/strict';
import {createSessionPlan} from '../shared/session-plan.mjs';
test('all durations reserve free talk; a goal never ends the session',()=>{
 for(const duration of [120,180,240,300]){const p=createSessionPlan(duration);p.goal();assert.equal(p.tick(10,{ready:true}),null);assert.equal(p.tick(duration*.5,{ready:true}),'free-talk');assert.equal(p.tick(duration-20,{ready:true}),'wrapup');}
});
test('phase does not change until playback idle; late free talk is not swallowed by closing',()=>{
 const p=createSessionPlan(120);assert.equal(p.tick(70,{ready:false}),null);assert.equal(p.phase,'scene');assert.equal(p.tick(100,{ready:true}),'free-talk');assert.equal(p.tick(101,{ready:true}),null);assert.equal(p.tick(119,{ready:true}),null);assert.equal(p.tick(120,{ready:true}),null);
});
test('four learner turns and a target allow early free talk, not premature close',()=>{
 const p=createSessionPlan();p.goal();for(let i=0;i<3;i++)p.learnerTurn();assert.equal(p.tick(35,{ready:true}),null);p.learnerTurn();assert.equal(p.tick(40,{ready:true}),'free-talk');assert.equal(p.tick(41,{ready:true}),null);assert.ok(p.instruction('free-talk').includes('단일 목표 표현 제한은 이 단계에 적용하지 않습니다'));
});
test('extension moves wrapup without resetting free talk or scene progress',()=>{const p=createSessionPlan(120);p.tick(60,{ready:true});p.extend(300);assert.equal(p.tick(100,{ready:true}),null);assert.equal(p.tick(280,{ready:true}),'wrapup');});
