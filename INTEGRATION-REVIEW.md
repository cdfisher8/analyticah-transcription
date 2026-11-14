# Integrated Transcribe review — NOT A RELEASE

Combines PR #3 (51f6e5c), PR #4 (d5a8aae), and the isolated test ledger from
PR #5 (199880e). Superseding review candidate only; none of those PRs or this
candidate is approved for deployment. Main and its live microphone are unchanged.

## Release stop

**Do not deploy this branch to the working site.** Its `creditAuthority` is null,
and Start intentionally refuses to open the microphone. This preserves a paid
preview's fail-closed behavior, but replacing the live site with it would disable
existing listening. No feature flag, fabricated balance, or free allowance is
installed to conceal that missing integration. Keep the live branch intact.

## Combined coverage

- Countdown and manual/Auto-continue controller.
- Manual numbered speakers, unchanged transcript, local Minutes Maker and editable
  topics/decisions/actions/conclusion; TXT, DOCX and Print / Save PDF.
- Test-only server ledger, separate Transcribe identity contract, atomic leases,
  trusted receipt reconciliation, R10/hour increments and R300/month Unlimited.
- No translation, real AI, payment provider, real identity, real microphone/audio
  tests or cloud storage adapters added.

Run `node --test tests/*.test.cjs` on Node 24. All 58 synthetic tests pass locally.
Three added integration checks exercise controller-to-ledger reservation/Stop/
settlement, unresolved policy failure before microphone access, and page separation
from server-only ledger code. Existing 54 tests remain unchanged. Independent review also identified old-policy
balances displayed as spendable; these are now withheld and flagged for migration,
with a regression test. No CI result,
real payment, real speech or browser/mobile end-to-end result is implied.

## Remaining production work

1. Product-local signup/login and authenticated CSRF-protected server transport.
2. Verified central Payments order-to-owner delivery, never browser return URLs.
3. Trusted audio usage worker, revocation, durable reconciliation and retries.
4. Approved expiry timezone, rounding, failure/refund treatment, Unlimited period
   and technical limits. Synthetic fixture policies are not customer terms.
5. Lease renewal: Auto-continue currently retries recognition within one lease;
   it does NOT obtain a new lease when that lease expires. R300 Unlimited does not
   mean an infinite lease. Implement and independently test safe renewal before
   claiming continuous service while credits/subscription remain available.
6. Account-isolate browser-local drafts before customer login/shared-device rollout.
7. Desktop/mobile UI, actual supported browser audio, print/download QA, privacy
   disclosure and backup/hosting verification.

Minutes-only deployment could instead be reviewed separately against live main,
without importing the unconfigured countdown/credit controller. This branch does
not perform that deployment or change any production resource.
