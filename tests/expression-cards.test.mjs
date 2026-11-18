import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';const cards=JSON.parse(readFileSync('content/expressions.json'));const card=id=>cards.find(x=>x.id===id);
test('bag card says register bag explicitly',()=>assert.ok(card(2).ja.includes('レジ袋')));
test('ambiguous daijoubu card contrasts refusal and acceptance',()=>{for(const s of ['모호','袋はいりません','はい、お願いします'])assert.ok(card(4).ko.includes(s));});
test('response cards include question-answer pairs',()=>{for(const id of [5,6,7])assert.ok(card(id).ja.includes('ですか →')||card(id).ja.includes('ますか →'));assert.ok(card(5).ja.includes('レジ袋'));assert.ok(card(6).ja.includes('現金でお願いします'));assert.ok(card(7).ja.includes('カードでお願いします'));});
test('card identifiers stable, count labels not introduced',()=>{assert.deepEqual(cards.map(x=>x.id),[1,2,3,4,5,6,7,8]);assert.equal(JSON.stringify(cards).includes('枚'),false);});
