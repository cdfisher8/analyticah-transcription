# AnalyticaH Transcription

Browser-based live transcription and meeting-minutes drafting application.

**Production domain:** https://transcribe.analyticah.co.za  
**Repository:** https://github.com/cdfisher8/analyticah-transcription  
**Entry point:** `index.html` (static site)  
**Default branch:** `main`

## Current features
- Live microphone level meter and speech-to-text via the browser SpeechRecognition API
- English (South Africa, US, UK) and Afrikaans language selection
- Editable original and improved transcripts
- Rule-based cleanup and paragraph formatting
- Transcript search
- Draft meeting minutes, possible decisions, and possible action items
- Local browser autosave and manual restore
- Export as plain text, Word-compatible HTML .doc, or browser Print to PDF

## Important limitations
- SpeechRecognition availability and behavior vary by browser. Some implementations send audio to a browser-vendor online speech service; do not promise offline transcription or confidentiality from third-party processing.
- The microphone meter only confirms audio input, not successful speech recognition.
- Meeting minutes and action items are **rule-based drafts**, not AI summaries. Review owners, deadlines, and decisions before sharing.
- LocalStorage is tied to the browser and device. It is not a cloud backup, and clearing browser data may delete drafts.
- Word export is an HTML-based .doc file, not native .docx. PDF export uses the browser print dialog.
- No server-side authentication, Google Drive sync, or uploaded-file transcription is implemented in this static build.

## Local testing
Serve this folder over localhost, for example:
```sh
python -m http.server 8000
```
Then open http://localhost:8000 in a recent Chrome or Edge browser. Allow microphone access and verify recognition and meter behavior separately.

## Publishing
The `CNAME` file specifies `transcribe.analyticah.co.za`. To publish using GitHub Pages:
1. In repository Settings > Pages, select **Deploy from a branch**, branch `main`, folder `/ (root)`, and Save.
2. Configure the DNS record for `transcribe` at the domain's DNS provider to point to `cdfisher8.github.io` (CNAME).
3. In GitHub Pages settings, verify the custom domain and enable **Enforce HTTPS** once the certificate is ready.
4. Test the production URL on desktop and Android, including microphone permission, transcription, stopping, autosave/restore, and exports.

A `CNAME` file alone does not prove that Pages, DNS, or HTTPS is active.

## Production checklist
- [ ] Verify GitHub Pages publishing source and latest deployment
- [ ] Verify DNS and HTTPS for the custom domain
- [ ] Test live recognition and recovery after recognition interruptions
- [ ] Test mobile responsiveness and browser support
- [ ] Add safe backup/export before relying on long meetings
- [ ] Review privacy notice and microphone processing disclosures
- [ ] Design optional authenticated Google Drive storage with user authorization
- [ ] Add automated smoke tests and deployment checks

## Development guidance
Keep changes on feature branches and use pull requests to review them before merging into `main`. Never commit API keys, OAuth client secrets, recordings, or private transcripts. Any future AI transcription or cloud storage requires an appropriate backend and user consent.
