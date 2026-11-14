import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import vm from'node:vm';import ts from'typescript';

function loadUi(){
 const src=ts.transpileModule(readFileSync('src/ui.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2020,target:ts.ScriptTarget.ES2020}}).outputText;
 const elements={};
 function el(id){return elements[id]??=( {id,children:[],dataset:{},className:'',textContent:'',scrollTop:0,scrollHeight:0,
  append(c){this.children.push(c);c.parent=this},replaceChildren(){this.children=[]},
  get lastElementChild(){return this.children[this.children.length-1]||null}} );}
 const ctx={document:{getElementById:el,createElement:()=>el('anon'+Math.random())}};
 vm.runInNewContext(src.replace(/export /g,''),ctx);return {ctx,transcript:el('transcript')};
}

test('addTranscript merges same-role chunks and auto-scrolls; resetTranscript restores the empty placeholder',()=>{
 const {ctx,transcript}=loadUi();
 ctx.addTranscript('model','いらっしゃいませ。',false);ctx.addTranscript('model','こんにちは。',true);ctx.addTranscript('user','こんにちは',false);
 assert.equal(transcript.children.length,2);assert.equal(transcript.children[0].dataset.role,'model');assert.equal(transcript.children[0].textContent,'いらっしゃいませ。こんにちは。');assert.equal(transcript.children[1].dataset.role,'user');
 transcript.scrollHeight=500;ctx.addTranscript('model','追加',true);assert.equal(transcript.scrollTop,500);
 ctx.resetTranscript();assert.equal(transcript.children.length,1);assert.equal(transcript.children[0].className,'empty');assert.ok(transcript.children[0].textContent.includes('연습을 시작하면'));
});

test('finish preserves the transcript; clearing happens on explicit clear, new session, or reload only',()=>{
 const src=readFileSync('src/main.ts','utf8');
 const finishBody=src.slice(src.indexOf('function finish('),src.indexOf("stop.addEventListener"));
 assert.ok(!finishBody.includes("$('transcript').replaceChildren()"),'finish() must not clear the transcript');
 assert.ok(finishBody.includes("$('clear-transcript').hidden="),'finish() reveals the explicit clear button when entries remain');
 const startLine=src.split('\n').find(l=>l.includes('connected=true;busy=false;active=true;'));
 assert.ok(startLine.includes("$('transcript').replaceChildren()"),'new session still starts from a cleared transcript');
 assert.ok(startLine.includes("$('clear-transcript').hidden=true"));
 assert.ok(src.includes("resetTranscript();$('clear-transcript').hidden=true;"),'explicit clear button wired');
 assert.ok(src.includes('id="clear-transcript"'),'clear button in the transcript header');
});

test('duration auto-finish routes through finish() with duration_complete',()=>{
 const src=readFileSync('src/main.ts','utf8');
 const timer=src.split('\n').find(l=>l.includes('setInterval(()=>'))
 assert.ok(timer.includes("if(elapsed>=lessonLimit)finish("),'timer checks lessonLimit each tick');
 assert.ok(timer.includes("'duration_complete'"),'auto-finish uses duration_complete end code');
 assert.ok(src.includes("$('clear-transcript')"),'after auto-finish the transcript stays inspectable via the same finish() path');
});
