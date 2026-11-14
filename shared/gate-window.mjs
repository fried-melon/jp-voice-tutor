// Two-control voice gate window. A code-enforced bound on how long the gate can stay open.
// BOTH controls are required to open; a timestamp alone NEVER opens the gate:
//   1. API_PRIVACY_CONFIRMED === 'yes'   (the privacy consent flag)
//   2. GATE_OPEN_UNTIL = finite epoch ms with now < cutoff <= now + MAX_GATE_WINDOW_MS
// Any absent/malformed/nonfinite/expired/beyond-max cutoff, any non-'yes' flag, or an
// unavailable clock fails CLOSED. An expired staged cutoff can never reopen the gate:
// reopening requires staging a fresh cutoff (while flag=no) and a fresh flag write.
// Operation order (verified executable 2026-11-03 09:20: single-object PUT per secret;
// PATCH/array-PUT rejected code 10405; writes are individual, NOT atomic across secrets):
//   OPEN:  PUT GATE_OPEN_UNTIL=<now+duration>  (while flag=no: staging alone cannot open)
//          PUT API_PRIVACY_CONFIRMED=yes       (final single write opens the window)
//   CLOSE: PUT API_PRIVACY_CONFIRMED=no FIRST, then PUT GATE_OPEN_UNTIL=0
//   Partial failure at any point leaves the gate closed or closes it on the next check:
//   flag=no alone is closed; flag=yes with missing/stale cutoff is closed.
export const MAX_GATE_WINDOW_MS=30*60*1000; // bounded maximum window
export function evaluateGate({flag,openUntil,now,maxWindowMs=MAX_GATE_WINDOW_MS}){
 if(flag!=='yes')return{open:false,reason:'privacy_flag_not_confirmed'};
 if(!Number.isFinite(now))return{open:false,reason:'clock_unavailable'};
 // Control value accepts only a plain decimal epoch-ms string (no hex/exponent forms).
 const cutoff=typeof openUntil==='string'&&/^\d{10,15}$/.test(openUntil.trim())?Number(openUntil.trim()):NaN;
 if(!Number.isFinite(cutoff))return{open:false,reason:'cutoff_missing_or_malformed'};
 if(cutoff<=now)return{open:false,reason:'cutoff_expired'};
 if(cutoff-now>maxWindowMs)return{open:false,reason:'cutoff_beyond_max_window'};
 return{open:true,reason:'within_approved_window',closesInMs:cutoff-now};
}
/** Stage a window: returns the cutoff string to write, or an error. */
export function planWindowOpen({now,durationMs,maxWindowMs=MAX_GATE_WINDOW_MS}){
 if(!Number.isFinite(now)||!Number.isFinite(durationMs)||durationMs<=0)return{error:'invalid_window'};
 if(durationMs>maxWindowMs)return{error:'window_exceeds_max'};
 return{openUntil:String(now+durationMs)};
}
