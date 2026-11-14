# Account workspace transition contract — TEST ONLY

Next isolated stage after PR6. No production/browser imports, network listener,
real identity, signup, billing, microphone, customer data or deployment.

`TestAccountWorkspace` demonstrates clear-before-await account transitions,
serialised Stop cleanup, stale response rejection, revision-checked saves and
server-session-bound draft requests. A failed Stop blocks subsequent connection
until an explicit successful cleanup retry. The Stop adapter must retry ALL
outstanding remote cleanup, not merely stop a currently active local recorder.

The opaque `identity.binding` must be minted by the future trusted server, bound to
its authenticated session, product and owner. Every read/write MUST atomically
validate it against the currently authenticated session BEFORE reading/writing.
It is not an owner ID or standalone login credential. Response identity checking
alone cannot prevent a stale request saving old-account text under new cookies.
Tests mock this contract; no real authenticated transport implements it yet.

The UI clear adapter must clear transcript, minutes, speaker/selection/export
state, pending callbacks and previews. This contract is not imported by index.html
and does NOT make its legacy browser-local drafts account-safe. No automatic legacy
localStorage import is allowed. DOM/browser/mobile and multi-tab session-revocation
QA remain unperformed. Render must use text only. HTTPS, HttpOnly/SameSite cookies,
CSRF, session revocation, rate limits, secure persistence and real provider setup
remain deployment blockers.

Pricing unchanged: prepaid R10/hour in R10 increments; unused time expires at
month-end; Unlimited R300/month. Expiry timezone, rounding, failure/refund policy,
trusted audio receipts and payment verification remain unresolved, fail closed.
This does not claim real metering or a usable customer login.

Validation: Node synthetic suite 82 passing. Independent review caught concurrent
connect/logout races, request-side account binding and cleanup failure handling;
regressions added. Keep PR6 and live main unchanged. Do not deploy this draft.
