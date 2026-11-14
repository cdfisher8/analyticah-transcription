# Time-credit and Auto-continue preview (NOT LIVE BILLING)

This branch is a code/UI preview. `creditAuthority` is deliberately `null`.
The UI shows **Unknown** time and **Not connected** credits. Start fails closed
without opening the microphone. Do not deploy this branch over the working live
site until the authenticated, server-authoritative credit system exists.

## Proposed product rule
Curtis requested separate Transcribe time credits: **R10 per hour**, purchased in
**R10 increments** (R10 = 1 hour; R20 = 2 hours). **Unused prepaid time expires at
month-end** and does not roll over. The separate **Unlimited plan is R300/month**. Unlimited entitlement semantics and
backend limits are not wired into this time-limited session prototype.
No payments, purchases, deductions, accounts or credit grants are implemented here.
MSync credits are unrelated and must not be mixed into this balance.

## Controls and timing
- Start is always explicit. Loading a page or enabling Auto-continue never starts.
- Auto-continue defaults off. Off pauses at the next recognition interruption,
  releases microphone resources, and shows Continue.
- On retries natural interruptions while the server-issued allowance is valid.
  Three consecutive interruptions without a result pause rather than loop forever.
- Turning Auto-continue off cancels a pending restart. Turning it on while paused
  does not resume until Continue is pressed.
- Stop invalidates the current session, cancels timers/retries, releases microphone,
  detaches recognition handlers, and ignores late results or permission completion.
- The **display estimate** counts down from recognition `onstart` until `onend`.
  Permission waiting and manual pauses do not use this displayed listening budget.
  Natural restart gaps also pause the listening clock. A separate server lease
  expiry runs continuously and can end even a paused session.
- Hidden/suspended browser timers can be delayed. Each check recomputes remaining
  time; browser code cannot be a secure usage authority. Reload does not restore an
  active session or invent a fresh balance. Only a server may authorize a new lease.

## Required backend contract before production
Implement authenticated `openSession()` returning a unique lease ID, remaining
seconds and absolute `expiresAt` in milliseconds. Invalid, expired or zero allowance
must fail closed. `closeSession(id)` must be idempotent and reconcile the server-held
reservation. It cannot trust a client-reported number or release all reserved credit
simply because the user closes a tab. Expiry/reconciliation must work when a tab or
connection disappears, and simultaneous tabs/devices cannot overspend one balance.

Production needs server-side reservation/accounting, server heartbeats, payment
webhook verification, ownership checks, offline and interruption policy, idempotency,
expiry reconciliation and abuse prevention. This controller provides none of those
security guarantees. No production adapter is wired in this preview.

## Verification
`node --test tests/*.test.cjs` covers unknown credit fail-closed behavior, countdown,
manual/automatic continuation, double clicks, late authorization/microphone results,
Stop/retry races, expiry, fatal permission failure and bounded reconnects, as well as
speaker and export regression tests. These simulated tests are not actual speech,
backend billing or mobile verification. Review those before deployment.
