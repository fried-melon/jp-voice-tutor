import test from'node:test';import assert from'node:assert/strict';import{isStopRequest,stopAtReplyBoundary}from'../shared/stop-intent.mjs';
test('direct completed requests stop without requiring another question',()=>{for(const s of ['오늘은 그만할까요?','길 찾기 연습은 여기서 마칠게요.','교통 연습은 이만 끝내고 싶어요.','오늘 호텔 연습을 그만하고 싶어요.','그만해 주세요','今日はここまでにします。'])assert.equal(isStopRequest(s),true,s);});
test('quotations, help, negation and partial ASR are not stop requests',()=>{for(const s of ['그만','그만하지 말고 계속해요','그만할게요는 일본어로 뭐라고 해요?','「やめます」의 뜻은?','오늘은 그만할까요라는 뜻이에요?','끝나는 시간을 알려 주세요','まだやめません'])assert.equal(isStopRequest(s),false,s);});

test('provider without finished still stops before model audio at reply boundary',()=>{
 assert.equal(stopAtReplyBoundary({newInput:'오늘은 그만할게요.'}),false);
 assert.equal(stopAtReplyBoundary({userText:'오늘은 그만할게요.',hasModelAudio:true}),true);
 assert.equal(stopAtReplyBoundary({userText:'오늘은 그만할게요.',hasModelText:true}),true);
 assert.equal(stopAtReplyBoundary({userText:'오늘은 그만할게요.',turnComplete:true}),true);
 assert.equal(stopAtReplyBoundary({userText:'오늘은 그만할게요라는 뜻이에요?',hasModelAudio:true}),false);
});
