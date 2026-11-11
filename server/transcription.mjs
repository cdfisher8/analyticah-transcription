import { createHash, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';

export const MAX_FILE_BYTES = 25_000_000;
export const SUPPORTED_EXTENSIONS = ['mp3', 'm4a', 'wav', 'webm', 'mp4', 'mpeg', 'mpga', 'ogg', 'oga', 'opus', 'flac', 'aac'];
export const DEFAULT_MODEL = 'gpt-transcribe';
export const DURATION_PADDING_SECONDS = 0.1;
export const OPENAI_TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions';

export class UploadError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export function validateMetadata(filename, size, mime = '') {
  if (typeof filename !== 'string' || !filename || filename.length > 255 || /[\u0000-\u001f\u007f]/.test(filename)) {
    throw new UploadError(400, 'invalid_filename', 'Choose a file with a valid filename.');
  }
  const extension = extname(filename).slice(1).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    throw new UploadError(415, 'unsupported_format', 'This format is not supported. Choose MP3, M4A, WAV, WebM, OGG/Opus, FLAC, AAC, or an audio MP4/MPEG file.');
  }
  if (!Number.isSafeInteger(size) || size <= 0) throw new UploadError(400, 'empty_file', 'The selected file is empty.');
  if (size > MAX_FILE_BYTES) throw new UploadError(413, 'file_too_large', 'The file is larger than 25 MB. Export a smaller audio file or split the recording.');
  const type = mime.split(';')[0].trim().toLowerCase();
  if (type && !/^(audio\/[a-z0-9.+-]+|video\/(mp4|mpeg|webm)|application\/(octet-stream|ogg))$/.test(type)) {
    throw new UploadError(415, 'unsupported_type', 'This does not appear to be an audio file. Export it as MP3 or M4A.');
  }
  return extension;
}

export function verifyAccessCode(supplied, expected) {
  if (!expected || expected.length < 24 || typeof supplied !== 'string' || supplied.length > 512) return false;
  return timingSafeEqual(createHash('sha256').update(supplied).digest(), createHash('sha256').update(expected).digest());
}

export function hasAudioSignature(bytes, extension) {
  if (bytes.length < 4) return false;
  const ascii = (offset, length) => bytes.subarray(offset, offset + length).toString('ascii');
  const mpegFrame = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  switch (extension) {
    case 'wav': return bytes.length >= 12 && ['RIFF', 'RF64'].includes(ascii(0, 4)) && ascii(8, 4) === 'WAVE';
    case 'mp4': case 'm4a': return bytes.length >= 12 && ascii(4, 4) === 'ftyp';
    case 'ogg': case 'oga': case 'opus': return ascii(0, 4) === 'OggS';
    case 'flac': return ascii(0, 4) === 'fLaC';
    case 'webm': return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
    case 'aac': return mpegFrame || ascii(0, 3) === 'ID3';
    case 'mp3': case 'mpga': return mpegFrame || ascii(0, 3) === 'ID3';
    case 'mpeg': return mpegFrame || ascii(0, 3) === 'ID3' || (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0xba);
    default: return false;
  }
}

export function runMediaProgram(command, args, { signal, timeoutMs = 20_000, cwd } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new UploadError(499, 'cancelled', 'Transcription cancelled.'));
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH || '', LANG: 'C' } });
    let output = '', outputBytes = 0, settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel);
      if (error) reject(error); else resolve(result);
    };
    const cancel = () => { child.kill('SIGKILL'); finish(new UploadError(499, 'cancelled', 'Transcription cancelled.')); };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(new UploadError(422, 'decode_timeout', 'The recording took too long to decode. Try a shorter MP3 or M4A file.')); }, timeoutMs);
    signal?.addEventListener('abort', cancel, { once: true });
    child.stdout.on('data', chunk => {
      outputBytes += chunk.length;
      if (outputBytes > 128_000) { child.kill('SIGKILL'); finish(new UploadError(422, 'invalid_audio', 'The audio file could not be read.')); }
      else output += chunk.toString('utf8');
    });
    // Discard decoder diagnostics: they can contain uploaded filenames or tags.
    child.stderr.on('data', () => {});
    child.on('error', () => finish(new UploadError(503, 'decoder_unavailable', 'Audio processing is not configured on the server.')));
    child.on('close', code => finish(code === 0 ? null : new UploadError(422, 'invalid_audio', 'The file is damaged or contains no readable audio. Export it again as MP3 or M4A.'), output));
  });
}

