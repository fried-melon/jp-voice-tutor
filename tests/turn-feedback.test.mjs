import test from 'node:test';import assert from 'node:assert/strict';
import{parseTurnMarker,normalizeJa,diffChars,findAcceptedAtom,resolveTurnOutcome}from'../shared/turn-feedback.mjs';

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

// Spec C (no fake mastery): a model-placed pass marker without an ASR-transcript
// match against the lesson's accepted atoms must never count as a pass.
const LESSON={id:'M1-S1',target:'持っていません',accepted:{no:['持っていません','ありません','ないです','いいえ、持っていません','いいえ'],yes:['はい、あります','はい、持っています','はい']}};

test('findAcceptedAtom: exact target and variants match',()=>{
 assert.equal(findAcceptedAtom('持っていません',LESSON),'持っていません');
 assert.equal(findAcceptedAtom('ありません',LESSON),'ありません');
 assert.equal(findAcceptedAtom('いいえ、持っていません',LESSON),'いいえ、持っていません');
});

test('findAcceptedAtom: normalization tolerates punctuation and spaces',()=>{
 assert.equal(findAcceptedAtom('持って いません。',LESSON),'持っていません');
 assert.equal(findAcceptedAtom('はい!',LESSON),'はい'); // short accepted atom
});

test('findAcceptedAtom: wrong utterances do not match',()=>{
 assert.equal(findAcceptedAtom('持っています',LESSON),null); // affirmative slip, not an accepted-no atom
 assert.equal(findAcceptedAtom('못 했습니다',LESSON),null); // Korean failure declaration (reported incident)
 assert.equal(findAcceptedAtom('',LESSON),null);
 assert.equal(findAcceptedAtom('すみません',LESSON),null);
});

test('resolveTurnOutcome: verified pass stays pass, unverified pass downgrades to correction',()=>{
 const ok=resolveTurnOutcome({marker:'pass',userText:'持っていません',lesson:LESSON});
 assert.deepEqual(ok,{marker:'pass',verified:true,atom:'持っていません'});
 const bad=resolveTurnOutcome({marker:'pass',userText:'못 했습니다',lesson:LESSON});
 assert.equal(bad.marker,'correction');assert.equal(bad.verified,false);assert.equal(bad.downgradedFrom,'pass');
 const none=resolveTurnOutcome({marker:'pass',userText:'',lesson:LESSON});
 assert.equal(none.marker,'correction');
 const noLesson=resolveTurnOutcome({marker:'pass',userText:'持っていません',lesson:undefined});
 assert.equal(noLesson.marker,'correction');
});

test('resolveTurnOutcome: non-pass markers pass through untouched',()=>{
 assert.deepEqual(resolveTurnOutcome({marker:'correction',userText:'持っています',lesson:LESSON}),{marker:'correction',verified:false,atom:null});
 assert.deepEqual(resolveTurnOutcome({marker:'unclear',userText:'',lesson:LESSON}),{marker:'unclear',verified:false,atom:null});
});
