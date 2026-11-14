// Bound queued realtime speech. 64KiB is about 1.5s of base64 PCM16/16kHz.
// Stop rather than replay stale speech, retain audio, or reconnect automatically.
export const MAX_AUDIO_BACKLOG_BYTES=64*1024;
export function audioBacklogged(bufferedAmount){return Number.isFinite(bufferedAmount)&&bufferedAmount>MAX_AUDIO_BACKLOG_BYTES;}
export function usageSummary(metadata){
 const fields=[['promptTokenCount','입력'],['responseTokenCount','응답'],['totalTokenCount','합계']];
 const items=fields.flatMap(([key,label])=>{const n=metadata?.[key];return Number.isSafeInteger(n)&&n>=0?[label+' '+n.toLocaleString('ko-KR')]:[];});
 return items.length?'서버 토큰: '+items.join(' · ')+' (비용 추정치 아님)':'서버 사용량을 받았어요. 비용 추정치는 아니에요.';
}
