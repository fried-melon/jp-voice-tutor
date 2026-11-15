import test from 'node:test';import assert from 'node:assert/strict';
import{parseTurnMarker,normalizeJa,diffChars}from'../shared/turn-feedback.mjs';

test('parses the three turn markers and strips them from the rest',()=>{
 assert.deepEqual(parseTurnMarker('【통과】 방금 말한 게 같아요.'),{marker:'pass',rest:'방금 말한 게 같아요.'});
 assert.deepEqual(parseTurnMarker('【교정】 한 번 더 해 볼까요?'),{marker:'correction',rest:'한 번 더 해 볼까요?'});
 assert.deepEqual(parseTurnMarker('【못들음】 인식이 안 됐어요.'),{marker:'unclear',rest:'인식이 안 됐어요.'});
});
test('no marker returns null marker with original text',()=>{
 assert.equal(parseTurnMarker('かしこまりました。').marker,null);
 assert.equal(parseTurnMarker('  【통과】 잘했어요').marker,'pass');
 assert.equal(parseTurnMarker('본문 【통과】 중간 마커는 신호가 아님').marker,null);
});
test('normalizeJa strips punctuation and whitespace for matching',()=>{
 assert.equal(normalizeJa('持っていません。'),'持っていません');
 assert.equal(normalizeJa('「いいえ、 持っていません」'),'いいえ持っていません');
});
test('diffChars marks only the differing characters',()=>{
 const d=diffChars('持っていません','持っています');
 assert.equal(d.learner.filter(s=>s.same).map(s=>s.text).join(''),'持っていま');
 assert.ok(d.learner.some(s=>!s.same&&s.text.includes('せん')));
 assert.ok(d.target.some(s=>!s.same&&s.text.includes('す')));
});
test('diffChars identical strings are all same',()=>{
 const d=diffChars('持っていません','持っていません');
 assert.ok(d.learner.every(s=>s.same)&&d.target.every(s=>s.same));
});
test('diffChars tolerates whitespace differences',()=>{
 const d=diffChars('いいえ、 持っていません','いいえ、持っていません');
 assert.ok(d.learner.every(s=>s.same)&&d.target.every(s=>s.same));
});
