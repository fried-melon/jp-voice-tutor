# Gate window limits (honest)
- Opening needs BOTH API_PRIVACY_CONFIRMED=yes and GATE_OPEN_UNTIL (epoch ms, <= now+30min at check time).
- NOT an issued 30-minute window: a future cutoff more than 30 min ahead is rejected now but becomes valid when time reaches its last 30 min if the flag is still yes. Never pre-arm a future cutoff.
- The two secret writes are not atomic. Procedure: flag must be no first (invalid state), no pre-armed cutoff, then stage cutoff (<=30 min), then flag=yes. After the test: flag=no first, then clear the cutoff (GATE_OPEN_UNTIL=0). If cleanup fails after yes, the gate stays open until the cutoff and then closes for NEW requests.
- Expiry bounds new voice-token mints only. It does not kill an existing WebSocket. A wake/timer is a reminder, not guaranteed closure.
- Seconds-valued cutoffs are read as 1970 ms values and fail closed.
- Notes, history, owner-check and session routes are not gated by this check.
