import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_FILE_BYTES, SUPPORTED_EXTENSIONS, DEFAULT_MODEL, DURATION_PADDING_SECONDS, UploadError, validateMetadata, verifyAccessCode, normalizeAudio, transcribeAudio } from './transcription.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const staticFiles = new Map([['/', ['index.html', 'text/html; charset=utf-8']], ['/index.html', ['index.html', 'text/html; charset=utf-8']], ['/upload.js', ['upload.js', 'text/javascript; charset=utf-8']], ['/upload-config.js', ['upload-config.js', 'text/javascript; charset=utf-8']]]);

function json(response, status, data) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(data));
}
function readBody(request, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new UploadError(499, 'cancelled', 'Upload cancelled.'));
    let size = 0, chunks = [], finished = false;
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', aborted); request.removeListener('data', data); request.removeListener('end', end); request.removeListener('error', error); };
    const finish = (failure, body) => { if (finished) return; finished = true; cleanup(); chunks = []; failure ? reject(failure) : resolve(body); };
    const aborted = () => finish(new UploadError(499, 'cancelled', 'Upload cancelled.'));
    const error = () => finish(new UploadError(400, 'upload_interrupted', 'The upload was interrupted.'));
    const data = chunk => { size += chunk.length; if (size > MAX_FILE_BYTES) { request.pause(); finish(new UploadError(413, 'file_too_large', 'The file is larger than 25 MB.')); } else chunks.push(chunk); };
    const end = () => finish(null, Buffer.concat(chunks, size));
    const timer = setTimeout(() => { request.pause(); finish(new UploadError(408, 'upload_timeout', 'The upload took too long. Try a smaller file or a faster connection.')); }, 60_000);
    signal.addEventListener('abort', aborted, { once: true });
    request.on('data', data); request.on('end', end); request.on('error', error);
  });
}
function allowedOrigin(value) {
  try {
    const url = new URL(value);
    return value === url.origin && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
  } catch { return false; }
}

