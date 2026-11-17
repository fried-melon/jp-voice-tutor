import {usageSummary} from '../shared/live-safety.mjs';
import{parseTurnMarker,diffChars,resolveTurnOutcome}from'../shared/turn-feedback.mjs';import{buildClosingLines}from'../shared/closing-summary.mjs';
import './style.css';
import {createRecallState,requestRecall} from '../shared/recall.mjs';
import {validateNickname} from '../shared/nickname.mjs';
import {mountOwnerLogin,refreshGoogleCredential} from './owner-login';
import {mountOwnerCheck} from './owner-check';
import {bindPressToTalk} from './press-to-talk-control';
import {createPushToTalkSession} from '../shared/voice-mode.mjs';
import{lessonPrompt}from'../shared/live-contract.mjs';import{fetchLiveToken,OwnerTokenError}from'./token-client';
import {Avatar} from './avatar';import {FallbackAudio} from './fallback-audio';import {Microphone,decodePCM} from './audio';import {LiveTutor} from './gemini-live';import {$,status,timeLabel,addTranscript,resetTranscript} from './ui';import{buildSessionNotes,mintSessionEvidence,NOTES_VERSION,reconstructionStatus}from'../shared/session-notes.mjs';import{suggestNextLesson}from'../shared/next-lesson.mjs';import{mintReviewEvent,OUTCOME_LABELS}from'../shared/review-events.mjs';import{notesApiEndpoint,retryRetained,pushDead,createSessionCapture,persistSession,flushQueue,loadQueue,loadDead,clearQueue,clearDead,resolveScope,listSessions,getSession,deleteSession}from'./notes-persist';import type{SessionBundle}from'./notes-persist';
document.body.dataset.faceMode=import.meta.env.VITE_FACE_MODE||'unset'; // deploy-guard marker: survives minification so a wrong-env build is detectable
const tokenServiceEnabled=import.meta.env.VITE_OWNER_TOKEN_SERVICE_ENABLED==='true';const tokenEndpoint=import.meta.env.VITE_OWNER_TOKEN_ENDPOINT as string|undefined;
const notesEndpoint=notesApiEndpoint(tokenServiceEnabled,tokenEndpoint,location.origin);
const googleClientId=import.meta.env.VITE_GOOGLE_CLIENT_ID as string|undefined;
interface LessonIntro{situation:string;goal:string;clerk:string;clerkMeaning:string;example:string;exampleMeaning:string;hint1:string;closing:string;}
interface Lesson{id:string;title:string;canDo:string;question:string;meaning:string;target:string;targetMeaning:string;accepted:Record<string,string[]>;boundaries:string[];reading:string[];intro?:LessonIntro;sequence?:string[];studentStarts?:boolean;sceneCue?:string;}
interface Expression{id:number;scenario:string;ja:string;ko:string;level:number;last_asked:string;accuracy:string|number;}
document.querySelector('#app')!.innerHTML=`
<header><a class="brand" href="./">小さな日本語 <span>작은 일본어</span></a><span class="pill" id="scene-pill">MODULE 1 · 편의점</span></header>
<main><section class="intro"><p class="eyebrow">한 번에 한 문장, 부담 없이</p><h1 id="scene-title">편의점에서 <br>말문을 열어볼까요?</h1><p>점원의 질문 하나에 답해보세요.<br>막히면 한국어로 물어봐도 괜찮아요.</p></section>
<section class="practice" aria-label="일본어 음성 연습"><div class="stage"><div class="stage-top"><span id="scene-place"><i></i> 일본 편의점</span><time id="timer">00:00</time></div><div id="avatar" aria-label="가상 점원 캐릭터"></div><div class="stage-bottom"><span id="avatar-state">점원을 불러오고 있어요…</span><strong id="scene-ja">いらっしゃいませ</strong><small>천천히, 편하게 시작해요</small></div></div>
<div class="controls"><div class="status-line"><span class="dot"></span><p id="status" role="status" aria-live="polite">아바타 준비 중</p></div>
<label for="lesson">연습할 상황</label><select id="lesson" aria-label="단일 연습 선택"></select><p class="privacy" id="next-lesson-suggestion" hidden></p><div class="lesson-card" id="lesson-card" aria-live="polite"></div><label for="duration">오늘 연습 시간 (언제든 종료 가능)</label><select id="duration"><option value="120">2분 · 가볍게</option><option value="180">3분</option><option value="240" selected>4분 · 기본</option></select><p id="start-requirement" class="privacy" aria-live="polite">Google 로그인 후 본인 확인이 끝나고, 음성 연습이 열려 있으면 시작할 수 있어요. 음성 연습은 테스트 시간에만 열려요.</p><div class="actions"><button id="start" disabled>연습 시작 <span>↗</span></button><button id="stop" class="secondary" disabled>종료</button><button id="extend" class="secondary" hidden>2분 더 (최대 5분)</button></div>
<button id="ptt" type="button" class="secondary" hidden disabled>누르고 말하기 (놓으면 전송)</button><div class="recall" id="recall" hidden><p>같은 시간 안에서 복습 1턴 (선택)</p><button id="recall-word" class="secondary">단어 뜻 떠올리기</button><button id="recall-sentence" class="secondary">문장 떠올리기</button><small id="recall-note">새 코스·추가 시간 없이 1번만. 점수·일정은 저장하지 않아요.</small></div><p id="notice" class="notice" role="alert" hidden></p><p id="session-end" class="privacy" role="status" hidden></p><p class="help">연습 시작을 누르면 브라우저가 마이크 권한을 물어봐요. 허용해야 대화할 수 있어요 · 이어폰 권장 (스피커 소리가 마이크에 섞여 점원 말이 내 발화로 기록되는 걸 줄여요)<br>AI 음성과 자막은 Google Gemini가 생성해요.</p>
<div id="owner-login" ${tokenServiceEnabled&&googleClientId?'':'hidden'}></div><div id="manual-credential" ${tokenServiceEnabled&&googleClientId?'hidden':''}><label for="key">${tokenServiceEnabled?'소유자 로그인 증명 (로컬 개발용)':'단명 토큰 (로컬 개발에서만 API 키)'}</label><div class="key-row"><input id="key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="로그인 토큰 서버는 아직 미구현"><button id="delete" class="text-button" type="button">키 삭제</button></div>
<label class="check"><input id="remember" type="checkbox" disabled> 이 기기에 저장하지 않음 <span>(키 저장 기능 제거)</span></label></div><label for="voice-mode">음성 방식</label><select id="voice-mode"><option value="continuous" selected>자연스러운 대화 · 기본</option><option value="push-to-talk">버튼으로 한마디씩 · 시험용/미검증</option></select><details class="privacy-details"><summary>안전 · 개인정보 안내</summary><p class="privacy">연습용 가명은 Oliver로 고정돼 있어요. 실제 이름·연락처·민감한 이야기는 말하지 마세요. 무료 API의 입력·응답은 제품 개선이나 사람의 검토에 쓰일 수 있어요.</p><p class="privacy">버튼 방식(한마디씩)은 아직 실제 음성 검증 전이에요. 누르는 동안 말하고 놓으면 답을 기다려요. 로그인·마이크 확인은 동일해요.</p></details>
<p class="privacy" id="storage-note" ${tokenServiceEnabled?'hidden':''}>메모리 전용이에요. 키는 저장하지 않아요. 공개 배포에서는 단명 토큰만 허용해요. 콘솔·네트워크 화면을 공유하지 마세요.</p>
</div></section>
<section class="below"><div><p class="eyebrow">대화 자막 <button id="clear-transcript" class="text-button" type="button" hidden>자막 지우기</button></p><div id="transcript" class="transcript" role="log" aria-label="사용자 발화와 일본어·한국어 응답"><p class="empty">연습을 시작하면 일본어와 한국어 피드백이 여기에 보여요.</p></div><div id="compare" class="compare" hidden></div><p id="usage" class="privacy" aria-live="polite">사용량 정보는 연결 후 여기에 표시돼요. 비용 추정치는 아니에요.</p></div><details id="session-notes" hidden><summary id="session-notes-summary">오늘 세션 노트 (이 화면에만 있어요)</summary><div id="notes-body"></div></details>
<details id="notes-history" hidden><summary>지난 대화 기록</summary><div id="notes-history-body"></div></details><details><summary>모듈 1 · 편의점 기본 표현 <span>8개</span></summary><ul id="expressions"></ul></details></section>
<footer>개인용 실험 · 대화는 Google로 전송됩니다. 키나 대화를 공유하지 마세요.<br>초기 오리지널 캐릭터 · 음량 기반 입 움직임 · TalkingHead (MIT) · ${import.meta.env.VITE_AVATAR_SHINO==='true'?'VRoid Project Shino (CC0)':'MPFB rig (CC0)'} · 일본어 입 모양은 오디오 기반 근사치예요.</footer></main>`;
let recallState=createRecallState();let sessionSince=0;let hintSeen=false;
let ptt:ReturnType<typeof createPushToTalkSession>|undefined;let unbindPTT:(()=>void)|undefined;
let ownerVoiceReady=false;
let clearLogin:(()=>void)|undefined;
const notesPersistEnabled=import.meta.env.VITE_NOTES_PERSIST==='true';const sessionCapture=createSessionCapture();let sessionIdToken='';let sessionStartedIso='';const addCap=(role:string,text:string,append:boolean)=>{addTranscript(role,text,append);if(notesPersistEnabled)sessionCapture.add(role,text,append);};
// Notes identity model (main review): a stored sub is NAMESPACING, not proof.
// Queue read/flush/export/delete and the recovery bar run only while the
// server has verified the current owner THIS page-load (owner-check verified,
// via session cookie or Bearer). verifiedOwnerSub comes from a server-verified
// Bearer only (persisted for later cookie-verified visits); a decoded but
// unverified JWT sub is never accepted. Signed-out or wrong-account: retained
// data stays on the device but is fully hidden and untouched.
let ownerVerified=false;let verifiedOwnerSub='';let unretainedBundle:SessionBundle|null=null;
// Visible recovery route: export JSON or discard, only under verified identity,
// plus a direct export of the CURRENT unsaved bundle when retention just failed
// (that conversation is already on this screen). Never deletes on its own.
function notesRecoveryUi(){
 if(!notesPersistEnabled)return;
 const scope=resolveScope(ownerVerified,verifiedOwnerSub);
 const existing=$('notes-recovery');
 const stored=scope?loadQueue(localStorage,scope).length+loadDead(localStorage,scope).length:0;
 const count=stored+(unretainedBundle?1:0);
 if(count===0){existing?.remove();return;}
 if(existing)existing.remove();
 const bar=document.createElement('div');bar.id='notes-recovery';bar.className='privacy';
 const ex=document.createElement('button');ex.type='button';ex.className='text-button';ex.textContent='기기에 보관된 기록 내보내기';
 ex.addEventListener('click',()=>{const blob=new Blob([JSON.stringify({unsaved_current:unretainedBundle,queued:scope?loadQueue(localStorage,scope):[],unsendable:scope?loadDead(localStorage,scope):[]},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='jp-notes-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),10000);});
 bar.append(document.createTextNode('아직 서버에 저장되지 않은 대화 기록 '+count+'건이 이 기기에 있어요. '),ex);
 if(scope){
  const retry=document.createElement('button');retry.type='button';retry.className='text-button';retry.id='notes-retry-retained';retry.textContent='보관된 기록 서버에 다시 저장';
  retry.addEventListener('click',async()=>{
   if(!ownerVerified||verifiedOwnerSub!==scope)return;
   retry.disabled=true;retry.textContent='기록을 다시 저장하는 중…';
   try{
    const refresh=tokenServiceEnabled&&googleClientId?()=>refreshGoogleCredential(googleClientId):undefined;
    const result=await retryRetained(notesEndpoint,()=>sessionIdToken||key.value,{refresh,storage:localStorage,scope});
    warn('서버 저장 '+result.saved+'건 · 기기에 남은 기록 '+result.remaining+'건. 남은 기록은 내보내기로 백업할 수 있어요.');
    notesRecoveryUi();void refreshNotesHistory();
   }catch{retry.disabled=false;retry.textContent='보관된 기록 서버에 다시 저장';warn('다시 저장하지 못했어요. 기기에 보관된 기록을 내보내기로 백업해 주세요.');}
  });bar.append(retry);
  const del=document.createElement('button');del.type='button';del.className='text-button';del.textContent='보관된 기록 삭제';
  del.addEventListener('click',()=>{clearQueue(localStorage,scope);clearDead(localStorage,scope);unretainedBundle=null;$('notes-recovery')?.remove();warn('이 기기에 보관된 대화 기록을 삭제했어요.');});
  bar.append(del);
 }
 $('session-notes').after(bar);
}
function setNotesSavedLabel(text:string){const sum=$('session-notes-summary');if(sum)sum.textContent='오늘 세션 노트 ('+text+')';}
const END_LABELS:Record<string,string>={manual_stop:'직접 종료',duration_complete:'시간 다 채움',page_hidden:'화면 이탈',startup_timeout:'연결 시간 초과',first_audio_timeout:'첫 응답 없음'};
async function refreshNotesHistory(){
 const box=$('notes-history') as HTMLDetailsElement|null;if(!box)return;const body=$('notes-history-body');
 const scope=notesPersistEnabled?resolveScope(ownerVerified,verifiedOwnerSub):null;
 if(!scope){box.hidden=true;box.open=false;body?.replaceChildren();return;}
 box.hidden=false;if(!body)return;body.textContent='기록을 불러오고 있어요…';
 const refresh=tokenServiceEnabled&&googleClientId?()=>refreshGoogleCredential(googleClientId):undefined;
 const getToken=()=>sessionIdToken||key.value;const deps={refresh,storage:localStorage,scope};
 const list=await listSessions(notesEndpoint,getToken,deps);
 body.replaceChildren();
 const sm=box.querySelector('summary');
 if(list.status!=='ok'){if(sm)sm.textContent=list.status==='auth'?'지난 대화 기록 (Google 다시 확인 필요)':'지난 대화 기록 (불러오지 못했어요 - 열면 다시 시도할 수 있어요)';// collapsed by default; recovery action inside
  const msg=document.createElement('p');
  if(list.status==='auth'){
   msg.textContent='Google 확인이 만료돼 저장된 기록에 접근하지 못했어요. 로그인 상태(본인 확인)와 기록 접근 권한은 별개예요.';
   const reverify=document.createElement('button');reverify.type='button';reverify.className='text-button';reverify.id='notes-reverify';reverify.textContent='Google로 다시 확인하기';
   reverify.addEventListener('click',async()=>{reverify.disabled=true;reverify.textContent='확인 중…';
    const fresh=tokenServiceEnabled&&googleClientId?await refreshGoogleCredential(googleClientId):null;
    if(fresh){key.value=fresh;sessionIdToken=fresh;void refreshNotesHistory();return;}
    status('Google 로그인 화면을 다시 준비하고 있어요…');await fetch(new URL('/api/session-logout',notesEndpoint),{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error'}).catch(()=>{});clearLogin?.();location.reload();
   });
   body.append(msg,reverify);
  }else{
   msg.textContent=list.status==='server'?'서버가 기록 요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.':'네트워크 문제로 기록을 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.';
   const retry=document.createElement('button');retry.type='button';retry.className='text-button';retry.textContent='다시 시도';
   retry.addEventListener('click',()=>void refreshNotesHistory());
   body.append(msg,retry);
  }
  return;
 }
 const sm2=box.querySelector('summary');if(sm2)sm2.textContent='지난 대화 기록';
  if(import.meta.env.VITE_NEXT_LESSON_SUGGESTION==='true'){
  const sp=document.getElementById('next-lesson-suggestion');const sug=suggestNextLesson(list.sessions,lessons);
  if(sp&&sug){sp.hidden=false;sp.textContent='완료 기록 기준 다음 추천(미리보기): '+sug.lesson.title+' — 완료는 숙달이 아니에요. 저장된 완료 기록에서만 계산해요.';}
 }
 if(list.sessions.length===0){body.textContent='아직 서버에 저장된 대화 기록이 없어요.';return;}
 for(const item of list.sessions.slice().reverse()){
  const row=document.createElement('div');row.className='notes-history-row';
  const when=new Date(item.started_at);const whenText=Number.isFinite(when.getTime())?when.toLocaleString('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):item.started_at;
  const lesson=lessons.find(l=>l.id===item.lesson_id);const mins=Math.floor(item.duration_s/60);const secs=item.duration_s%60;
  const title=document.createElement('span');title.textContent=whenText+' · '+(lesson?lesson.title:item.lesson_id)+' · '+(mins>0?mins+'분 ':'')+secs+'초 · '+(END_LABELS[item.end_state]||item.end_state);
  const openBtn=document.createElement('button');openBtn.type='button';openBtn.className='text-button';openBtn.textContent='열기';
  const detail=document.createElement('div');detail.className='notes-history-detail';detail.hidden=true;
  openBtn.addEventListener('click',async()=>{if(!detail.hidden){detail.hidden=true;return;}detail.textContent='불러오는 중…';detail.hidden=false;const data=await getSession(notesEndpoint,getToken,item.session_id,deps);detail.replaceChildren();if(data.status!=='ok'){detail.textContent=data.status==='auth'?'Google 확인이 만료됐어요. 위의 "Google로 다시 확인하기"를 누른 뒤 다시 열어 주세요.':'기록을 불러오지 못했어요. 네트워크를 확인하고 다시 열어 주세요.';return;}if(data.transcript.length===0){detail.textContent='자막 기록이 없어요.';return;}for(const e of data.transcript){const p=document.createElement('p');p.dataset.role=e.role;p.textContent=(e.role==='clerk'?'점원: ':e.role==='learner'?'나: ':'안내: ')+e.text;detail.append(p);}
   const userText=data.transcript.filter(e=>e.role==='learner').map(e=>e.text).join('\n');const modelText=data.transcript.filter(e=>e.role==='clerk').map(e=>e.text).join('\n');
   if(data.snapshot&&data.snapshot.summary&&typeof data.snapshot.summary==='object'){
    const snap=data.snapshot.summary as {title?:string;duration?:string;comments?:string[]};
    const sh=document.createElement('p');sh.className='privacy';sh.textContent='저장된 원래 요약 ('+data.snapshot.notes_version+' · 레슨 '+data.snapshot.content_version+'): 연습 종료 시점 그대로예요';
    const sul=document.createElement('ul');for(const c of snap.comments||[]){const li=document.createElement('li');li.textContent=c;sul.append(li);}
    detail.append(sh,sul);
   }
   const srcLesson=lessons.find(l=>l.id===item.lesson_id);
   if(srcLesson&&(userText||modelText)){
    const n=buildSessionNotes({lesson:srcLesson,userText,modelText,seconds:item.duration_s});
    const stored=data.snapshot?{notes_version:data.snapshot.notes_version,content_version:data.snapshot.content_version}:{notes_version:data.notes_version,content_version:data.content_version};
    const rs=reconstructionStatus(stored,{notes_version:NOTES_VERSION,content_version:lessonsVersion});
    const rsLabel=rs==='same'?'원래 노트 로직·레슨 내용 그대로예요':rs==='changed'?'원래와 노트 로직 또는 레슨 내용이 달라졌어요. 아래는 지금 버전 기준 참고용이에요':'이 기록에는 노트·레슨 버전이 저장돼 있지 않아 원래 요약과 같은지 확인할 수 없어요';
    const nh=document.createElement('p');nh.className='privacy';nh.textContent='다시 만든 요약 ('+NOTES_VERSION+': 저장된 자막 기준 참고용) · '+rsLabel;
    const ul2=document.createElement('ul');for(const c of n.comments){const li=document.createElement('li');li.textContent=c;ul2.append(li);}
    detail.append(nh,ul2);
   }else if(data.transcript.length>0){const nh=document.createElement('p');nh.className='privacy';nh.textContent='레슨 내용이 바뀌어 노트를 다시 만들 수 없어요. 자막은 그대로 보존돼 있어요.';detail.append(nh);}
   if(data.review_events&&data.review_events.length){for(const ev of data.review_events){const rp=document.createElement('p');rp.className='privacy';rp.textContent='복습 이벤트 ('+(ev.kind==='word'?'단어':'문장')+'): '+(OUTCOME_LABELS[ev.outcome as keyof typeof OUTCOME_LABELS]||ev.outcome)+' · 일정·점수 반영 없음';detail.append(rp);}}
   for(const c of data.evidence||[]){
    let heard:string[]=[];try{heard=typeof c.heard_asr_phrases==='string'?JSON.parse(c.heard_asr_phrases):c.heard_asr_phrases||[];}catch{}
 const ep=document.createElement('p');ep.className='privacy';ep.textContent='카드 근거: 인식된 표현 '+heard.length+'개 · もう一度 '+(c.mo_ichido_count||0)+'회'+(c.completed?' · 시간 다 채운 세션':'')+' — 텍스트 일치·횟수일 뿐 이해·사용·발음의 증거는 아니에요.';
    detail.append(ep);
   }});
  const delBtn=document.createElement('button');delBtn.type='button';delBtn.className='text-button';delBtn.textContent='삭제';
  delBtn.addEventListener('click',async()=>{if(!confirm('이 대화의 자막·노트·카드 근거를 서버에서 삭제할까요? 되돌릴 수 없어요.'))return;const del=await deleteSession(notesEndpoint,getToken,item.session_id,deps);if(del==='ok'){warn('저장된 대화 기록을 삭제했어요.');void refreshNotesHistory();}else warn(del==='auth'?'Google 확인이 만료돼 삭제하지 못했어요. "Google로 다시 확인하기" 후 다시 시도해 주세요.':'기록을 삭제하지 못했어요. 다시 시도해 주세요.');});
  row.append(title,openBtn,delBtn);body.append(row,detail);
 }
}

let avatar:Avatar|FallbackAudio=new Avatar();let mic:Microphone|undefined;let live:LiveTutor|undefined;let active=false;let busy=false;let timer:ReturnType<typeof setInterval>|undefined;let run=0;let initializing=false;let abort:AbortController|undefined;let firstOutput:ReturnType<typeof setTimeout>|undefined;let lessonLimit=240;let playback=false;let serverDone=false;let discardOldTurn=false;let ready=false;let prompt='';let expressions:Expression[]=[];let lessons:Lesson[]=[];let lessonsVersion='unknown';let appendOutput=false;let appendInput=false;let modelTurnText='';let userTurnText='';let correctionStreak=0;let applicationInjected=false;let wrapupInjected=false;
const lessonSelect=$<HTMLSelectElement>('lesson');
const key=$<HTMLInputElement>('key'),remember=$<HTMLInputElement>('remember'),start=$<HTMLButtonElement>('start'),stop=$<HTMLButtonElement>('stop');
function refreshStart(){start.disabled=!ready||busy||active||initializing||(tokenServiceEnabled&&!ownerVoiceReady);}
function warn(text:string){$('notice').textContent=text;$('notice').hidden=!text;}
function storageSet(){try{localStorage.removeItem('jp-tutor-key');}catch{}}
// Migrate away from the old persistent-secret option, never restore it.
storageSet();
hintSeen=true; // The opening card always models the example answer; in-session recall is never independent evidence.
function handleFeedbackTurn(text:string){
 const parsed=parseTurnMarker(text);if(!parsed.marker)return;
 // The model's pass marker is never sufficient: verify the ASR transcript against
 // the lesson's accepted atoms first (spec C). An unverified "pass" is a correction.
 const lessonForCheck=lessons.find(l=>l.id===lessonSelect.value);
 const outcome=resolveTurnOutcome({marker:parsed.marker,userText:userTurnText,lesson:lessonForCheck});
 const marker=outcome.marker;const rest=parsed.rest;
 const box=$('transcript');const para=box.lastElementChild as HTMLElement|null;
 if(para?.dataset.role==='model'&&rest!==text){para.textContent=rest;para.dataset.feedback=marker;const badge=document.createElement('span');badge.className='fb-badge fb-'+marker;badge.textContent=marker==='pass'?'통과':marker==='correction'?'교정':'못 들음';para.prepend(badge);}
 const cmp=$('compare');
 if(marker==='unclear'){cmp.hidden=true;return;}
 if(marker==='pass'){correctionStreak=0;
  const lesson=lessons.find(l=>l.id===lessonSelect.value);
  cmp.replaceChildren();const ok=document.createElement('p');ok.className='cmp-pass';ok.textContent='방금 발화가 목표 표현과 문자로 일치했어요.';const t=document.createElement('p');t.className='cmp-line';t.lang='ja';t.textContent='인식된 표현: '+outcome.atom+' · 목표: '+(lesson?.target||'');cmp.append(ok,t);cmp.hidden=false;
  if(!applicationInjected&&lesson){applicationInjected=true;live?.recall('학습자가 오늘 목표를 1회 수행했습니다. 지금부터 응용 단계입니다. 마무리 제안은 아직 하지 말고, 선택된 연습의 accepted 범위 안 표현만 사용하는 검증된 변형 턴을 한 번 진행해 주세요. 그 뒤에는 클라이언트의 정리 문구 주입을 기다려 주세요.');}
  return;}
 correctionStreak++;cmp.hidden=true;
 if(correctionStreak>=2){
  const lesson=lessons.find(l=>l.id===lessonSelect.value);if(!lesson||!userTurnText)return;
  const d=diffChars(userTurnText,lesson.target);
  cmp.replaceChildren();
  const head=document.createElement('p');head.className='cmp-head';head.textContent='비교해서 보여드려요 — 다른 부분만 표시했어요';cmp.append(head);
  for(const [label,segs] of [['내 발화',d.learner],['목표 문장',d.target]] as const){const row=document.createElement('p');row.className='cmp-line';row.lang='ja';const b=document.createElement('span');b.className='k';b.textContent=label+' · ';row.append(b);for(const s of segs){const sp=document.createElement(s.same?'span':'mark');sp.textContent=s.text;row.append(sp);}cmp.append(row);}
  cmp.hidden=false;
 }
}
function updateRecall(){const enabled=active&&serverDone&&!playback&&!recallState.used&&lessonLimit-Math.floor((Date.now()-sessionSince)/1000)>=20;$('recall').hidden=!active;($('recall-word') as HTMLButtonElement).disabled=!enabled||lessonSelect.value!=='M1-S1';($('recall-sentence') as HTMLButtonElement).disabled=!enabled;}
for(const kind of ['word','sentence'] as const)$('recall-'+kind).addEventListener('click',()=>{const lesson=lessons.find(l=>l.id===lessonSelect.value);if(!lesson)return;const r=requestRecall(recallState,lesson,kind,{active,ready:serverDone&&!playback,elapsed:Math.floor((Date.now()-sessionSince)/1000),limit:lessonLimit,hintSeen});if(!r)return;serverDone=false;status('같은 레슨 복습 한 번을 시작해요.');live?.recall(r.message);$('recall-note').textContent='이번 대화의 연습으로만 진행해요. 인식 불확실·중단은 실패로 기록하지 않아요.';updateRecall();});
$('extend').addEventListener('click',()=>{lessonLimit=300;$('extend').hidden=true;warn('직접 선택해 최대 5분에 종료해요. 언제든 종료해도 실패나 밀린 복습은 생기지 않아요.');});
function finish(message='연습을 마쳤어요. 다시 시작할 수 있어요.',preserveOwnerLogin=false,endCode='manual_stop'){
 const elapsed=active&&sessionSince?Math.max(0,Math.floor((Date.now()-sessionSince)/1000)):0;
 if(active||busy){$('session-end').hidden=false;$('session-end').textContent='마지막 연결: ['+endCode+'] '+timeLabel(elapsed)+' · '+message+' 대화 내용과 로그인 정보는 진단에 저장하지 않아요.';}
 let savedNotes=null;
 try{const lesson=lessons.find(l=>l.id===lessonSelect.value);if(lesson&&(active||busy)&&elapsed>0){
  const userText=Array.from($('transcript').querySelectorAll('p[data-role=user]')).map(p=>p.textContent||'').join('\n');
  const modelText=Array.from($('transcript').querySelectorAll('p[data-role=model]')).map(p=>p.textContent||'').join('\n');
  const notes=buildSessionNotes({lesson,userText,modelText,seconds:elapsed});savedNotes=notes;
  const body=$('notes-body');body.replaceChildren();
  const title=document.createElement('strong');title.textContent=notes.title+' · '+notes.duration;body.append(title);
  const ul=document.createElement('ul');for(const c of notes.comments){const li=document.createElement('li');li.textContent=c;ul.append(li);}body.append(ul);
  if(notes.matched.length){const mp=document.createElement('p');mp.lang='ja';mp.textContent='인식된 표현(텍스트 일치): '+notes.matched.map(m=>m.hit).join(' · ');body.append(mp);}
  const box=$('session-notes') as HTMLDetailsElement;box.hidden=false;box.open=true;
 }}catch{/* notes are best-effort */}
 if(notesPersistEnabled&&(active||busy)&&(elapsed>0||sessionCapture.transcript.length>0)&&sessionIdToken){const lesson=lessons.find(l=>l.id===lessonSelect.value);const bundle={session_id:sessionStartedIso+'_'+(lesson?lesson.id:'unknown'),started_at:sessionStartedIso||new Date().toISOString(),duration_s:elapsed,lesson_id:lesson?lesson.id:'unknown',voice_mode:null,end_state:endCode,transcript:sessionCapture.transcript,evidence:mintSessionEvidence(savedNotes,lesson,endCode),notes_version:NOTES_VERSION,content_version:lessonsVersion,notes_snapshot:savedNotes?{notes_version:NOTES_VERSION,content_version:lessonsVersion,summary:savedNotes}:undefined,review_events:mintReviewEvent({recall:recallState.event,lesson,transcript:sessionCapture.transcript,endCode,hintSeen,uuid:crypto.randomUUID()})};const refresh=tokenServiceEnabled&&googleClientId?()=>refreshGoogleCredential(googleClientId):undefined;const scope=resolveScope(ownerVerified,verifiedOwnerSub);const storage=scope?localStorage:undefined;void(async()=>{try{if(scope)await flushQueue(notesEndpoint,()=>sessionIdToken,{refresh,storage,scope});const result=await persistSession(notesEndpoint,()=>sessionIdToken,bundle,{refresh,storage,scope:scope||undefined});if(result==='ok'){unretainedBundle=null;setNotesSavedLabel('서버에 저장됐어요');void refreshNotesHistory();}else if(result==='ok_note_kept'){if(scope)pushDead(localStorage,scope,bundle);unretainedBundle=null;setNotesSavedLabel('대화 기록 저장됨 · 종료 노트는 기기에 보관');warn('대화 내용은 서버에 저장됐지만, 종료 노트 원본이 서버 크기 제한을 넘어 저장되지 않았어요. 전체 원본은 이 기기에 보관했고, 아래 내보내기로 백업할 수 있어요.');void refreshNotesHistory();}else if(result==='queued'){setNotesSavedLabel('이 기기에 보관 중 · 다음에 다시 저장 시도');warn('대화 기록을 지금 저장하지 못해 이 기기에 보관했어요. 다음 연습이 끝날 때 다시 저장을 시도해요.');}else if(result==='rejected'){setNotesSavedLabel('서버 거부 · 이 기기에 보관');warn('서버가 이 대화 기록을 받지 않아 이 기기에 보관했어요. 아래 내보내기로 백업할 수 있어요.');}else{setNotesSavedLabel('저장 안 됨 · 내보내기 필요');unretainedBundle=bundle;warn(scope?'기기 저장 공간이 부족해 이번 대화 기록을 보관하지 못했어요. 아래 내보내기로 지금 바로 백업할 수 있어요.':'로그인이 풀려 이번 대화 기록을 저장하거나 보관할 수 없어요. 아래 내보내기로 지금 바로 백업하거나, 다시 로그인하면 보관된 기록을 되찾을 수 있어요.');}notesRecoveryUi();}catch{setNotesSavedLabel('이 기기에 보관 중 · 다음에 다시 저장 시도');warn('대화 기록을 지금 저장하지 못해 이 기기에 보관했어요. 다음 연습이 끝날 때 다시 저장을 시도해요.');notesRecoveryUi();}})();}

 unbindPTT?.();unbindPTT=undefined;ptt?.stop();ptt=undefined;$('ptt').hidden=true;($('ptt') as HTMLButtonElement).disabled=true;($('voice-mode') as HTMLSelectElement).disabled=false;
 run++;active=false;$('recall').hidden=true;recallState=createRecallState();busy=false;initializing=false;abort?.abort();abort=undefined;clearInterval(timer);clearTimeout(firstOutput);playback=false;serverDone=false;discardOldTurn=false;modelTurnText='';userTurnText='';correctionStreak=0;applicationInjected=false;wrapupInjected=false;$('compare').hidden=true;$('extend').hidden=true;mic?.stop();mic=undefined;const old=live;live=undefined;old?.close();avatar.stop();refreshStart();start.innerHTML='다시 연습 <span>↗</span>';stop.disabled=true;key.disabled=false;remember.disabled=true;lessonSelect.disabled=false;$<HTMLSelectElement>('duration').disabled=false;status(message);
 void preserveOwnerLogin;$('clear-transcript').hidden=$('transcript').children.length===0;
}
$('delete').addEventListener('click',()=>{if(active||busy)finish('키를 삭제하고 연결을 종료했어요.');key.value='';clearLogin?.();remember.checked=false;try{localStorage.removeItem('jp-tutor-key');}catch{}status('메모리와 이 기기에 저장된 키를 삭제했어요.');});
stop.addEventListener('click',()=>finish('연습을 종료했어요.',false,'manual_stop'));
$('clear-transcript').addEventListener('click',()=>{resetTranscript();$('clear-transcript').hidden=true;});
start.addEventListener('click',async()=>{
 if(busy||active||initializing)return;if(tokenServiceEnabled&&!ownerVoiceReady){warn('본인 확인이 끝나고 음성 연습이 열려 있어야 시작할 수 있어요. 아래 본인 확인 상세를 확인해 주세요.');return;}if(!key.value.trim()){warn(tokenServiceEnabled?'Google로 먼저 로그인해 주세요.':'Gemini API 키를 먼저 입력해 주세요. 키는 대화창에 보내지 마세요.');key.focus();return;}
 if(!tokenServiceEnabled&&!['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&!key.value.trim().startsWith('auth_tokens/')){warn('공개 주소에서는 API 키를 사용하지 않아요. 로그인·단명 토큰 서버 구현 전에는 연결할 수 없어요.');key.value='';return;}
 const nickname=validateNickname('Oliver');
 recallState=createRecallState();const id=++run;const controller=new AbortController();abort=controller;const dv=Number($<HTMLSelectElement>('duration').value);lessonLimit=(dv===120||dv===180||dv===240)?dv:240;busy=true;initializing=true;start.disabled=true;stop.disabled=false;key.disabled=true;remember.disabled=true;$<HTMLSelectElement>('duration').disabled=true;lessonSelect.disabled=true;$('session-notes').hidden=true;warn('');status('마이크와 음성 연결을 준비하고 있어요…');storageSet();
 
 const mode=$<HTMLSelectElement>('voice-mode').value;($('voice-mode') as HTMLSelectElement).disabled=true;
 const secret=key.value.trim();const thisMic=new Microphone();const thisLive=new LiveTutor();mic=thisMic;live=thisLive;let connected=false;let startupStage:'audio_prepare'|'owner_token'|'microphone'|'playback'|'websocket'='audio_prepare';
 const deadline=setTimeout(()=>{if(id===run){warn('30초 안에 연결되지 않았어요. 마이크 권한과 네트워크를 확인하고 다시 시작해 주세요.');finish('연결 시간이 초과됐어요.',tokenServiceEnabled,'startup_timeout');}},30000);
 try{
  thisMic.prepare();const audioUnlock=avatar.unlock();void audioUnlock.catch(()=>{});
  startupStage='owner_token';if(tokenServiceEnabled&&!tokenEndpoint)throw Error('Token endpoint not configured');const credential=tokenServiceEnabled?await fetchLiveToken(tokenEndpoint||'',{idToken:secret},lessonSelect.value,controller.signal,fetch,nickname,mode):secret;if(id!==run)return;
  startupStage='microphone';await thisMic.start(data=>{if(id===run&&connected){if(mode==='push-to-talk')ptt?.audio(data);else if(!thisLive.audio(data)){warn('[network/audio_backlog] 음성 전송이 밀려 연결을 멈췄어요. 자동으로 다시 연결하지 않아요.');finish('음성 전송 지연',tokenServiceEnabled,'network_audio_backlog');}}},controller.signal,()=>{if(id===run){warn('[microphone/interrupted] 마이크 또는 오디오가 중단됐어요. 시작을 다시 눌러 주세요.');finish('오디오 중단',tokenServiceEnabled,'microphone_interrupted');}},mode!=='push-to-talk');if(id!==run){thisMic.stop();return;}
  startupStage='playback';await Promise.race([audioUnlock,new Promise((_,reject)=>setTimeout(()=>reject(Error('Audio resume timeout')),3000))]);if(id!==run)return;await avatar.start(()=>{if(id===run){playback=true;status(mode==='push-to-talk'?'점원이 말하고 있어요. 버튼으로 다음 말을 시작할 수 있어요.':'점원이 말하고 있어요. 끼어들어도 괜찮아요.');}},()=>{if(id===run){playback=false;if(serverDone)status('내 차례예요. 일본어로 답해 보세요.');updateRecall();}},()=>{if(id===run){warn('[playback/interrupted] 소리 재생이 중단됐어요. 시작을 다시 눌러 주세요.');finish('재생 중단',tokenServiceEnabled,'playback_interrupted');}},controller.signal);if(id!==run)return;
  startupStage='websocket';await thisLive.connect(credential,lessonPrompt(prompt,lessons.find(l=>l.id===lessonSelect.value),nickname),m=>{
   if(id!==run)return;if(m.goAway){warn('서버가 곧 연결을 종료해요. 연결이 끝나면 시작을 다시 눌러 주세요.');finish('서버 연결 종료 예고',tokenServiceEnabled,'server_goaway');return;}if(m.usageMetadata){$('usage').textContent=usageSummary(m.usageMetadata);}const c=m.serverContent;if(!c)return;
   if(c.interrupted){avatar.interrupt();playback=false;serverDone=false;discardOldTurn=true;appendOutput=false;status('듣고 있어요. 편하게 말해 주세요.');}
   if(!c.interrupted&&!discardOldTurn)for(const part of c.modelTurn?.parts||[]){if(part.inlineData?.data){clearTimeout(firstOutput);serverDone=false;playback=true;avatar.audio(decodePCM(part.inlineData.data));status('점원 음성을 재생하고 있어요…');}}
   if(c.inputTranscription?.text){if(!appendInput)userTurnText='';userTurnText+=c.inputTranscription.text;addCap('user',c.inputTranscription.text,appendInput);appendInput=true;}
   if(c.outputTranscription?.text&&!discardOldTurn){if(!appendOutput)modelTurnText='';modelTurnText+=c.outputTranscription.text;addCap('model',c.outputTranscription.text,appendOutput);appendOutput=true;}
   if(c.turnComplete){discardOldTurn=false;serverDone=true;avatar.endTurn();appendOutput=false;appendInput=false;handleFeedbackTurn(modelTurnText);modelTurnText='';if(!playback)status('내 차례예요. 일본어로 답해 보세요.');updateRecall();}
  },code=>{if(id===run){warn('[websocket/closed'+(code?'/'+code:'')+'] 서버와 음성 연결이 끝났어요. 이 안내만으로 사용 한도 초과라는 뜻은 아니에요. 자동으로 다시 연결하지 않아요.');finish('서버 연결 종료',tokenServiceEnabled,'websocket_closed'+(code?'_'+code:''));}},()=>{if(id===run){warn('[websocket/failed] 음성 연결을 완료하지 못했어요. 로그인은 유지했어요. 시작을 다시 눌러 주세요.');finish('연결 실패',tokenServiceEnabled,'websocket_failed');}},mode);
  if(id!==run){thisLive.close();return;}clearTimeout(deadline);connected=true;busy=false;active=true;$('transcript').replaceChildren();$('clear-transcript').hidden=true;appendOutput=false;appendInput=false;sessionCapture.reset();sessionStartedIso=new Date().toISOString();if(notesPersistEnabled)sessionIdToken=key.value.trim();const activeLesson=lessons.find(l=>l.id===lessonSelect.value);if(activeLesson?.intro)addCap('guide',activeLesson.intro.situation+' 오늘 목표: '+activeLesson.intro.goal+' · 점원: '+activeLesson.intro.clerk+' ('+activeLesson.intro.clerkMeaning+') · 예시: '+activeLesson.intro.example+' ('+activeLesson.intro.exampleMeaning+')',false);status('시작 안내를 기다리고 있어요…');$('extend').textContent=lessonLimit===120?'최대 5분까지 (선택)':lessonLimit===240?'1분 더 (최대 5분)':'2분 더 (최대 5분)';$('extend').hidden=false;firstOutput=setTimeout(()=>{if(id===run){warn('15초 동안 첫 응답이 없어 마이크 전송을 멈췄어요. 다시 시작해 주세요.');finish('첫 응답 시간 초과',tokenServiceEnabled,'first_audio_timeout');}},15000);if(mode==='push-to-talk'){
   ptt=createPushToTalkSession({send:(message:unknown)=>{if(!thisLive.send(message)){warn('[network/audio_backlog] 음성 전송이 밀려 연결을 멈췄어요. 자동으로 다시 연결하지 않아요.');finish('음성 전송 지연',tokenServiceEnabled,'network_audio_backlog');}},interruptPlayback:()=>{avatar.interrupt();playback=false;},flushCapture:()=>thisMic.flush(true)});
   const button=$<HTMLButtonElement>('ptt');button.hidden=false;button.disabled=false;
   unbindPTT=bindPressToTalk(button,{press:async()=>{const started=await ptt?.press();if(started){thisMic.setCaptureActive(true);status('버튼을 누르는 동안 듣고 있어요.');}return Boolean(started);},release:async()=>{await ptt?.release();if(id===run)status('말을 보냈어요. 답을 기다려 주세요.');},failure:()=>{if(id===run){warn('[microphone/flush] 말을 마무리하지 못해 전송을 멈췄어요.');finish('음성 전송 종료',tokenServiceEnabled,'capture_flush_failed');}}});
  }
  thisLive.begin();
  $('timer').textContent='00:00';const since=Date.now();sessionSince=since;updateRecall();timer=setInterval(()=>{const elapsed=Math.floor((Date.now()-since)/1000);$('timer').textContent=timeLabel(elapsed);updateRecall();if(!wrapupInjected&&active&&elapsed>=lessonLimit-30&&elapsed<lessonLimit){wrapupInjected=true;const lesson=lessons.find(l=>l.id===lessonSelect.value);if(lesson){const idx=lessons.indexOf(lesson);const lines=buildClosingLines({lesson,userText:sessionCapture.transcript.filter(t=>t.role==='learner').map(t=>t.text).join('\n'),seconds:elapsed,nextTitle:lessons[idx+1]?.title});live?.recall('연습 시간이 거의 끝났습니다. 지금 정리 단계입니다. 아래 정리 문구를 바꾸지 말고 그대로 읽은 뒤 짧게 마무리해 주세요.\n---\n'+lines.join('\n')+'\n---');}}if(elapsed>=lessonLimit)finish(lessonLimit===120?'2분 연습을 마쳤어요.':lessonLimit===180?'3분 연습을 마쳤어요.':'선택한 최대 5분 연습을 마쳤어요.',false,'duration_complete');},1000);
 }catch(e){if(id===run){
  const tokenError=e instanceof OwnerTokenError;const needsLogin=tokenError&&e.status===401;
  const tokenMessage=tokenError?(e.code==='session_limit'?'시험 연결 횟수 또는 재시도 간격 한도에 도달했어요. 반복 로그인하지 말고 안내를 기다려 주세요.':e.code==='not_configured'?'시험 연결이 잠겨 있어요. 로그아웃할 필요 없이 연결 안내를 기다려 주세요.':needsLogin?'로그인 확인이 만료되었거나 유효하지 않아요. Google 로그인을 다시 확인해 주세요.':e.code==='identity_unavailable'?'Google 본인 확인 서비스에 일시적인 문제가 있어요. 로그인은 유지했어요. 반복 로그인하지 말고 아래 진단 문구를 알려 주세요.':e.code==='provider_failed'||e.code==='unavailable'?'음성 토큰 발급에 문제가 생겼어요. 로그인은 유지했어요. 반복 시도하지 말고 안내를 기다려 주세요.':'연결 요청을 처리하지 못했어요. 로그인은 유지했어요. 안내를 기다려 주세요.')+` [${e.status}/${e.code}${e.reason?'/'+e.reason:''}]`:null;
  warn(tokenMessage||('['+startupStage+'] '+(e instanceof DOMException&&e.name==='NotAllowedError'?'마이크 사용을 허용해 주세요. Safari는 웹사이트 설정에서 마이크를 확인해 주세요.':'음성 시작에 실패했어요. 로그인은 유지했어요. 마이크 권한과 네트워크를 확인한 뒤 안내를 기다려 주세요.')));
  finish('음성을 시작하지 못했어요.',tokenServiceEnabled&&!needsLogin,tokenError?'token_'+e.status+'_'+e.code:'startup_'+startupStage);
 }}finally{clearTimeout(deadline);if(id===run){initializing=false;if(!active)refreshStart();}}
});
window.addEventListener('pagehide',()=>finish('화면을 떠나 연결을 종료했어요.',false,'page_hidden'));document.addEventListener('visibilitychange',()=>{if(document.hidden&&(active||busy))finish('화면을 벗어나 마이크와 연결을 종료했어요.',false,'page_hidden');});
async function init(){try{
 const [p,e,l]=await Promise.all([fetch(new URL('prompts/tutor-ja.md',document.baseURI)),fetch(new URL('content/expressions.json',document.baseURI)),fetch(new URL('content/lessons.v1.json',document.baseURI))]);if(!p.ok||!e.ok||!l.ok)throw Error();prompt=await p.text();expressions=await e.json();const lessonsJson=await l.json();lessons=lessonsJson.lessons;lessonsVersion=typeof lessonsJson.version==='string'?lessonsJson.version:'unknown';for(const lesson of lessons){const option=document.createElement('option');option.value=lesson.id;option.textContent=lesson.title;lessonSelect.append(option);}const SCENES:Record<string,{pill:string;title:string;place:string;ja:string}>={M1:{pill:'MODULE 1 · 편의점',title:'편의점에서 <br>말문을 열어볼까요?',place:'일본 편의점',ja:'いらっしゃいませ'},M2:{pill:'MODULE 2 · 식당',title:'식당에서 <br>주문해 볼까요?',place:'일본 식당',ja:'いらっしゃいませ'},M3:{pill:'MODULE 3 · 역·버스',title:'역에서 <br>길을 물어볼까요?',place:'일본 역',ja:'すみません'},M4:{pill:'MODULE 4 · 호텔',title:'호텔에서 <br>체크인해 볼까요?',place:'일본 호텔',ja:'いらっしゃいませ'}};function updateHint(){const lesson=lessons.find(l=>l.id===lessonSelect.value)!;const sc=SCENES[lesson.id.split('-')[0]];if(sc){$('scene-pill').textContent=sc.pill;$('scene-title').innerHTML=sc.title;$('scene-place').innerHTML='<i></i> '+sc.place;$('scene-ja').textContent=sc.ja;}const box=$('lesson-card');box.replaceChildren();const i=lesson.intro;if(!i)return;const rows:[string,string][]=[['오늘 상황',i.situation],['오늘 목표',i.goal]];if(lesson.studentStarts&&lesson.sceneCue){rows.push(['장면 큐',lesson.sceneCue]);}else{rows.push(['점원의 말',i.clerk+' — '+i.clerkMeaning]);}rows.push(['예시 답',i.example+' — '+i.exampleMeaning]);for(const [k,v] of rows){const p=document.createElement('p');const b=document.createElement('span');b.className='k';b.textContent=k+' · ';p.append(b,document.createTextNode(v));box.append(p);}}lessonSelect.addEventListener('change',updateHint);updateHint();
 for(const e of expressions){const li=document.createElement('li');const ja=document.createElement('strong');ja.lang='ja';ja.textContent=e.ja;const ko=document.createElement('span');ko.textContent=e.ko;li.append(ja,ko);$('expressions').append(li);}
 await avatar.load($('avatar'));ready=true;refreshStart();$('avatar-state').textContent='준비됐어요';status(tokenServiceEnabled?'Google로 로그인한 뒤 연습을 시작해 주세요.':'키를 입력하고 첫 질문을 들어보세요.');
 }catch{
  try{const fb=new FallbackAudio();avatar=fb;await fb.load($('avatar'));fb.mountFace($('avatar'));ready=true;refreshStart();$('avatar-state').textContent='간단한 2D 화면으로 준비됐어요';status(tokenServiceEnabled?'Google로 로그인한 뒤 연습을 시작해 주세요.':'키를 입력하고 첫 질문을 들어보세요.');warn('3D 화면을 쓸 수 없어 이번 기기에서는 간단한 2D 화면으로 진행해요.');}
  catch{status('아바타를 불러오지 못했어요.');warn('네트워크나 WebGL 지원을 확인한 뒤 새로고침해 주세요.');$('avatar-state').textContent='새로고침이 필요해요';}
 }}
if(notesPersistEnabled&&!tokenServiceEnabled){ownerVerified=true;try{verifiedOwnerSub=localStorage.getItem('jp-notes-owner-sub')||'local-dev';}catch{verifiedOwnerSub='local-dev';}void flushQueue(notesEndpoint,()=>sessionIdToken,{storage:localStorage,scope:verifiedOwnerSub}).then(()=>notesRecoveryUi());notesRecoveryUi();void refreshNotesHistory();}
if(tokenServiceEnabled&&googleClientId){
 const diagnostic=mountOwnerCheck($('owner-login').parentElement!,tokenEndpoint||location.href,fetch,state=>{ownerVoiceReady=state==='verified_open';const verified=state==='verified_open'||state==='verified_closed';ownerVerified=verified;if(verified){const parts=key.value.split('.');if(parts.length===3){try{const sub=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/'))).sub;if(typeof sub==='string'&&sub){verifiedOwnerSub=sub;try{localStorage.setItem('jp-notes-owner-sub',sub);}catch{}}}catch{}}if(!verifiedOwnerSub){try{verifiedOwnerSub=localStorage.getItem('jp-notes-owner-sub')||'';}catch{}}if(notesPersistEnabled&&verifiedOwnerSub){void flushQueue(notesEndpoint,()=>sessionIdToken||key.value,{refresh:()=>refreshGoogleCredential(googleClientId),storage:localStorage,scope:verifiedOwnerSub}).then(()=>notesRecoveryUi());notesRecoveryUi();void refreshNotesHistory();}}else{verifiedOwnerSub='';$('notes-recovery')?.remove();void refreshNotesHistory();}$('start-requirement').textContent=state==='verified_open'?'본인 확인이 끝났고 음성 연습이 열려 있어요. 시작은 직접 눌러 주세요.':state==='verified_closed'?'본인 확인은 통과했어요. 음성 연습은 테스트 시간에만 열려요. 지금은 잠겨 있어 시작할 수 없어요.':state==='checking'?'본인 확인 중이에요. 이 점검에서는 마이크를 켜지 않아요.':state==='rejected'||state==='unavailable'?'본인 확인을 완료하지 못했어요. 아래 본인 확인 상세 문구를 확인하고, 반복해서 로그인하지 마세요.':'Google 로그인 후 본인 확인을 통과해야 시작할 수 있어요.';refreshStart();});
 void mountOwnerLogin($('owner-login'),googleClientId,proof=>{
  key.value=proof;diagnostic.setProof(proof);
  if(!proof&&(active||busy))finish('로그인 정보를 지워 연결을 종료했어요.');
  if(proof)void diagnostic.check();
 },{checkEndpoint:tokenEndpoint||location.href,logoutEndpoint:tokenEndpoint||location.href}).then(clear=>{clearLogin=clear;}).catch(()=>{warn('Google 로그인을 불러오지 못했어요. 네트워크를 확인해 주세요.');});
}
void init();
