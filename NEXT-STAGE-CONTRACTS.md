# Mock-backed lifecycle and account drafts — NOT PRODUCTION

These isolated server test components are not imported by the browser, have no
HTTP routes and accept `environment: 'test'` only. They do not remove production
blockers, turn on credits, or change the working site. No real accounts/audio used.

## Finite-lease renewal coordinator

`TestSessionCoordinator` demonstrates the required order: revoke old allowance,
halt worker, receive an opaque trusted final metering receipt, settle through the
authority, then request fresh allowance and begin work. Stop marks the run cancelled
immediately. A late allowance is revoked, not used. Overlapping renewal is rejected.
Failure does not silently extend the old allowance or invent usable time.

Adapters MUST enforce authentication, ownership, expiry, finite duration, idempotent
revoke/halt/settle, verified receipts and atomic balance checks. This helper does not
replace the ledger or verify tokens/receipts itself. Test fixtures are mocks, not
production adapters. Worker halt/settlement failures require durable reconciliation;
this in-memory coordinator is not durable and cannot prove that remote work stopped
on an outage. A worker must independently enforce expiry/revocation.

The browser controller remains unchanged and cannot renew leases. Connecting this
contract to genuine authenticated transport and metered audio is still required.

## Product-local account drafts

`TestAccountDrafts` demonstrates authenticated product-local ownership, independent
transcript/minutes keys, optimistic revision checks, 1 MiB text bounds and defensive
copies. It does not accept a client owner ID. Invalid identities and other products
are rejected. This is an in-memory server test repository, NOT a deployed database.

No existing browser-local draft is imported or claimed by a newly signed-in user.
Before customer login rollout, the UI must clear in-memory transcript/minutes state
on logout/account switch and use the authenticated repository. Legacy local drafts
need explicit owner-approved migration; never automatically attach shared-device
content to the next account. Current UI local drafts remain unsuitable for account
isolation. Production needs persistence, encryption/access controls, deletion and
retention policy, session revocation, CSRF/rate limits and actual browser QA.

Independent review corrections: halt is attempted even if authority revocation
fails; unresolved cleanup stays in an explicit retry map. Late allowances are
cleaned up, not silently abandoned. Renewal is rejected while initial worker begin
is pending, and acquired lease identity is checked after begin. Duplicate cleanup
can occur across Stop/renewal: adapters must return the same immutable final receipt
and settle it idempotently (as the test ledger does). Retry state is process-local;
production still requires durable recovery. All 69 synthetic tests pass locally.
