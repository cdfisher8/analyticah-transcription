# Transcribe resume checkpoint · 15 November 2026

This is a development checkpoint, not a release or deployment claim.

## Current scope

Preserve manual numbered speakers, TXT/DOCX/Print-to-PDF exports, and the latest
editable Minutes Maker request (venue, attendees/designation, topics and
conclusion). No translation. R10/hour prepaid and R300/month Unlimited remain
draft pricing. Keep product-local sign-in separate from the canceled shared SSO.

## Verified locally

- Clean checkout of PR #7 at `1a36d5a8037e087d1ccdb6d0482268cace64e4eb`.
- All 82 synthetic Node tests pass on Node 24.22.1.
- This change adds PR-triggered regression testing with read-only repository
  permission, no secrets, no dependency installation, and no deployment step.
- GitHub workflow execution still needs its own successful run; local results
  do not prove CI execution.

## Release gates still open

| Area | Present | Still needed |
| --- | --- | --- |
| Speaker/minutes editor | Local editable draft and synthetic tests | Real browser, mobile, keyboard and export review |
| Recording | Existing microphone flow and simulated recovery tests | Actual permission, recording, interruption and audio checks |
| Account switching | Isolated server test contracts | Real sign-in, authorized transport, account-isolated browser drafts |
| Countdown/credits | Mock ledger and lifecycle tests | Trusted usage measurement, durable settlement, finite lease renewal |
| Payments | No verified payment integration | Provider-verified payment events, reconciliation and approved policies |
| Billing policy | Draft prices only | Expiry timezone, rounding, refund/failure and Unlimited-period rules |

**Do not deploy the integrated draft:** its `creditAuthority` is null, which
intentionally blocks microphone start. Passing synthetic tests is not live
identity, billing, transcription accuracy or deployment verification.

## Next useful step

Review the local editor/export flows in a real browser independently of billing,
then connect production identity and payment services only after their boundaries
and configuration are verified. Do not replace the existing working microphone
with the blocked integration draft merely to produce a preview.
