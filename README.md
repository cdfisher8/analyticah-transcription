# AnalyticaH Transcription

Static live transcription app at `https://transcribe.analyticah.co.za`.

## Features
- Browser speech recognition, microphone level and boost controls, language selection.
- Editable transcript with local draft saving and restore.
- Manual Speaker 1, Speaker 2 and sequential additional speaker labels.
- TXT download, valid Open XML Word (.docx) download, and browser Print / Save PDF.

## Manual speakers
Open **Manual speakers** above the transcript. Place the cursor where a speaker
starts, then tap a speaker button or select a speaker and choose **Insert at cursor**.
A labelled paragraph is inserted without deleting selected text. **Add speaker** adds
the next number. Speaker count is saved locally (maximum 999).

With the transcript focused, **Ctrl+1…Ctrl+9** inserts the matching existing speaker.
Browsers/operating systems may reserve these keys for tab switching before the app
receives them. Buttons remain the reliable keyboard/touch fallback.

Drag a speaker button onto the transcript as an alternative. **Insertion uses the
preselected cursor, not physical drop coordinates.** Labels are manual, not automatic
speaker identification. Edit a label directly in the transcript to change it.

**Undo last label** only works before further edits alter the transcript, protecting
new words. Insertion may reset native textarea undo history. Export important drafts.

## Exports
- **Save TXT:** plain UTF-8 transcript.
- **Save Word (.docx):** local Open XML document with speaker labels and paragraphs;
  not HTML renamed as a Word file. No external library or upload is needed.
- **Print / Save PDF:** opens the browser print dialog with a clean transcript view.
  Choose Save as PDF and confirm; the app does not claim a PDF was saved automatically.
  Browser/mobile support varies. Cancelling the dialog leaves the transcript unchanged.

## Development and checks
Serve this directory over localhost (`python3 -m http.server 8000`). Run:

```sh
node --test tests/*.test.cjs
```

Tests use simulated UI events and validate document structure; they do not prove
live microphone, browser shortcuts, physical drag, print dialogs or mobile behavior.
Before release, check those flows in current Chrome/Edge and Android. Never use
private recordings/transcripts for automated tests. No backend or account changes
are included. Labels and exports work with the editable transcript.

## Privacy and deployment
Speech recognition may send audio to the browser vendor's online service. Meter
movement alone does not prove recognition. Review output carefully. Drafts and
speaker count live in this browser's local storage, not a cloud backup.

GitHub Pages publishes `main`; merging into it changes the live site. Keep work on
feature branches for review and retain the prior commit for rollback. Preserve CNAME
`transcribe.analyticah.co.za`. Verify the exact deployment and live output after release.
Do not commit keys, passwords, recordings or personal transcripts.
