// Ephemeral end-of-session notes. Grounded signals only: ASR transcript matches,
// repair-phrase use, turn counts, duration. ASR success is never pronunciation
// evidence; comments carry that uncertainty explicitly.
export function buildSessionNotes({lesson,userText,modelText,seconds}){
 if(!lesson||typeof userText!=='string'||typeof modelText!=='string')throw Error('Invalid notes input');
 const matched=[];
 for(const [key,variants] of Object.entries(lesson.accepted||{})){
  const hit=(variants||[]).find(v=>userText.includes(v));
  if(hit)matched.push({key,hit});
 }
 const repairsUser=(userText.match(/もう一度/g)||[]).length;
 const repairsModel=(modelText.match(/もう一度/g)||[]).length;
 const turns=(userText.match(/\n/g)||[]).length+(userText?1:0);
 const mm=Math.floor(seconds/60),ss=String(seconds%60).padStart(2,'0');
 const comments=[];
 if(matched.length)comments.push(`인식 텍스트에서 목표 표현 ${matched.length}개가 문자 그대로 나타났어요. 텍스트 일치일 뿐, 의미 이해·정확한 사용·발음의 증거는 아니에요.`);
 else if(turns>0)comments.push('이번 세션 인식 텍스트에서는 목표 표현을 확인하지 못했어요. 인식 문제일 수도, 실제로 다른 표현을 말했을 수도 있어요.');
 else comments.push('인식된 발화가 없어요. 마이크 연결이나 주변 소음을 확인해 보세요.');
 const repairsTotal=repairsUser+repairsModel;
 if(repairsTotal)comments.push(`대화 텍스트에 'もう一度'가 ${repairsTotal}회 나타났어요(학습자 발화 ${repairsUser}회·점원/모범 발화 ${repairsModel}회). 단순 등장 횟수이며, 다시 듣기 교정이 성공했다는 증거는 아니에요.`);
 if(turns>=3)comments.push(`발화 ${turns}턴 — 대화를 이어갔어요.`);
 return{lessonId:lesson.id,title:lesson.title,duration:mm+':'+ss,matched,repairsUser,repairsModel,turns,comments};
}

// Saved-history notes version: the history detail RE-CREATES this summary from the
// stored transcript + current lesson content (nothing derived is stored). Bump when
// the notes logic changes; the UI labels reconstructions with it.
export const NOTES_VERSION='notes-v1';
// Card evidence minted at session finish. Grounded signals only: matched variant
// strings ASR heard, raw もう一度 occurrence count, and session completion
// (completion != mastery). One sentence card per practiced lesson; word cards and
// mastery stay design-stage until independently evidenced recall exists.
export function mintSessionEvidence(notes,lesson,endCode){
 if(!notes||!lesson||typeof lesson.id!=='string')return[];
 return[{card_id:lesson.id+':sentence',heard_asr_phrases:(notes.matched||[]).map(m=>m.hit).filter(h=>typeof h==='string').slice(0,50),mo_ichido_count:Math.min(1000,(notes.repairsUser||0)+(notes.repairsModel||0)),completed:endCode==='duration_complete'}];
}

// Reconstruction trust: the notes panel is RE-CREATED from the stored transcript,
// not stored itself. Whether it matches what the learner originally saw depends on
// the notes logic + lesson content versions STORED with the session. Never infer
// sameness from lesson_id alone.
export function reconstructionStatus(stored,current){
 if(!stored||typeof stored.notes_version!=='string'||typeof stored.content_version!=='string')return 'unverifiable';
 return (stored.notes_version===current.notes_version&&stored.content_version===current.content_version)?'same':'changed';
}
