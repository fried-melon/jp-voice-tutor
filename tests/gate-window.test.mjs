import{test}from'node:test';import assert from'node:assert/strict';
import{evaluateGate,planWindowOpen,MAX_GATE_WINDOW_MS}from'../shared/gate-window.mjs';
const NOW=1767225600000; // fixed instant
test('privacy flag is always required - a valid cutoff alone never opens',()=>{
 for(const flag of[undefined,'no','YES','true','1','yes '])assert.equal(evaluateGate({flag,openUntil:String(NOW+60000),now:NOW}).open,false,JSON.stringify(flag));
 assert.equal(evaluateGate({flag:undefined,openUntil:String(NOW+60000),now:NOW}).reason,'privacy_flag_not_confirmed');
});
test('both controls + inside the window -> open, with bounded remaining time',()=>{
 const r=evaluateGate({flag:'yes',openUntil:String(NOW+60000),now:NOW});
 assert.equal(r.open,true);assert.equal(r.closesInMs,60000);
});
test('cutoff absent/malformed/nonfinite fails closed even with flag=yes',()=>{
 for(const openUntil of[undefined,'',' ','abc','1e999','NaN','Infinity','0x10']){const r=evaluateGate({flag:'yes',openUntil,now:NOW});assert.equal(r.open,false,JSON.stringify(openUntil));assert.equal(r.reason,'cutoff_missing_or_malformed');}
});
test('expired or exactly-at-now cutoff fails closed (stale window can never reopen)',()=>{
 assert.equal(evaluateGate({flag:'yes',openUntil:String(NOW-1),now:NOW}).reason,'cutoff_expired');
 assert.equal(evaluateGate({flag:'yes',openUntil:String(NOW),now:NOW}).reason,'cutoff_expired','boundary: cutoff == now is closed');
});
test('cutoff beyond the bounded maximum window fails closed',()=>{
 const r=evaluateGate({flag:'yes',openUntil:String(NOW+MAX_GATE_WINDOW_MS+1),now:NOW});
 assert.equal(r.open,false);assert.equal(r.reason,'cutoff_beyond_max_window');
 assert.equal(evaluateGate({flag:'yes',openUntil:String(NOW+MAX_GATE_WINDOW_MS),now:NOW}).open,true,'exactly the max is allowed');
});
test('unavailable clock fails closed',()=>{
 assert.equal(evaluateGate({flag:'yes',openUntil:String(NOW+60000),now:NaN}).reason,'clock_unavailable');
});
test('stale staged cutoff: gate stays closed until a FRESH cutoff is staged',()=>{
 const staged=planWindowOpen({now:NOW,durationMs:15*60000});
 assert.ok(staged.openUntil);
 // time passes beyond the staged cutoff while flag was no; flag=yes later must NOT open
 const later=NOW+20*60000;
 assert.equal(evaluateGate({flag:'yes',openUntil:staged.openUntil,now:later}).open,false);
 // a fresh staging + flag write opens again
 const fresh=planWindowOpen({now:later,durationMs:15*60000});
 assert.equal(evaluateGate({flag:'yes',openUntil:fresh.openUntil,now:later}).open,true);
});
test('planWindowOpen bounds and validates',()=>{
 assert.equal(planWindowOpen({now:NOW,durationMs:MAX_GATE_WINDOW_MS+1}).error,'window_exceeds_max');
 assert.equal(planWindowOpen({now:NOW,durationMs:0}).error,'invalid_window');
 assert.equal(planWindowOpen({now:NOW,durationMs:-5}).error,'invalid_window');
 assert.equal(planWindowOpen({now:NaN,durationMs:60000}).error,'invalid_window');
});

// HONEST LIMITATIONS (parent review 09:33): operation ORDER is a procedure, not code
// enforcement. evaluateGate alone cannot prevent these reopen paths; they are mitigated
// only by procedure + the 30-min bound + closure verification. These tests DOCUMENT the
// holes; they must keep passing until a nonreusable-window-record model lands.
test('LIMITATION: flag left yes + writing a fresh bounded cutoff opens the gate',()=>{
 // Close procedure step 2 (clear cutoff) skipped or failed, flag still yes, operator
 // (or accident) writes a new valid cutoff: the gate OPENS. Ordering cannot stop it.
 const r=evaluateGate({flag:'yes',openUntil:String(NOW+60000),now:NOW});
 assert.equal(r.open,true,'documented hole: no window-identity check exists yet');
});
test('LIMITATION: an unexpired staged cutoff + flag toggle no->yes reopens the stale window',()=>{
 const cutoff=String(NOW+60000);
 assert.equal(evaluateGate({flag:'no',openUntil:cutoff,now:NOW}).open,false,'staged while closed');
 assert.equal(evaluateGate({flag:'yes',openUntil:cutoff,now:NOW}).open,true,'documented hole: the staged window was never invalidated');
});

// Pinned semantics (limits, stated honestly):
test('an overlong future cutoff is rejected now but becomes valid once time advances into its last 30 min while flag stays yes',()=>{
 const cutoff=String(NOW+MAX_GATE_WINDOW_MS+5*60000);
 assert.equal(evaluateGate({flag:'yes',openUntil:cutoff,now:NOW}).reason,'cutoff_beyond_max_window');
 const later=NOW+10*60000; // now inside the last 30 min of that cutoff
 assert.equal(evaluateGate({flag:'yes',openUntil:cutoff,now:later}).open,true,'NOT an issued 30-min window: a pre-armed future cutoff with flag=yes opens later');
});
test('two-control writes are not atomic: stale/pre-armed cutoff plus a later flag=yes can open until that cutoff',()=>{
 const staged=String(NOW+10*60000);
 assert.equal(evaluateGate({flag:'no',openUntil:staged,now:NOW}).open,false);
 assert.equal(evaluateGate({flag:'yes',openUntil:staged,now:NOW}).open,true,'flag=yes after staging opens; if the cleanup write fails after yes, it stays open until the cutoff');
 assert.equal(evaluateGate({flag:'yes',openUntil:staged,now:NOW+10*60000}).open,false,'bounded: closes at the cutoff for new requests');
});
