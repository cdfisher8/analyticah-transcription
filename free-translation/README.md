# Free translation prototype — evaluation only

Goal: English ↔ Afrikaans and English ↔ isiZulu, without a paid translation API.

## Status
The production GitHub Pages site remains unchanged. This folder is a prototype and is not deployed. No translation model has been downloaded or accuracy-tested yet.

## Model evaluation
1. Check AfriNLLB's exact model card, supported language codes, licence and commercial restrictions before distributing or deploying it.
2. Confirm English, Afrikaans and isiZulu directions with sample sentences, including code switching. Do not assume every direction is supported.
3. Check download size, RAM requirements and latency on a typical Android Chrome phone and Windows PC.
4. Compare against NLLB-200 as a fallback. NLLB-200 model weights may have non-commercial restrictions: verify before use in an AnalyticaH product.
5. If a model runs only on a server, hosting is not automatically free; obtain permission before enabling costs.

## Acceptance test
- Translate at least 20 short and 20 longer sentences per direction, reviewed by fluent speakers.
- Preserve numbers, names, punctuation and original transcript.
- Confirm no network API key or private transcript is committed to GitHub.
- Confirm a real translation appears in the separate Translation window.
- Confirm microphone transcription still works when translation is unavailable.

## Deployment boundary
The existing website has a translation window but no active translation engine. Do not label it working until the chosen model is running, connected and tested. No paid services should be activated without explicit approval.
