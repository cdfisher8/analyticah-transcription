import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { createTranscriptionServer } from '../server/app.mjs';
import { validateMetadata, hasAudioSignature, verifyAccessCode, normalizeAudio, transcribeAudio, runMediaProgram, UploadError, MAX_FILE_BYTES, SUPPORTED_EXTENSIONS } from '../server/transcription.mjs';

const accessCode = 'test-only-upload-access-code-123456789';
const origin = 'https://transcribe.analyticah.co.za';
const mp3 = Buffer.from('ID3\u0004\u0000\u0000synthetic-test-audio');
const audio = { bytes: mp3, durationSeconds: 3 };

for (const extension of SUPPORTED_EXTENSIONS) {
  test(`metadata accepts ${extension} case-insensitively`, () => assert.equal(validateMetadata('Voice note.' + extension.toUpperCase(), 100, 'application/octet-stream'), extension));
}
for (const [filename, size, mime, code] of [
  ['voice.exe', 10, '', 'unsupported_format'], ['voice.mp3', 0, '', 'empty_file'],
  ['voice.mp3', MAX_FILE_BYTES + 1, '', 'file_too_large'], ['voice.mp3', 10, 'text/html', 'unsupported_type'],
  ['bad\n.mp3', 10, '', 'invalid_filename'], ['', 10, '', 'invalid_filename']
]) {
  test(`metadata rejects ${code}`, () => assert.throws(() => validateMetadata(filename, size, mime), error => error.code === code));
}
test('a renamed HTML file does not pass signature checks', () => assert.equal(hasAudioSignature(Buffer.from('<html>not audio</html>'), 'mp3'), false));
test('access checks require a separate strong access code', () => {
  assert.equal(verifyAccessCode(accessCode, accessCode), true);
  assert.equal(verifyAccessCode('wrong', accessCode), false);
  assert.equal(verifyAccessCode('', ''), false);
  assert.equal(verifyAccessCode('short', 'short'), false);
  assert.equal(verifyAccessCode('x'.repeat(513), accessCode), false);
});

test('provider request uses fixed HTTPS destination, generic filename, and server-side key', async () => {
  const result = await transcribeAudio(audio, { apiKey: 'test-only-not-a-real-key', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions');
    assert.equal(options.headers.Authorization, 'Bearer test-only-not-a-real-key');
    assert.equal(options.redirect, 'error');
    assert.equal(options.body.get('model'), 'gpt-transcribe');
    assert.equal(options.body.get('file').name, 'recording.mp3');
    assert.equal(options.body.get('file').type, 'audio/mpeg');
    return new Response(JSON.stringify({ text: '  Synthetic transcript  ' }), { status: 200 });
  } });
  assert.deepEqual(result, { text: 'Synthetic transcript', durationSeconds: 3 });
});
for (const [status, code] of [[401,'provider_configuration'],[403,'provider_configuration'],[429,'provider_limit'],[400,'provider_rejected_audio'],[413,'provider_rejected_audio'],[500,'provider_error']]) {
  test(`provider ${status} becomes a safe error without leaking its body`, async () => {
    await assert.rejects(transcribeAudio(audio, {apiKey:'test-key', fetchImpl:async()=>new Response('private diagnostic', {status})}), error => error.code === code && !error.message.includes('private'));
  });
}
test('missing provider key makes no request', async () => {
  let called = false;
  await assert.rejects(transcribeAudio(audio, {fetchImpl:async()=>{called=true;}}), error=>error.code==='service_unconfigured');
  assert.equal(called, false);
});
test('network failures are not automatically retried or presented as definite non-billing', async () => {
  let calls=0;
  await assert.rejects(transcribeAudio(audio, {apiKey:'test', fetchImpl:async()=>{calls++; throw new Error('private details');}}), error=>error.code==='provider_timeout' && /billed/.test(error.message));
  assert.equal(calls,1);
});
for (const text of ['not json', 'null', '{}', '{"text":123}', JSON.stringify({text:'x'.repeat(2_000_001)})]) {
  test('invalid provider response is rejected', async () => {
    await assert.rejects(transcribeAudio(audio,{apiKey:'test',fetchImpl:async()=>new Response(text,{status:200})}), error=>error.code==='invalid_response');
  });
}

