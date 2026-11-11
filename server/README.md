# Audio upload service

This optional server implements real file transcription through OpenAI. It does not play a recording into browser SpeechRecognition. The existing microphone feature remains independent.

## Status and requirements

The implementation has automated tests and synthetic audio conversion tests. It has **not** been validated against a live OpenAI account or deployed. A configured key alone does not make GitHub Pages capable of running this server.

Runtime requirements:
- Node.js 22.9 or newer (Node 24 is recommended)
- Current FFmpeg and FFprobe executables, including the libmp3lame encoder
- A protected HTTPS backend endpoint
- An OpenAI project API key held only in backend secret storage
- A separate, unpredictable upload access code of at least 24 characters, shared only with intended users
- Confirmed provider billing limits and an explicit decision to enable uploads

The checked-in Dockerfile uses the official Node image, the distribution FFmpeg package, a non-root user, and an explicit file allowlist. No secret files are copied into the image. Keep dependencies patched; untrusted media decoders are a security-sensitive surface.

`npm start` starts the bundled server on localhost:8787. It can serve the frontend and the API together. `.env.example` documents non-secret settings; `.env.local` and other credential files are ignored by Git and Docker.

## Keeping the existing website address

Keep `transcribe.analyticah.co.za` and its current GitHub Pages DNS unchanged. Deploy this backend at a separately approved HTTPS endpoint, then put that public backend origin (no path or credentials) in `upload-config.js` as `apiBase`. The API must allow the exact frontend origin `https://transcribe.analyticah.co.za`.

Alternatively, the Node server can serve the whole app behind HTTPS, but moving the existing domain is a separate hosting/DNS change that requires approval. Do not make that migration implicitly.

The server binds to loopback by default. A hosting platform/container can set `HOST=0.0.0.0` behind its HTTPS ingress. Never expose access codes or uploaded audio over public plain HTTP. The frontend refuses insecure uploads, but the host is responsible for TLS and redirects.

## API contract

- `GET /api/capabilities`: supported extensions and limits, whether uploads are enabled, provider/model names. No secrets.
- `POST /api/transcriptions`: raw bytes for exactly one recording. Required headers: `Origin`, `Content-Type`, `X-File-Name` (percent-encoded filename), and `X-App-Access-Code` (the separate app access code). It returns JSON containing `text` and `durationSeconds`.
- Other paths are rejected except the four explicit frontend files. Environment files, server source, and Git data are not served.

The browser asks for permission to send a recording before uploading. File selection and local header validation do not transmit audio. Results append to the transcript rather than replacing edits. The app access code is not saved in localStorage and is cleared when leaving the page. OpenAI API keys must never be entered into that field.

## Formats and limits

Accepted extensions are MP3, M4A, WAV, WebM, MP4, MPEG, MPGA, OGG, OGA, Opus, FLAC, and AAC. Each passes extension/type/signature checks, real media inspection, and conversion to a normalized MP3 before being sent to OpenAI. Video is stripped and only the first audio track is transcribed. Renaming an unsupported file does not convert it.

OGG/Opus voice notes are decoded and converted on the backend. This avoids assuming every extension is directly accepted by the chosen model. Synthetic fixtures for all 12 extensions passed FFmpeg conversion locally; this does not prove every recording, codec variant, encrypted file, damaged file, or device export will work. AMR, WMA, ZIP, documents, and encrypted/protected media are not supported by this implementation.

Default limits are one in-flight recording, 25,000,000 input bytes, and 30 minutes of decoded audio. The server measures the normalized output because source metadata can be forged. A 0.1-second codec-padding tolerance is permitted; actual output duration is rounded up for usage reservations. Long input is rejected, not silently accepted as a shortened transcript.

The 60-minute daily allowance is **process-local**, resets when the process restarts, and is separate for each replica. It is a precaution, not a durable spending cap. Use a single instance initially, configure provider billing controls, and add persistent/shared accounting before scaling or offering public access. Existing reservations are not refunded after a provider request with an ambiguous failure or cancellation, because it may already be billed.

The backend limits upload time, decoder time/output, provider time, concurrent work, and request attempts. It does not automatically retry chargeable requests. Abort/cancel is best-effort and does not guarantee that provider processing or charges stop.

## Privacy

- Recordings are written to a private temporary directory for inspection/conversion and removed in normal request cleanup. Process/container crashes can leave temporary files until the host's cleanup; use ephemeral storage and do not back up temporary directories.
- No audio archive, transcript database, or request-body logging is implemented. Do not enable body/header capture in proxies, monitoring, or error reporting.
- Decoder subprocesses receive a minimal environment without API credentials. Network media protocols are disallowed. Run in a dedicated non-root container without unrelated files or credentials mounted into it.
- Only normalized audio and model selection are sent to OpenAI; original filenames and media metadata are not forwarded.
- Returned transcripts are stored locally in the user's browser by the existing draft feature.
- API data is not used to train OpenAI models by default unless the account opts in. Retention and compliance settings depend on the current OpenAI account and endpoint terms; do not promise zero retention without verifying those settings.

## Provider references checked 2026-11-11

- File transcription and current model guidance: https://developers.openai.com/api/docs/guides/speech-to-text
- GPT-Transcribe: https://developers.openai.com/api/docs/models/gpt-transcribe
- Data controls: https://developers.openai.com/api/docs/guides/your-data

The model page listed GPT-Transcribe at USD 0.0045 per audio minute (about USD 0.27/hour), excluding hosting and tax. Recheck pricing and account access before enabling real requests. Older Whisper/GPT-4o transcription models are marked deprecated in the current guide; the default is `gpt-transcribe`.

## Release checks

1. Run `npm test` and syntax checks.
2. Confirm secure key provisioning, upload access management, hosting cost, and provider spending limits.
3. Verify FFmpeg/FFprobe availability and exact HTTPS frontend/backend origins.
4. Deploy disabled first and verify `/api/capabilities` does not expose secrets.
5. Enable only after approval, then use a short non-sensitive sample with explicit permission to send it to OpenAI.
6. Verify real MP3 and device voice-note uploads, cancellation, unsupported/corrupt/large files, mobile file selection, and cost accounting.
7. Verify the existing microphone feature and draft/export behavior still work on the production HTTPS origin.
