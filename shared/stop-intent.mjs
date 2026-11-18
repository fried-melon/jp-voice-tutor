// End only on a completed transcription with a direct, whole-turn stop request.
// Quoted phrases, translation questions, partial ASR and negations never stop.
export function isStopRequest(text){
 const s=String(text||'').trim().replace(/[。.!?！？]+$/g,'').trim();
 if(/[「」『』"']|뜻|의미|일본어|뭐라고|어떻게|않|말고|아니/.test(s))return false;
 return /^(?:(?:오늘(?:은)?|이제|지금)\s*)?(?:(?:길\s*찾기|교통|호텔|체크인|일본어)?\s*연습(?:은|을)?\s*)?(?:(?:여기서|여기까지|이만)\s*)?(?:그만(?:할까요|할게요|하고\s*싶어요|해요|하자|해\s*주세요)|마칠게요|끝낼게요|끝내고\s*싶어요|종료해\s*주세요)$/.test(s)||/^(?:今日は)?(?:ここまでにします|終わりにします|やめます|やめましょう)$/.test(s);
}

// Some Live providers omit transcription.finished. A model reply starting is
// also a turn boundary: the server has already finalized the learner's turn.
// This check runs before any output chunk is passed to playback.
export function stopAtReplyBoundary({userText='',newInput='',inputAppending=false,inputFinished=false,hasModelAudio=false,hasModelText=false,turnComplete=false}){
 const candidate=newInput?(inputAppending?userText:'')+newInput:userText;
 return !!(inputFinished||hasModelAudio||hasModelText||turnComplete)&&isStopRequest(candidate);
}