test('actual FFmpeg can normalize the advertised container/codec fixtures', async t => {
  const dir=await mkdtemp(join(tmpdir(),'analyticah-format-test-'));
  const fixtures=[['mp3',['-c:a','libmp3lame']],['m4a',['-c:a','aac']],['mp4',['-c:a','aac']],['wav',['-c:a','pcm_s16le']],['webm',['-c:a','libopus']],['ogg',['-c:a','libvorbis']],['oga',['-c:a','libvorbis']],['opus',['-c:a','libopus']],['flac',['-c:a','flac']],['aac',['-c:a','aac','-f','adts']],['mpga',['-c:a','mp2','-f','mp2']],['mpeg',['-c:a','mp2','-f','mpeg']]];
  try {
    for (const [extension,args] of fixtures) {
      await t.test(extension, async()=>{
        const file=join(dir,'tone.'+extension);
        await runMediaProgram('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','sine=frequency=440:duration=0.2',...args,'-y',file]);
        const bytes=await readFile(file);
        assert.equal(hasAudioSignature(bytes,extension),true);
        const normalized=await normalizeAudio(bytes,extension);
        assert.ok(normalized.bytes.length>0); assert.ok(normalized.durationSeconds>0);
        assert.equal(normalized.type,'audio/mpeg'); assert.equal(normalized.filename,'recording.mp3');
      });
    }
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('too-long recording is rejected before conversion or provider call', async () => {
  let calls=0;
  await assert.rejects(normalizeAudio(mp3,'mp3',{maxDurationSeconds:60,run:async()=>{calls++; return JSON.stringify({streams:[{codec_type:'audio'}],format:{duration:'61'}});}}), error=>error.code==='audio_too_long');
  assert.equal(calls,1);
});
test('video-only or unmeasurable media is rejected', async()=>{
  for(const metadata of [{streams:[{codec_type:'video'}],format:{duration:1}},{streams:[{codec_type:'audio'}],format:{duration:'N/A'}}]) {
    await assert.rejects(normalizeAudio(mp3,'mp3',{run:async()=>JSON.stringify(metadata)}), error=>['no_audio','unknown_duration'].includes(error.code));
  }
});
test('decoder cancellation does not run a subprocess', async()=>{
  const controller=new AbortController(); controller.abort();
  await assert.rejects(runMediaProgram('ffprobe',['-version'],{signal:controller.signal}), error=>error.code==='cancelled');
});

async function service(t,options={}) {
  const calls={normalize:0,provider:0};
  const server=createTranscriptionServer({enabled:true,apiKey:'test-only-not-real',accessCode,allowedOrigins:[origin],
    normalize:async()=>{calls.normalize++;return {...audio};},transcribe:async()=>{calls.provider++;return {text:'A test transcript.',durationSeconds:3};},...options});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base='http://127.0.0.1:'+server.address().port;
  return {server,calls,base,send:async(extra={})=>fetch(base+'/api/transcriptions',{method:'POST',body:mp3,headers:{Origin:origin,'Content-Type':'audio/mpeg','X-File-Name':'test.mp3','X-App-Access-Code':accessCode,...extra}})};
}
test('HTTP upload returns a transcript and never exposes keys',async t=>{
  const s=await service(t);const response=await s.send();assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{text:'A test transcript.',durationSeconds:3});
  assert.equal(s.calls.provider,1); assert.equal(response.headers.get('access-control-allow-origin'),origin);
  assert.equal(response.headers.get('cache-control'),'no-store');
});
test('capabilities reveal no secrets and default server refuses paid use',async t=>{
  const s=await service(t,{enabled:false});const response=await fetch(s.base+'/api/capabilities');
  const body=await response.text();assert.equal(JSON.parse(body).enabled,false);
  assert.ok(!body.includes(accessCode));assert.ok(!body.includes('test-only-not-real'));
  assert.equal((await s.send()).status,503);assert.equal(s.calls.provider,0);
});
test('unauthorized access and foreign origins never decode or send audio',async t=>{
  const s=await service(t);
  assert.equal((await s.send({'X-App-Access-Code':'wrong'})).status,401);
  assert.equal((await s.send({Origin:'https://untrusted.example'})).status,403);
  assert.equal((await s.send({Origin:''})).status,403);
  assert.equal(s.calls.normalize,0);assert.equal(s.calls.provider,0);
});
test('wildcard and insecure allowed-origin configuration is rejected',()=>{
  for(const value of ['*','http://example.com','https://example.com/path','null']) assert.throws(()=>createTranscriptionServer({allowedOrigins:[value]}));
});
test('malformed filenames and oversized uploads fail before media decoding',async t=>{
  const s=await service(t);assert.equal((await s.send({'X-File-Name':'%zz'})).status,400);
  assert.equal((await s.send({'X-File-Name':'fake.exe'})).status,415);
  const response=await fetch(s.base+'/api/transcriptions',{method:'POST',body:Buffer.alloc(MAX_FILE_BYTES+1),headers:{Origin:origin,'Content-Type':'audio/mpeg','X-File-Name':'big.mp3','X-App-Access-Code':accessCode}});
  assert.equal(response.status,413);assert.equal(s.calls.normalize,0);
});
test('concurrency limit prevents duplicate in-flight provider requests',async t=>{
  let release;const waiting=new Promise(resolve=>{release=resolve;});
  const s=await service(t,{transcribe:async()=>{await waiting;return {text:'Done',durationSeconds:3};}});
  const first=s.send();
  while(s.calls.normalize===0) await new Promise(setImmediate);
  assert.equal((await s.send()).status,429);release();assert.equal((await first).status,200);
});
test('audio allowance is reserved even on ambiguous provider failure',async t=>{
  let calls=0;const s=await service(t,{maxDailyAudioSeconds:3,transcribe:async()=>{calls++;throw new UploadError(504,'provider_timeout','May have been billed.');}});
  assert.equal((await s.send()).status,504);const second=await s.send();assert.equal(second.status,429);
  assert.equal((await second.json()).error,'daily_limit');assert.equal(calls,1);
});
test('invalid media errors are safe and cleanup frees the concurrency slot',async t=>{
  let decode=0;const s=await service(t,{normalize:async()=>{if(++decode===1)throw new UploadError(422,'invalid_audio','Invalid recording.');return {...audio};}});
  assert.equal((await s.send()).status,422);assert.equal((await s.send()).status,200);
});
test('CORS preflight authorizes only required headers for exact origin',async t=>{
  const s=await service(t);const good=await fetch(s.base+'/api/transcriptions',{method:'OPTIONS',headers:{Origin:origin}});
  assert.equal(good.status,204);assert.equal(good.headers.get('access-control-allow-origin'),origin);
  assert.equal(good.headers.get('access-control-allow-credentials'),null);
  assert.equal((await fetch(s.base+'/api/transcriptions',{method:'OPTIONS',headers:{Origin:'https://attacker.example'}})).status,403);
});
test('static server does not expose env or source paths',async t=>{
  const s=await service(t);for(const path of ['/.env.local','/.git/config','/server/app.mjs','/package.json'])assert.equal((await fetch(s.base+path)).status,404);
});

test('malformed raw HTTP targets return 400 without crashing or calling the provider', async t => {
  const s = await service(t);
  for (const path of ['//[', '//untrusted.example/api/transcriptions', 'http://[']) {
    const result = await new Promise((resolve, reject) => {
      const request = httpRequest({hostname:'127.0.0.1', port:s.server.address().port, path, method:'GET'}, response => {
        let text = ''; response.setEncoding('utf8'); response.on('data', chunk => text += chunk);
        response.on('end', () => resolve({status:response.statusCode, body:JSON.parse(text)}));
      });
      request.on('error', reject); request.end();
    });
    assert.equal(result.status, 400); assert.equal(result.body.error, 'invalid_url');
    assert.equal((await fetch(s.base + '/api/capabilities')).status, 200);
  }
  assert.equal(s.calls.normalize, 0); assert.equal(s.calls.provider, 0);
});

test('forged MP3 Info/Xing duration cannot bypass decoded duration limits or accounting', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'analyticah-forged-duration-test-'));
  try {
    const original = join(folder, 'original.mp3');
    await runMediaProgram('ffmpeg', ['-nostdin','-v','error','-f','lavfi','-i','sine=frequency=440:duration=12','-c:a','libmp3lame','-y',original]);
    const bytes = await readFile(original);
    let marker = bytes.indexOf(Buffer.from('Info'));
    if (marker < 0) marker = bytes.indexOf(Buffer.from('Xing'));
    assert.ok(marker >= 0, 'Generated fixture must contain an Info or Xing header');
    assert.ok(bytes.readUInt32BE(marker + 4) & 1, 'Frame-count flag must be present');
    bytes.writeUInt32BE(20, marker + 8);
    const forged = join(folder, 'forged.mp3'); await writeFile(forged, bytes);
    const metadata = JSON.parse(await runMediaProgram('ffprobe', ['-v','error','-show_entries','format=duration','-of','json',forged]));
    assert.ok(Number(metadata.format.duration) < 1, 'Forged input must falsely claim under one second');
    await t.test('over-limit decoded recording is rejected, not silently truncated', async () => {
      await assert.rejects(normalizeAudio(bytes, 'mp3', {maxDurationSeconds:5}), error => error.code === 'audio_too_long');
    });
    await t.test('accepted recording returns its normalized duration, not forged input duration', async () => {
      const normalized = await normalizeAudio(bytes, 'mp3', {maxDurationSeconds:20});
      assert.ok(normalized.durationSeconds >= 11.9 && normalized.durationSeconds < 12.2);
      const output = join(folder, 'normalized.mp3'); await writeFile(output, normalized.bytes);
      const measured = JSON.parse(await runMediaProgram('ffprobe', ['-v','error','-show_entries','format=duration','-of','json',output]));
      assert.equal(normalized.durationSeconds, Number(measured.format.duration));
    });
    await t.test('HTTP daily allowance accounts decoded duration before contacting provider', async () => {
      let providerCalls = 0;
      const s = await service(t, {maxDurationSeconds:20, maxDailyAudioSeconds:5, normalize:normalizeAudio,
        transcribe:async () => { providerCalls++; return {text:'Not expected', durationSeconds:12}; }});
      const response = await fetch(s.base + '/api/transcriptions', {method:'POST',body:bytes,
        headers:{Origin:origin,'Content-Type':'audio/mpeg','X-File-Name':'forged.mp3','X-App-Access-Code':accessCode}});
      assert.equal(response.status, 429); assert.equal((await response.json()).error, 'daily_limit');
      assert.equal(providerCalls, 0);
    });
  } finally { await rm(folder, {recursive:true, force:true}); }
});

