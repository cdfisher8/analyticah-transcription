# Transcribe entitlement foundation: TEST ONLY, NOT DEPLOYABLE

This is a separate server-side domain component stacked on the time-session preview.
It does not connect that preview to billing. `creditAuthority` remains null, so Start
continues to fail closed. No users, mail, recordings, purchases or production systems
were accessed. There is no HTTP listener or login implementation in this change.

## Confirmed commercial direction

- Prepaid: R10 per hour. Positive whole R10 increments; R30 buys three hours.
- Unused prepaid time expires month-end. No daily reset.
- Separate Unlimited: R300/month. Not MSync's Unlimited plan.
- Product-specific Transcribe login, not shared cross-product SSO.

## What this component actually verifies

`server/entitlements.cjs` runs only with explicit `environment: 'test'` and trusted
synchronous adapters. It uses Node 24's SQLite and immediate transactions for grants,
reservations, Stop, and settlement. It never trusts a browser-provided identity,
balance or consumed duration. Payment and metering test fixtures are opaque handles,
not arbitrary request objects marked `verified`.

- Exact integer R10 quantity/price/time conversion with safe-integer overflow checks.
- Immutable payment-event identity and replay/conflict checks.
- Separate Transcribe principal/product gate and owner isolation.
- One active lease per user; idempotent Start, atomic time reservation.
- Earliest-expiring eligible credit first, Unlimited preferred when valid.
- Finite lease duration for both plans; no unlimited-duration browser authorization.
- Stop immediately revokes a lease. Stop/reload/disconnect cannot return reserved time.
- Only a trusted final metering receipt can settle and return unused reservation.
- Expired grants never become usable because of late settlement.
- Policy versions pinned to grants and leases. New-policy use of old grants is blocked
  pending an explicit migration. Old leases settle under their original policy.
- Persisted clock high-water guard rejects clock rollback rather than reviving time.
- Available milliseconds are returned as a decimal string to avoid unsafe sums.

`openSession(credential, requestKey)` produces the preview controller's shape:
`{id, remainingSeconds, expiresAt}`. `closeSession(credential, id)` revokes but does not
claim billing has reconciled. No browser adapter is installed: an authenticated,
CSRF-protected transport and real usage authority must come first. The existing
browser-only speech-recognition clock is a display estimate, not billable evidence.

## Unresolved rules deliberately prevent activation

Missing `policy` makes all entitlement operations fail closed. Tests inject clearly
named fixture policies; these are not customer terms or production defaults:
- Expiry timezone/month boundary and late-payment processing policy.
- What audio time is billable, rounding/minimum charge and interruption handling.
- Failure, cancellation, retry, reversal and legally required refund treatment.
- Unlimited monthly period, renewal/cancellation and technical abuse limits.

The fixture UTC month boundary and fixture 30-day Unlimited period in tests are
synthetic only. Neither implements a chosen business period. `prepaidExpiry` and
`unlimitedPeriod` are mandatory trusted policy adapters, not request inputs. A
production policy implementation and approved disclosures are still required.

## Future central AnalyticaH Payments contract

No direct compatibility or integration with current Payments outbox is claimed.
A future server-to-server verifier must authenticate its sender and map a verified,
immutable paid order to the following event only after merchant verification:

`environment, product='transcribe', policyVersion, id (unique order), owner
(product-local identity), currency='ZAR', paidAt, kind, quantity, amountCents`.

Prepaid amount must equal quantity × 1000 cents. Unlimited is quantity 1 / 30000
cents with an explicit entitlement-period adapter. Browser success/return URLs,
client order amounts, unverified callback JSON and webhook `verified:true` flags
must never grant time. Replay is idempotent; changed duplicate payloads fail.
Production events are rejected by this test component. Payments catalogue remains
disabled; no service automatically starts charging by merging this code.

The future trusted transcription worker must authorize each unit of work against
an active owned lease and halt when revoked/expired. Its authenticated final receipt
is `environment, product, policyVersion, id, owner, leaseId, usedMs, final=true`.
Receipts cannot exceed the reserved allowance. The policy adapter must already have
applied approved metering/rounding rules. A durable worker/reconciler must eventually
settle lost tabs/crashed jobs: until then reservations remain held, conservatively.
No cancellation acknowledgment from a client substitutes for worker confirmation.

## Remaining production/security work

Real separate-product signup/login/session revocation; TLS/CSRF/rate limits;
verified payment delivery and ownership mapping; trusted audio metering; durable
reconciliation and refunds; policy migrations; DB backup and encrypted host controls;
provider/runtime deployment; actual browser/audio/mobile QA. SQLite schema here is a
fresh test schema, not a migration for any existing deployed database. Never connect
it to customer data or expose its adapters as public endpoints.

## Verification

Run `node --test tests/*.test.cjs` with Node 24. Independent review identified policy
version drift and clock rollback; both received fixes and regression coverage.
Tests use synthetic data and clocks only. No GitHub CI/deployment result is implied.
