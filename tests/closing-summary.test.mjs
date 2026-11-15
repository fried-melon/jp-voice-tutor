import test from 'node:test';import assert from 'node:assert/strict';
import{buildClosingLines}from'../shared/closing-summary.mjs';

const lesson={id:'M1-S1',title:'포인트 카드',canDo:'포인트 카드 소지 질문에 답하기',target:'持っていません',accepted:{no:['持っていません','ありません'],yes:['はい、あります']}};

test('closing lines state matched expressions, time and next lesson as facts',()=>{
 const lines=buildClosingLines({lesson,userText:'持っていません。 잘 모르겠어요',seconds:190,nextTitle:'봉투'});
 assert.ok(lines[0].includes('포인트 카드'));
 assert.ok(lines[1].includes('持っていません'));
 assert.ok(lines[2].includes('3분 10초'));
 assert.ok(lines[3].includes('봉투'));
});
test('no matched expression says so without judgment words',()=>{
 const lines=buildClosingLines({lesson,userText:'뭐라고 해요?',seconds:60,nextTitle:'봉투'});
 assert.ok(lines[1].includes('이어지지 않았어요'));
 for(const w of ['틀렸','실패','못했'])assert.ok(!lines.join('').includes(w),w);
});
test('last lesson closing omits a next title',()=>{
 const lines=buildClosingLines({lesson,userText:'持っていません',seconds:30,nextTitle:undefined});
 assert.ok(lines[3].includes('다 해 봤어요'));
});