test('cancelled decoder terminates work and reports cancellation', {timeout:3000}, async () => {
  const controller = new AbortController();
  const running = runMediaProgram(process.execPath, ['-e','setInterval(() => {}, 1000)'], {signal:controller.signal});
  controller.abort();
  await assert.rejects(running, error => error.code === 'cancelled');
});

test('normalization cleans temporary files after decoder rejection', async () => {
  let folder;
  await assert.rejects(normalizeAudio(mp3, 'mp3', {run:async (command,args,options) => {
    folder = options.cwd;
    throw new UploadError(422, 'invalid_audio', 'Synthetic decoder failure');
  }}), error => error.code === 'invalid_audio');
  assert.ok(folder); await assert.rejects(stat(folder), error => error.code === 'ENOENT');
});

test('HTTP cancellation aborts provider work and releases the concurrency slot without refunding usage', {timeout:5000}, async t => {
  let announce, cancelled;
  const started = new Promise(resolve => announce = resolve);
  const aborted = new Promise(resolve => cancelled = resolve);
  let providerCalls = 0;
  const s = await service(t, {maxDailyAudioSeconds:3, transcribe:async (audio, {signal}) => {
    providerCalls++; announce();
    await new Promise((resolve,reject) => signal.addEventListener('abort', () => {
      cancelled(); reject(new UploadError(499, 'cancelled', 'Cancelled'));
    }, {once:true}));
  }});
  const request = httpRequest({hostname:'127.0.0.1',port:s.server.address().port,path:'/api/transcriptions',method:'POST',
    headers:{Origin:origin,'Content-Type':'audio/mpeg','Content-Length':mp3.length,'X-File-Name':'test.mp3','X-App-Access-Code':accessCode}});
  request.on('error', () => {}); request.end(mp3);
  await started; request.destroy(); await aborted; await new Promise(setImmediate);
  const response = await s.send(); assert.equal(response.status, 429);
  assert.equal((await response.json()).error, 'daily_limit'); assert.equal(providerCalls, 1);
});
