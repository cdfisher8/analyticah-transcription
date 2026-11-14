# Minutes Maker — review branch, not deployed

Stacked on the time-session preview PR #3 (`51f6e5c`). Do not deploy: that base
intentionally has no credit authority and blocks microphone listening. This
feature adds no account, billing, recording or AI service.

## Included
- Compact, collapsible Minutes Maker panel, separate from the original transcript.
- Meeting title/date, venue or online location; attendee names and designations.
- Editable topics, discussion/source excerpts, decisions, actions, owners and dates.
- Editable conclusion; missing fields remain explicitly unrecorded, not invented.
- Select text in the transcript, then copy it into a new topic. Original text is
  never changed. A changed/cleared source requires selecting again.
- “Suggest agenda headings” recognises explicit `Topic: Budget`, `Agenda: …`,
  `Agenda item 2: …` and `Item: …` lines. Suggestions require individual acceptance.
  This is a conservative local text rule, **not AI topic detection/summarisation**.
- Read-only preview; edit the fields, then preview again. Exports read latest fields.
- TXT, genuine DOCX, and browser Print / Save PDF, all marked draft for review.
- Separate local minutes draft. New minutes confirms replacement, leaves transcript
  intact. Untouched tabs do not save; stale edited tabs warn rather than knowingly
  overwrite a newer stored draft. Export before reloading on conflict. Local storage
  is not account/cloud storage, encryption, a backup or robust multi-user editing.

## Verification
`node --test tests/*.test.cjs`: 36 passing (26 existing, 10 Minutes Maker).
Covers formatting, conservative heading candidates, malformed local drafts,
excerpt preservation/staleness, local draft edits, multiple-tab conflict guard,
storage failure, and text-only handling. Existing speakers/session/export tests pass.
Independent review caught stale excerpt and cross-tab overwrite issues, both fixed
with regression tests. Actual desktop/mobile UI, download behaviour and PDF print
workflow still need browser QA. No customer data or real audio used.

## Before production
Integrate after the session/account work is reviewed, or cherry-pick just these
Minutes Maker files onto an appropriate release. Do not promote the entire base
preview merely to release minutes. Obtain deployment instruction; test mobile and
keyboard selection, print dialog, local-storage quota and long meetings. Verify
privacy disclosure for browser-local meeting information and speech-provider usage.