export async function normalizeAudio(bytes, extension, { signal, maxDurationSeconds = 1800, ffprobe = 'ffprobe', ffmpeg = 'ffmpeg', run = runMediaProgram } = {}) {
  if (!hasAudioSignature(bytes, extension)) throw new UploadError(415, 'invalid_audio', 'The file contents do not match a supported audio format. Renaming a file does not convert it.');
  const folder = await mkdtemp(join(tmpdir(), 'analyticah-audio-'));
  const input = join(folder, 'recording.' + extension);
  const output = join(folder, 'normalized.mp3');
  try {
    await writeFile(input, bytes, { flag: 'wx', mode: 0o600 });
    const raw = await run(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=duration:stream=codec_type,duration', '-of', 'json', input], { signal, cwd: folder });
    let metadata;
    try { metadata = JSON.parse(raw); } catch { throw new UploadError(422, 'invalid_audio', 'The file could not be inspected.'); }
    const audio = metadata?.streams?.find(stream => stream.codec_type === 'audio');
    if (!audio) throw new UploadError(422, 'no_audio', 'No audio track was found in this file.');
    const duration = Number(metadata.format?.duration ?? audio.duration);
    if (!Number.isFinite(duration) || duration <= 0) throw new UploadError(422, 'unknown_duration', 'The recording length could not be checked. Export it as MP3 or M4A and try again.');
    if (duration > maxDurationSeconds) throw new UploadError(413, 'audio_too_long', `This recording exceeds the ${Math.floor(maxDurationSeconds / 60)}-minute limit. Split it into shorter files.`);
    await run(ffmpeg, ['-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', input, '-map', '0:a:0', '-vn', '-sn', '-dn', '-map_metadata', '-1', '-ac', '1', '-ar', '32000', '-c:a', 'libmp3lame', '-b:a', '64k', '-t', String(maxDurationSeconds + 1), '-fs', String(MAX_FILE_BYTES), '-threads', '1', '-y', output], { signal, timeoutMs: 90_000, cwd: folder });
    const info = await stat(output);
    if (!info.size || info.size >= MAX_FILE_BYTES) throw new UploadError(413, 'converted_too_large', 'The converted recording is too large. Split it into shorter files.');
    // Input headers (for example MP3 Xing/Info frame counts) are untrusted.
    // Measure the newly encoded audio, rather than billing or limiting by the
    // supplied metadata. The +1 second decode window exposes overlong input.
    const normalizedRaw = await run(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=duration', '-of', 'json', output], { signal, cwd: folder });
    let normalizedDuration;
    try { normalizedDuration = Number(JSON.parse(normalizedRaw).format?.duration); } catch {}
    if (!Number.isFinite(normalizedDuration) || normalizedDuration <= 0) throw new UploadError(422, 'unknown_duration', 'The converted recording length could not be verified.');
    if (normalizedDuration > maxDurationSeconds + DURATION_PADDING_SECONDS) throw new UploadError(413, 'audio_too_long', `The decoded recording exceeds the ${Math.floor(maxDurationSeconds / 60)}-minute limit. Split it into shorter files.`);
    return { bytes: await readFile(output), durationSeconds: normalizedDuration, type: 'audio/mpeg', filename: 'recording.mp3' };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

export async function transcribeAudio(audio, { apiKey, model = DEFAULT_MODEL, fetchImpl = fetch, signal } = {}) {
  if (!apiKey) throw new UploadError(503, 'service_unconfigured', 'File transcription is not configured yet.');
  const form = new FormData();
  form.set('model', model);
  form.set('file', new Blob([audio.bytes], { type: 'audio/mpeg' }), 'recording.mp3');
  let response;
  try {
    response = await fetchImpl(OPENAI_TRANSCRIPTIONS_URL, {
      method: 'POST', headers: { Authorization: 'Bearer ' + apiKey }, body: form,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
      redirect: 'error'
    });
  } catch (error) {
    if (signal?.aborted) throw new UploadError(499, 'cancelled', 'Transcription cancelled.');
    throw new UploadError(504, 'provider_timeout', 'The transcription service did not respond. A request may already have been billed; check before retrying.');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    if ([401, 403].includes(response.status)) throw new UploadError(503, 'provider_configuration', 'The transcription service needs attention from the app owner.');
    if (response.status === 429) throw new UploadError(429, 'provider_limit', 'The transcription service has reached a usage or rate limit. Try later or contact the app owner.');
    if ([400, 413, 415, 422].includes(response.status)) throw new UploadError(422, 'provider_rejected_audio', 'The transcription service could not read this recording. Try another supported export.');
    throw new UploadError(502, 'provider_error', 'The transcription service is temporarily unavailable.');
  }
  let result;
  try { result = await response.json(); } catch { throw new UploadError(502, 'invalid_response', 'The transcription service returned an unreadable response.'); }
  if (!result || typeof result.text !== 'string' || result.text.length > 2_000_000) throw new UploadError(502, 'invalid_response', 'The transcription service returned an invalid response.');
  return { text: result.text.trim(), durationSeconds: audio.durationSeconds };
}
