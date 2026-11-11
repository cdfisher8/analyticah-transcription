# AnalyticaH Transcription

A self-contained, browser-based live transcription app. The current interface is deliberately transcription-only.

- **Reported live address:** https://transcriptions.analyticah.co.za
- **Repository:** https://github.com/cdfisher8/analyticah-transcription
- **Entry point:** `index.html` (no build step or runtime dependencies)
- **Default branch:** `main`

**Deployment mismatch to resolve:** the existing `CNAME` file names `transcribe.analyticah.co.za`, not the reported live address above. Do not change DNS or publish until the intended hosting setup and domain are confirmed. The repository configuration alone does not prove where the live page is served.

## Current features

- Live microphone level meter and browser speech recognition
- English (South Africa, US, UK) and Afrikaans language selection
- Editable transcript, clipboard copy, and plain-text download
- Local browser autosave and automatic restore
- Clear explanations for unavailable microphone APIs, insecure pages, blocked permissions, missing devices, and speech-service errors
- Safe cancellation during microphone startup and delayed recognition recovery

Audio type is a manual label. Song lyrics may be recognized, but the app does not detect music or change recognition models based on this selection. There is no uploaded-file transcription, meeting-minutes generation, AI cleanup, Word/PDF export, authentication, or Google Drive sync in the current interface.

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

Run the dependency-free regression suite with Node.js 20 or newer:

```sh
npm test
```

The tests execute the actual inline application script with simulated browser APIs. They cover unavailable microphone APIs, insecure/blocked contexts, permission and device errors, repeated clicks, cancellation races, optional meter failures, recognition failures/retries, transcript preservation, autosave, and clipboard fallback. No package installation is needed.

### Manual browser checks before publishing

- Start, allow the microphone, speak, and verify that final words appear. Check the meter separately.
- Stop and start repeatedly, including while permission is pending. Confirm only the current session changes the UI and that stopped sessions release the microphone.
- Deny permission, disconnect the microphone, and interrupt the speech-service connection. Confirm the guidance and that Start becomes available again.
- Confirm English and Afrikaans availability with the browser's actual speech service.
- Edit a transcript, immediately reload or close the tab, and confirm it restores. Test Copy, Save .txt, and both Cancel and Confirm in Clear transcript.
- Test desktop and Android layouts and the actual HTTPS production origin. Test an embedded page separately if embedding is intended.

## Privacy and limitations

- Browser speech recognition may send audio to a browser-vendor online service. It is not guaranteed offline or confidential from third-party processing.
- The app does not record or retain an audio file. A failed recognition service cannot recover missed audio later.
- LocalStorage is tied to the exact origin, browser, and device. Changing the domain or switching from HTTP to HTTPS does not migrate drafts. **Export important transcripts before changing addresses or clearing browser data.**
- Only finalized speech is persisted. A brief final-result window after Stop is supported, but browser/service behavior can vary.
- Autosave is not a cloud backup. Storage failures show a reminder to download a text copy.
- Recognition retries are bounded for repeated network errors. The microphone stops when a fatal error occurs or the page closes.

## Publishing

Keep changes on a feature branch for review before merging. Confirm whether Afrihost serves the page itself or supplies DNS for GitHub Pages. Do not assume both deployment paths are active.

For GitHub Pages, verify the publishing source, intended custom domain, DNS target, and HTTPS certificate in repository Settings > Pages before changing configuration. For Afrihost hosting, verify that the intended subdomain serves this `index.html` over valid HTTPS. In either case, check the actual live page after publication and repeat the manual checks above.

Never commit API keys, OAuth client secrets, recordings, or private transcripts. Future AI transcription or cloud storage requires a suitable backend and user consent.