export function createTranscriptionServer(options = {}) {
  const config = {
    enabled: false, apiKey: '', accessCode: '', model: DEFAULT_MODEL,
    allowedOrigins: ['https://transcribe.analyticah.co.za'],
    maxDurationSeconds: 1800, maxDailyAudioSeconds: 3600, maxConcurrent: 1,
    normalize: normalizeAudio, transcribe: transcribeAudio, now: () => Date.now(),
    ...options
  };
  if (!config.allowedOrigins.every(allowedOrigin)) throw new Error('Origins must be exact HTTPS origins or localhost development origins.');
  for (const name of ['maxDurationSeconds', 'maxDailyAudioSeconds', 'maxConcurrent']) {
    if (!Number.isSafeInteger(config[name]) || config[name] <= 0) throw new Error('Invalid upload limit: ' + name);
  }
  const ready = config.enabled && !!config.apiKey && config.accessCode.length >= 24;
  const origins = new Set(config.allowedOrigins);
  let inFlight = 0, usageDay = '', reservedSeconds = 0;
  const attempts = new Map();
  const handle = async (request, response) => {
    // Keep a listener after body-reading cleanup so a socket reset cannot emit
    // an unhandled IncomingMessage error. Never log request bodies or headers.
    request.on('error', () => {});
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-store');
    const origin = request.headers.origin;
    if (origin && origins.has(origin)) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
    }
    let pathname;
    try {
      if (!request.url?.startsWith('/') || request.url.startsWith('//')) throw new Error();
      pathname = new URL(request.url, 'http://local.invalid').pathname;
    } catch { return json(response, 400, { error: 'invalid_url', message: 'Invalid request target.' }); }
    if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
      if (!origins.has(origin)) return json(response, 403, { error: 'origin_not_allowed', message: 'This app origin is not permitted.' });
      response.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-File-Name, X-App-Access-Code', 'Access-Control-Max-Age': '600' });
      return response.end();
    }
    if (request.method === 'GET' && pathname === '/api/capabilities') {
      if (origin && !origins.has(origin)) return json(response, 403, { error: 'origin_not_allowed', message: 'This app origin is not permitted.' });
      return json(response, 200, { enabled: ready, provider: 'OpenAI', model: config.model, requiresAccessCode: true, formats: SUPPORTED_EXTENSIONS, maxFileBytes: MAX_FILE_BYTES, maxDurationSeconds: config.maxDurationSeconds });
    }
    if (request.method === 'GET' && staticFiles.has(pathname)) {
      try {
        const [path, type] = staticFiles.get(pathname);
        const contents = await readFile(join(root, path));
        response.writeHead(200, { 'Content-Type': type }); response.end(contents);
      } catch { json(response, 404, { error: 'not_found', message: 'Page not found.' }); }
      return;
    }
    if (request.method !== 'POST' || pathname !== '/api/transcriptions') return json(response, 404, { error: 'not_found', message: 'Endpoint not found.' });
    if (!origins.has(origin)) return json(response, 403, { error: 'origin_not_allowed', message: 'This app origin is not permitted.' });
    if (!ready) return json(response, 503, { error: 'service_unconfigured', message: 'File transcription has not been enabled by the app owner.' });
    const address = request.socket.remoteAddress || 'unknown';
    const now = config.now();
    for (const [address, entry] of attempts) if (entry.reset <= now) attempts.delete(address);
    if (attempts.size >= 1024 && !attempts.has(address)) return json(response, 429, { error: 'rate_limited', message: 'Too many requests. Try later.' });
    const attempt = attempts.get(address) || { count: 0, reset: now + 60_000 };
    attempt.count++; attempts.set(address, attempt);
    if (attempt.count > 15) return json(response, 429, { error: 'rate_limited', message: 'Too many requests. Wait a minute and try again.' });
    if (!verifyAccessCode(request.headers['x-app-access-code'], config.accessCode)) return json(response, 401, { error: 'invalid_access_code', message: 'The upload access code is incorrect. Ask the app owner for access; do not enter an OpenAI API key.' });
    if (inFlight >= config.maxConcurrent) return json(response, 429, { error: 'busy', message: 'Another recording is being processed. Try again when it finishes.' });
    const controller = new AbortController();
    request.on('aborted', () => controller.abort());
    response.on('close', () => { if (!response.writableEnded) controller.abort(); });
    inFlight++;
    try {
      let filename;
      try { filename = decodeURIComponent(request.headers['x-file-name'] || ''); } catch { throw new UploadError(400, 'invalid_filename', 'The filename could not be read. Rename the recording and try again.'); }
      const length = request.headers['content-length'];
      if (length !== undefined) validateMetadata(filename, Number(length), request.headers['content-type'] || '');
      else validateMetadata(filename, 1, request.headers['content-type'] || '');
      const bytes = await readBody(request, controller.signal);
      const extension = validateMetadata(filename, bytes.length, request.headers['content-type'] || '');
      const audio = await config.normalize(bytes, extension, { signal: controller.signal, maxDurationSeconds: config.maxDurationSeconds });
      if (controller.signal.aborted) throw new UploadError(499, 'cancelled', 'Transcription cancelled.');
      const today = new Date(config.now()).toISOString().slice(0, 10);
      if (usageDay !== today) { usageDay = today; reservedSeconds = 0; }
      const actualDuration = audio.durationSeconds;
      const duration = Math.ceil(actualDuration);
      if (!Number.isFinite(actualDuration) || actualDuration <= 0 || actualDuration > config.maxDurationSeconds + DURATION_PADDING_SECONDS) throw new UploadError(422, 'invalid_duration', 'The recording length could not be validated.');
      if (reservedSeconds + duration > config.maxDailyAudioSeconds) throw new UploadError(429, 'daily_limit', 'This app has reached its daily audio limit. Try tomorrow or contact the app owner.');
      // Reserve before contacting the provider and do not refund on ambiguous
      // failures/cancellation: processing may already be billable.
      reservedSeconds += duration;
      const result = await config.transcribe(audio, { apiKey: config.apiKey, model: config.model, signal: controller.signal });
      if (!controller.signal.aborted) json(response, 200, { text: result.text, durationSeconds: result.durationSeconds });
    } catch (error) {
      const safe = error instanceof UploadError ? error : new UploadError(500, 'processing_error', 'The recording could not be processed. Your existing transcript has not changed.');
      if ([408, 413].includes(safe.status)) response.setHeader('Connection', 'close');
      json(response, safe.status === 499 ? 400 : safe.status, { error: safe.code, message: safe.message });
    } finally { inFlight--; }
  };
  return createServer((request, response) => {
    handle(request, response).catch(() => {
      if (response.destroyed || response.writableEnded) return;
      if (response.headersSent) response.destroy();
      else json(response, 500, { error: 'server_error', message: 'The server could not complete this request.' });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = process.env;
  const server = createTranscriptionServer({
    enabled: env.ENABLE_UPLOADS === 'true', apiKey: env.OPENAI_API_KEY || '', accessCode: env.UPLOAD_ACCESS_CODE || '',
    model: env.TRANSCRIPTION_MODEL || DEFAULT_MODEL,
    allowedOrigins: (env.ALLOWED_ORIGINS || 'https://transcribe.analyticah.co.za,http://localhost:8787').split(',').map(value => value.trim()),
    maxDurationSeconds: Number(env.MAX_AUDIO_SECONDS || 1800), maxDailyAudioSeconds: Number(env.MAX_DAILY_AUDIO_SECONDS || 3600)
  });
  server.requestTimeout = 75_000;
  server.headersTimeout = 15_000;
  server.listen(Number(env.PORT || 8787), env.HOST || '127.0.0.1', () => {
    console.log('Transcription server listening. Uploads remain disabled unless explicitly enabled and configured.');
  });
}
