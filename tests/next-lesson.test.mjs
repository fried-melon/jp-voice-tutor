import test from'node:test';import assert from'node:assert/strict';
import{suggestNextLesson}from'../shared/next-lesson.mjs';
const L=[{id:'M1-S1',title:'a'},{id:'M1-S2',title:'b'},{id:'M1-S3',title:'c'}];
test('suggests first lesson when nothing completed',()=>{assert.deepEqual(suggestNextLesson([],L).lesson.id,'M1-S1');});
test('suggests the lesson after the latest completed one, from actual metadata',()=>{
 const s=[{lesson_id:'M1-S1',end_state:'duration_complete',started_at:'2026-11-02T10:00:00Z'},{lesson_id:'M1-S2',end_state:'manual_stop',started_at:'2026-11-02T11:00:00Z'}];
 const r=suggestNextLesson(s,L);assert.equal(r.lesson.id,'M1-S2');assert.equal(r.basis,'after_completed:M1-S1');});
test('stays on last lesson when all completed; unknown lesson falls back to first',()=>{
 assert.equal(suggestNextLesson([{lesson_id:'M1-S3',end_state:'duration_complete',started_at:'2026-11-02T10:00:00Z'}],L).basis,'last_lesson_completed');
 assert.equal(suggestNextLesson([{lesson_id:'OLD-9',end_state:'duration_complete',started_at:'2026-11-02T10:00:00Z'}],L).basis,'completed_lesson_not_in_current_content');});
