# AnalyticaH Transcription

A browser-based transcription app with live microphone transcription and an optional protected recording-upload service. The interface remains focused on transcription.

- **Production hostname:** `transcribe.analyticah.co.za` (use HTTPS for microphone access)
- **Repository:** https://github.com/cdfisher8/analyticah-transcription
- **Frontend:** `index.html`, `upload.js`, and `upload-config.js` (no build step)
- **Optional upload backend:** Node.js and FFmpeg; see [server setup and safety notes](server/README.md)
- **Default branch:** `main`

**Deployment:** GitHub Pages publishes `main` at `transcribe.analyticah.co.za`, which matches the existing `CNAME`. Preserve this hostname and its DNS. The different name `transcriptions.analyticah.co.za` is not this app’s deployment. Verify the HTTPS certificate and redirect before relying on live microphone access.

## Current features

- Live microphone level meter and browser speech recognition
- English (South Africa, US, UK) and Afrikaans language selection
- Editable transcript, clipboard copy, and plain-text download
- Recording upload UI with explicit consent, local format checks, cancellation, and append-only results when a backend is configured
- Local browser autosave and automatic restore
- Clear explanations for unavailable microphone APIs, insecure pages, blocked permissions, missing devices, and speech-service errors
- Safe cancellation during microphone startup and delayed recognition recovery

Audio type is a manual label. Song lyrics may be recognized, but the app does not detect music or change recognition models based on this selection. Uploaded-file transcription requires the optional Node/FFmpeg/OpenAI backend; static GitHub Pages alone cannot provide it. There is no meeting-minutes generation, AI cleanup, Word/PDF export, user-account system, or Google Drive sync.

## Microphone troubleshooting

1. Open the app **directly over HTTPS**, not plain HTTP or a site-builder preview. `getUserMedia` is normally unavailable in insecure contexts. `http://localhost` is allowed for local development; a plain-HTTP LAN IP is not equivalent to localhost.
2. Use a recent Chrome or Edge browser. In-app browsers and other browsers may not support the required speech service.
3. Allow microphone access for the exact site in browser and operating-system settings. Connect or enable a microphone if none is detected.
4. If the app is embedded, both the outer page and app must use HTTPS. The host must permit microphone use through its iframe `allow="microphone"` setting and any applicable Permissions-Policy. Opening the app directly is the simplest way to distinguish hosting restrictions from an app issue.
5. Verify microphone input and speech recognition separately. A moving level meter does not prove that the browser's online speech service is working.

The code now explains these conditions instead of showing `Cannot read properties of undefined (reading 'getUserMedia')`. It cannot install a TLS certificate, grant browser permission, or override a hosting page's permission policy.

## Local development and tests

Serve this directory:

```sh
python -m http.server 8000
```

Open `http://localhost:8000` in a recent Chrome or Edge browser.

Run the regression suite with Node.js 22.9 or newer and FFmpeg/FFprobe available:

```sh
npm test
```

The tests execute the frontend with simulated browser APIs, exercise the HTTP upload server with a mocked OpenAI response, and convert synthetic recordings through real FFmpeg. They cover microphone/session races, drafts, exports, upload validation, cancellation, authentication, resource limits, malformed inputs, and media formats. They do not prove actual browser microphone or live OpenAI transcription behavior. No npm dependencies are needed; FFmpeg/FFprobe are system requirements for backend tests.

### Manual browser checks before publishing

- Start, allow the microphone, speak, and verify that final words appear. Check the meter separately.
- Stop and start repeatedly, including while permission is pending. Confirm only the current session changes the UI and that stopped sessions release the microphone.
- Deny permission, disconnect the microphone, and interrupt the speech-service connection. Confirm the guidance and that Start becomes available again.
- Confirm English and Afrikaans availability with the browser's actual speech service.
- Edit a transcript, immediately reload or close the tab, and confirm it restores. Test Copy, Save .txt, and both Cancel and Confirm in Clear transcript.
- Test desktop and Android layouts and the actual HTTPS production origin. Test an embedded page separately if embedding is intended.
- For uploads, verify backend setup, access code, consent, actual MP3/voice-note results, cancellation, and damaged/oversized/unsupported files. Never enter an OpenAI API key into the frontend.

## Privacy and limitations

- Browser speech recognition may send audio to a browser-vendor online service. It is not guaranteed offline or confidential from third-party processing.
- Live microphone mode does not record an audio file, so failed live recognition cannot recover missed audio later. Upload mode temporarily processes a selected recording on the backend and sends normalized audio to OpenAI; see the server privacy and retention notes.
- LocalStorage is tied to the exact origin, browser, and device. Changing the domain or switching from HTTP to HTTPS does not migrate drafts. **Export important transcripts before changing addresses or clearing browser data.**
- Only finalized speech is persisted. A brief final-result window after Stop is supported, but browser/service behavior can vary.
- Autosave is not a cloud backup. Storage failures show a reminder to download a text copy.
- Recognition retries are bounded for repeated network errors. The microphone stops when a fatal error occurs or the page closes.

## Publishing

Keep changes on a feature branch for review before merging. The existing GitHub Pages workflow publishes `main`, so merging into `main` is a production deployment. Monitor that exact commit’s Pages build and deployment.

The intended domain is `transcribe.analyticah.co.za`, whose DNS already points to `cdfisher8.github.io`. In repository Settings > Pages, verify the custom domain, certificate status, and Enforce HTTPS setting before changing configuration. No DNS migration is needed to publish code updates. After publication, check that the live HTML matches the deployed commit and repeat the manual browser checks above.

Never commit API keys, OAuth client secrets, recordings, or private transcripts. Future AI transcription or cloud storage requires a suitable backend and user consent.
