const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const draftKey = 'analyticah-transcription-only-v1';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function mediaStream() {
  const track = { stopped: 0, onended: null, stop() { this.stopped++; } };
  return { track, getTracks: () => [track] };
}
function app(options = {}) {
  const elements = {};
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) {
    elements[id] = {
      value: '', textContent: '', disabled: false, hidden: false, style: {}, attributes: {}, events: {},
      setAttribute(name, value) { this.attributes[name] = String(value); },
      addEventListener(name, fn) { this.events[name] = fn; },
      select() { this.selected = true; }, scrollTop: 0, scrollHeight: 10
    };
  }
  elements.lang.value = 'en-ZA';
  elements.audiotype.value = 'speech';
  elements.stop.disabled = true;
  const timers = new Map(), frames = new Map();
  const downloads = [], blobs = [], revoked = [], clipboardWrites = [];
  const windowEvents = {}, documentEvents = {}, contexts = [], recognitions = [], streams = [];
  const storage = new Map(Object.entries(options.storage || {}));
  let clockId = 0, requests = 0;
  class AudioContext {
    constructor() { if (options.audioConstructorError) throw new Error('Audio unavailable'); this.closed = 0; contexts.push(this); }
    resume() { return options.resume ? options.resume(contexts.length) : Promise.resolve(); }
    close() { this.closed++; if (options.closeThrow) throw new Error('Close failed'); return options.closeReject ? Promise.reject(new Error('Close rejected')) : Promise.resolve(); }
    createAnalyser() { if (options.analyserError) throw new Error('Analyser failed'); let reads = 0; return { fftSize: 2048, getByteTimeDomainData: values => { if (++reads === options.meterErrorAt) throw new Error('Meter failed'); values.fill(options.sampleValue ?? 128); } }; }
    createMediaStreamSource() { if (options.sourceError) throw new Error('Source failed'); return { connect() { if (options.connectError) throw new Error('Connect failed'); } }; }
  }
  class Recognition {
    constructor() {
      if (options.constructorError) throw new Error('Unavailable');
      this.starts = 0; this.stops = 0; this.aborts = 0; recognitions.push(this);
    }
    start() {
      this.starts++;
      if (options.startError) throw new Error('Start failed');
      this.onstart?.();
    }
    stop() { this.stops++; if (options.stopError) throw new Error('Stop failed'); }
    abort() { this.aborts++; if (options.abortError) throw new Error('Abort failed'); }
  }
  const navigator = {
    mediaDevices: { getUserMedia() {
      requests++;
      if (options.getUserMedia) return options.getUserMedia(requests);
      const stream = mediaStream(); streams.push(stream); return Promise.resolve(stream);
    } },
    clipboard: { writeText: async text => { clipboardWrites.push(text); } }
  };
  if (options.missingMedia) delete navigator.mediaDevices;
  if (options.missingGetUserMedia) delete navigator.mediaDevices.getUserMedia;
  if (options.missingClipboard) delete navigator.clipboard;
  if (options.copyFailure) navigator.clipboard.writeText = async () => { throw new Error('Blocked'); };
  const window = {
    isSecureContext: options.secure !== false,
    AudioContext: options.noAudioContext ? undefined : AudioContext,
    SpeechRecognition: options.noSpeech ? undefined : Recognition,
    addEventListener(name, fn) { windowEvents[name] = fn; }
  };
  const document = {
    visibilityState: 'visible',
    getElementById: id => elements[id],
    addEventListener(name, fn) { documentEvents[name] = fn; },
    execCommand: () => { if (options.copyFallbackThrows) throw new Error('Copy failed'); return options.copyFallback === true; },
    body: { appendChild(link) { link.attached = true; } },
    createElement: () => { const link = { click() { if (options.downloadClickError) throw new Error('Download blocked'); this.clicked = true; }, remove() { this.removed = true; } }; downloads.push(link); return link; }
  };
  if (options.policyBlocked) document.permissionsPolicy = { allowsFeature: () => false };
  const context = vm.createContext({
    window, document, navigator, Uint8Array, Date, Math, JSON, Promise, Blob,
    URL: { createObjectURL: blob => { if (options.objectUrlError) throw new Error('Blob URL unavailable'); blobs.push(blob); return 'blob:test'; }, revokeObjectURL(url) { revoked.push(url); } },
    localStorage: {
      getItem: key => { if (options.storageReadFailure) throw new Error('Storage denied'); return storage.get(key) || null; },
      setItem: (key, value) => {
        if (options.storageFailure) throw new Error('QuotaExceeded');
        storage.set(key, value);
      }
    },
    confirm: () => options.confirm !== false,
    setTimeout: (fn, delay) => { const id = ++clockId; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => { const id = ++clockId; frames.set(id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id)
  });
  vm.runInContext(source, context);
  return {
    elements, window, document, navigator, contexts, recognitions, streams, storage, timers, frames, downloads, blobs, revoked, clipboardWrites,
    runFrame() { const [id, fn] = frames.entries().next().value; frames.delete(id); fn(); },
    requests: () => requests,
    start: () => elements.start.onclick(), stop: () => elements.stop.onclick(),
    emitWindow: name => windowEvents[name](),
    emitDocument: name => documentEvents[name](),
    runTimer() {
      const [id, timer] = timers.entries().next().value;
      timers.delete(id); timer.fn(); return timer.delay;
    },
    draft: () => JSON.parse(storage.get(draftKey)),
    result(recognition, text, final = true) {
      const result = [{ transcript: text }]; result.isFinal = final;
      recognition.onresult?.({ resultIndex: 0, results: [result] });
    }
  };
}

for (const scenario of [
  { options: { secure: false, missingMedia: true }, expected: /requires HTTPS/ },
  { options: { missingMedia: true }, expected: /unavailable in this browser/ },
  { options: { policyBlocked: true }, expected: /hosting page/ }
]) {
  test(`startup preflight: ${scenario.expected}`, async () => {
    const a = app(scenario.options);
    assert.match(a.elements['microphone-help'].textContent, scenario.expected);
    await a.start();
    assert.equal(a.requests(), 0);
    assert.equal(a.elements.start.disabled, false);
    assert.equal(a.elements.stop.disabled, true);
  });
}
for (const [name, expected] of [
  ['NotAllowedError', /permission was blocked/],
  ['NotFoundError', /No microphone was found/],
  ['NotReadableError', /could not be opened/],
  ['AbortError', /interrupted/]
]) {
  test(`microphone error: ${name}`, async () => {
    const a = app({ getUserMedia: async () => { throw Object.assign(new Error(), { name }); } });
    await a.start();
    assert.match(a.elements['microphone-help'].textContent, expected);
    assert.equal(a.elements.start.disabled, false);
    assert.equal(a.elements.stop.disabled, true);
  });
}
test('successful start locks language and ignores repeated clicks', async () => {
  const a = app();
  const starting = a.start(); await a.start(); await starting;
  assert.equal(a.requests(), 1);
  assert.equal(a.recognitions.length, 1);
  assert.equal(a.elements.status.textContent, 'Listening…');
  assert.equal(a.elements.lang.disabled, true);
  a.stop();
  assert.equal(a.streams[0].track.stopped, 1);
  assert.equal(a.contexts[0].closed, 1);
  assert.equal(a.elements.lang.disabled, false);
  assert.equal(a.elements.start.disabled, false);
});
test('a cancelled microphone request releases its stream without stopping a newer session', async () => {
  const request = deferred(), oldStream = mediaStream(), newStream = mediaStream();
  const a = app({ getUserMedia: count => count === 1 ? request.promise : Promise.resolve(newStream) });
  const oldStart = a.start(); a.stop(); await a.start();
  request.resolve(oldStream); await oldStart;
  assert.equal(oldStream.track.stopped, 1);
  assert.equal(newStream.track.stopped, 0);
  assert.equal(a.elements.status.textContent, 'Listening…');
});
test('a rejected stale request cannot change a newer session status', async () => {
  const request = deferred();
  const a = app({ getUserMedia: count => count === 1 ? request.promise : Promise.resolve(mediaStream()) });
  const oldStart = a.start(); a.stop(); await a.start();
  request.reject(Object.assign(new Error(), { name: 'NotAllowedError' })); await oldStart;
  assert.equal(a.elements.status.textContent, 'Listening…');
  assert.equal(a.elements.stop.disabled, false);
});
test('a cancelled AudioContext resume cannot close a newer context', async () => {
  const resume = deferred();
  const a = app({ resume: count => count === 1 ? resume.promise : Promise.resolve() });
  const oldStart = a.start(); await new Promise(setImmediate); a.stop(); await a.start();
  resume.resolve(); await oldStart;
  assert.equal(a.contexts[0].closed, 1);
  assert.equal(a.contexts[1].closed, 0);
  assert.equal(a.streams[1].track.stopped, 0);
  assert.equal(a.elements.status.textContent, 'Listening…');
});
for (const options of [{ noSpeech: true }, { constructorError: true }, { startError: true }]) {
  test(`unsupported or failed recognition releases microphone: ${JSON.stringify(options)}`, async () => {
    const a = app(options); await a.start();
    assert.equal(a.streams[0].track.stopped, 1);
    assert.equal(a.contexts[0].closed, 1);
    assert.equal(a.elements.start.disabled, false);
    assert.equal(a.elements.stop.disabled, true);
  });
}
test('recognition can work without a level-meter API', async () => {
  const a = app({ noAudioContext: true }); await a.start();
  assert.equal(a.elements.status.textContent, 'Listening…');
  assert.match(a.elements.quality.textContent, /level meter unavailable/);
});
test('fatal speech errors release audio and allow a fresh start', async () => {
  const a = app(); await a.start();
  a.recognitions[0].onerror({ error: 'not-allowed' });
  assert.equal(a.streams[0].track.stopped, 1);
  assert.equal(a.recognitions[0].aborts, 1);
  assert.equal(a.elements.start.disabled, false);
  assert.match(a.elements.status.textContent, /permission was blocked/);
  await a.start();
  assert.equal(a.elements.status.textContent, 'Listening…');
});
test('network failures retry with delays and stop after three retries', async () => {
  const a = app(); await a.start(); const recognition = a.recognitions[0];
  for (let attempt = 1; attempt <= 3; attempt++) {
    recognition.onerror({ error: 'network' }); recognition.onend();
    assert.equal(a.runTimer(), attempt * 1000);
  }
  recognition.onerror({ error: 'network' });
  assert.equal(recognition.starts, 4);
  assert.equal(a.streams[0].track.stopped, 1);
  assert.match(a.elements.status.textContent, /could not reconnect/);
  assert.equal(a.timers.size, 0);
});
test('normal recognition ends restart once, and Stop cancels pending restarts', async () => {
  const a = app(); await a.start(); const recognition = a.recognitions[0];
  recognition.onend(); assert.equal(a.runTimer(), 500);
  assert.equal(recognition.starts, 2);
  recognition.onend(); a.stop();
  // Only the bounded final-result cleanup remains.
  assert.equal(a.timers.size, 1); a.runTimer();
  assert.equal(recognition.starts, 2);
});
test('final speech is saved immediately; interim speech is not persisted', async () => {
  const a = app(); await a.start();
  a.result(a.recognitions[0], 'interim words', false);
  assert.equal(a.storage.has(draftKey), false);
  a.result(a.recognitions[0], 'Final words');
  assert.equal(a.draft().transcript, 'Final words ');
  assert.equal(a.timers.size, 0);
});
test('Stop accepts final results but old results cannot affect a new session', async () => {
  const a = app(); await a.start(); const old = a.recognitions[0];
  a.stop(); a.result(old, 'Last words');
  assert.equal(a.draft().transcript, 'Last words ');
  await a.start(); a.result(old, 'Should be ignored');
  assert.equal(a.draft().transcript, 'Last words ');
});
test('Clear after Stop ignores a late final result', async () => {
  const a = app(); await a.start(); const old = a.recognitions[0];
  a.stop(); a.elements.clear.onclick(); a.result(old, 'Should stay cleared');
  assert.equal(a.draft().transcript, '');
});
test('tab close and tab hiding flush pending manual edits', () => {
  const a = app(); a.elements.transcript.value = 'Edited before closing';
  a.elements.transcript.events.input(); a.emitWindow('pagehide');
  assert.equal(a.draft().transcript, 'Edited before closing');
  assert.equal(a.timers.size, 0);
  a.elements.transcript.value = 'Edited before hiding';
  a.document.visibilityState = 'hidden'; a.emitDocument('visibilitychange');
  assert.equal(a.draft().transcript, 'Edited before hiding');
});
test('microphone disconnect releases audio and restores controls', async () => {
  const a = app(); await a.start(); a.streams[0].track.onended();
  assert.equal(a.elements.start.disabled, false);
  assert.match(a.elements.status.textContent, /disconnected/);
});
test('blocked local storage offers file backup without breaking speech', async () => {
  const a = app({ storageFailure: true }); await a.start();
  a.result(a.recognitions[0], 'Still transcribing');
  assert.equal(a.elements.transcript.value, 'Still transcribing ');
  assert.match(a.elements.saved.textContent, /Save .txt/);
});
test('malformed saved preferences do not erase defaults', () => {
  const a = app({ storage: { [draftKey]: JSON.stringify({ transcript: {}, lang: 'bad', audiotype: 'bad' }) } });
  assert.equal(a.elements.transcript.value, '');
  assert.equal(a.elements.lang.value, 'en-ZA');
  assert.equal(a.elements.audiotype.value, 'speech');
});
test('copy fallback does not claim success if it failed', async () => {
  const a = app({ copyFailure: true }); await a.elements.copy.onclick();
  assert.match(a.elements.status.textContent, /copy it manually/);
});

for (const options of [
  { audioConstructorError: true },
  { resume: () => Promise.reject(new Error('Resume failed')) }
]) {
  test('meter startup failure does not block transcription', async () => {
    const a = app(options); await a.start();
    assert.equal(a.elements.status.textContent, 'Listening…');
    assert.equal(a.streams[0].track.stopped, 0);
    assert.match(a.elements.quality.textContent, /level meter unavailable/);
    if (a.contexts.length) assert.equal(a.contexts[0].closed, 1);
    a.result(a.recognitions[0], 'Meter is optional');
    assert.equal(a.draft().transcript, 'Meter is optional ');
  });
}

test('a rejected stale AudioContext resume cannot affect a newer session', async () => {
  const resume = deferred();
  const a = app({ resume: count => count === 1 ? resume.promise : Promise.resolve() });
  const oldStart = a.start(); await new Promise(setImmediate); a.stop(); await a.start();
  resume.reject(new Error('Old context interrupted')); await oldStart;
  assert.equal(a.contexts[0].closed, 1);
  assert.equal(a.contexts[1].closed, 0);
  assert.equal(a.streams[1].track.stopped, 0);
  assert.equal(a.elements.status.textContent, 'Listening…');
});
test('a throwing recognition restart releases audio and restores Start', async () => {
  const a = app(); await a.start(); const recognition = a.recognitions[0];
  recognition.onend();
  recognition.start = () => { throw new Error('Restart failed'); };
  a.runTimer();
  assert.equal(a.streams[0].track.stopped, 1);
  assert.equal(a.elements.start.disabled, false);
  assert.match(a.elements.status.textContent, /could not restart/);
});
test('successful speech resets the consecutive network-error budget', async () => {
  const a = app(); await a.start(); const recognition = a.recognitions[0];
  for (let attempt = 1; attempt <= 3; attempt++) {
    recognition.onerror({ error: 'network' }); recognition.onend(); a.runTimer();
  }
  a.result(recognition, 'Connection recovered');
  recognition.onerror({ error: 'network' }); recognition.onend();
  assert.equal(a.runTimer(), 1000);
  assert.equal(a.elements.status.textContent, 'Listening…');
  assert.equal(a.streams[0].track.stopped, 0);
});

// Pressure tests use deterministic API doubles; they do not exercise a real
// microphone, browser permission prompt, download UI, or online speech service.
test('missing getUserMedia function is handled before requesting a microphone', async () => {
  const a = app({ missingGetUserMedia: true }); await a.start();
  assert.equal(a.requests(), 0); assert.match(a.elements['microphone-help'].textContent, /unavailable/);
});
for (const name of ['analyserError', 'sourceError', 'connectError']) {
  test(`${name} leaves recognition usable and closes the failed meter`, async () => {
    const a = app({ [name]: true }); await a.start();
    assert.equal(a.elements.status.textContent, 'Listening…');
    assert.equal(a.contexts[0].closed, 1); assert.equal(a.frames.size, 0);
    a.stop(); assert.equal(a.streams[0].track.stopped, 1);
  });
}
for (const name of ['closeThrow', 'closeReject', 'stopError', 'abortError']) {
  test(`${name} does not prevent session cleanup`, async () => {
    const a = app({ [name]: true }); await a.start();
    if (name === 'abortError') a.recognitions[0].onerror({ error: 'not-allowed' }); else a.stop();
    await new Promise(setImmediate);
    assert.equal(a.frames.size, 0); assert.equal(a.streams[0].track.stopped, 1);
    assert.equal(a.elements.start.disabled, false); assert.equal(a.elements.stop.disabled, true);
  });
}
test('100 rapid Start/Stop cycles isolate resources and late events', async () => {
  const a = app();
  for (let i = 0; i < 100; i++) {
    await a.start(); const rec = a.recognitions[i]; const oldError = rec.onerror, oldStart = rec.onstart, oldEnd = rec.onend;
    a.result(rec, String(i)); a.stop(); a.stop();
    oldError({ error: 'network' }); oldStart(); oldEnd();
    assert.equal(a.elements.status.textContent, 'Stopped'); assert.equal(a.frames.size, 0);
  }
  while (a.timers.size) a.runTimer();
  assert.equal(a.requests(), 100); assert.equal(a.timers.size, 0);
  assert.ok(a.streams.every(stream => stream.track.stopped === 1));
  assert.ok(a.contexts.every(context => context.closed === 1));
  assert.ok(a.recognitions.every(rec => rec.onresult === null && rec.onend === null));
  assert.equal(a.draft().transcript, Array.from({length:100}, (_, i) => i).join(' ') + ' ');
});
test('50 abandoned permission requests resolve in reverse without touching newest session', async () => {
  const pending = [], starts = [], oldStreams = [];
  const a = app({ getUserMedia: () => { const request = deferred(); pending.push(request); return request.promise; } });
  for (let i = 0; i < 50; i++) { starts.push(a.start()); a.stop(); }
  const newestStart = a.start(); const newestStream = mediaStream();
  pending[50].resolve(newestStream); await newestStart;
  for (let i = 49; i >= 0; i--) { const stream = mediaStream(); oldStreams.push(stream); pending[i].resolve(stream); }
  await Promise.all(starts);
  assert.ok(oldStreams.every(stream => stream.track.stopped === 1));
  assert.equal(newestStream.track.stopped, 0); assert.equal(a.recognitions.length, 1);
  assert.equal(a.elements.status.textContent, 'Listening…');
});
test('pagehide aborts live recognition and cancels animation and reconnect tasks', async () => {
  const a = app(); await a.start(); const rec = a.recognitions[0], lateResult = rec.onresult;
  rec.onend(); a.emitWindow('pagehide');
  const result = [{transcript:'Too late'}]; result.isFinal = true;
  lateResult({resultIndex:0, results:[result]});
  assert.equal(a.draft().transcript, ''); assert.equal(rec.aborts, 1);
  assert.equal(a.frames.size, 0); assert.equal(a.timers.size, 0);
  assert.equal(a.streams[0].track.stopped, 1);
});
test('pagehide while permission is pending releases a late stream', async () => {
  const request = deferred(), stream = mediaStream();
  const a = app({ getUserMedia: () => request.promise }); const starting = a.start();
  a.emitWindow('pagehide'); request.resolve(stream); await starting;
  assert.equal(stream.track.stopped, 1); assert.equal(a.recognitions.length, 0);
});
test('disconnect during context resume cannot start recognition afterward', async () => {
  const resume = deferred(); const a = app({resume: () => resume.promise});
  const starting = a.start(); await new Promise(setImmediate);
  a.streams[0].track.onended(); resume.resolve(); await starting;
  assert.equal(a.recognitions.length, 0); assert.equal(a.contexts[0].closed, 1);
  assert.match(a.elements.status.textContent, /disconnected/);
});
test('disconnect and reconnect create an isolated working session', async () => {
  const a = app(); await a.start(); const old = a.recognitions[0], oldError = old.onerror, oldResult = old.onresult;
  a.streams[0].track.onended(); await a.start();
  oldError({error:'not-allowed'}); oldResult({resultIndex:0, results:[]});
  a.result(a.recognitions[1], 'Recovered');
  assert.equal(a.draft().transcript, 'Recovered '); assert.equal(a.elements.status.textContent, 'Listening…');
});
for (const error of ['service-not-allowed', 'language-not-supported', 'audio-capture', 'aborted', 'unknown']) {
  test(`fatal ${error} frees all microphone resources`, async () => {
    const a = app(); await a.start(); a.recognitions[0].onerror({error});
    assert.equal(a.streams[0].track.stopped, 1); assert.equal(a.contexts[0].closed, 1);
    assert.equal(a.frames.size, 0); assert.equal(a.timers.size, 0);
    assert.equal(a.elements.start.disabled, false);
  });
}
test('repeated no-speech ends do not exhaust network retries or duplicate restarts', async () => {
  const a = app(); await a.start(); const rec = a.recognitions[0];
  for (let i = 0; i < 50; i++) {
    rec.onerror({error:'no-speech'}); rec.onend(); rec.onend();
    assert.equal(a.timers.size, 1); assert.equal(a.runTimer(), 500);
  }
  rec.onerror({error:'network'}); rec.onend(); assert.equal(a.runTimer(), 1000);
  assert.equal(rec.starts, 52);
});
test('clear cancellation preserves draft, interim text, and pending final result', async () => {
  const a = app({confirm:false}); await a.start(); const rec = a.recognitions[0];
  a.result(rec, 'Saved'); a.result(rec, 'Pending', false);
  a.elements.clear.onclick(); assert.equal(a.elements.interim.textContent, 'Pending');
  assert.equal(a.draft().transcript, 'Saved ');
  a.stop(); a.elements.clear.onclick(); a.result(rec, 'Last');
  assert.equal(a.draft().transcript, 'Saved Last ');
});
test('clear confirmation flushes pending manual edit and remains empty on reload', () => {
  const a = app(); a.elements.transcript.value = 'Unsaved'; a.elements.transcript.events.input();
  a.elements.clear.onclick(); assert.equal(a.timers.size, 0); assert.equal(a.draft().transcript, '');
  const restored = app({storage:Object.fromEntries(a.storage)}); assert.equal(restored.elements.transcript.value, '');
});
test('stop grace period accepts finals, ignores interim text, and detaches on end', async () => {
  const a = app(); await a.start(); const rec = a.recognitions[0]; a.stop();
  a.result(rec, 'Interim', false); assert.equal(a.elements.interim.textContent, '');
  a.result(rec, 'Final'); rec.onend(); assert.equal(a.timers.size, 0);
  assert.equal(rec.onresult, null); assert.equal(a.draft().transcript, 'Final ');
});
for (const raw of ['{broken', 'null', '[]', '42', '"text"', 'true']) {
  test(`corrupt or wrong-type draft ${raw} does not prevent recording`, async () => {
    const a = app({storage:{[draftKey]:raw}}); await a.start(); a.result(a.recognitions[0], 'New');
    assert.equal(a.draft().transcript, 'New '); assert.equal(a.elements.lang.value, 'en-ZA');
  });
}
test('blocked draft reads show recovery guidance but do not block new saves', async () => {
  const a = app({storageReadFailure:true}); assert.match(a.elements.saved.textContent, /could not be restored/);
  await a.start(); a.result(a.recognitions[0], 'New'); assert.equal(a.draft().transcript, 'New ');
});
test('500 manual input events create one debounce and retain latest preferences', () => {
  const a = app(); for (let i = 0; i < 500; i++) { a.elements.transcript.value = String(i); a.elements.transcript.events.input(); }
  a.elements.lang.value = 'af-ZA'; a.elements.lang.events.change();
  a.elements.audiotype.value = 'song'; a.elements.audiotype.events.change();
  assert.equal(a.timers.size, 1); assert.equal(a.runTimer(), 500);
  assert.deepEqual(a.draft(), {transcript:'499', lang:'af-ZA', audiotype:'song'});
  const restored = app({storage:Object.fromEntries(a.storage)});
  assert.equal(restored.elements.lang.value, 'af-ZA'); assert.equal(restored.elements.audiotype.value, 'song');
});
test('large Unicode transcript survives save, restore, copy, and text export exactly', async () => {
  const original = 'Meeting café 中文 🎙️\n'.repeat(60000);
  const a = app(); a.elements.transcript.value = original; a.elements.save.onclick();
  assert.equal(a.draft().transcript, original);
  assert.equal(a.blobs[0].type, 'text/plain;charset=utf-8'); assert.equal(await a.blobs[0].text(), original);
  assert.equal(a.downloads[0].clicked, true); assert.equal(a.downloads[0].removed, true);
  assert.match(a.downloads[0].download, /^transcript-\d{4}-\d{2}-\d{2}\.txt$/);
  a.runTimer(); assert.deepEqual(a.revoked, ['blob:test']);
  await a.elements.copy.onclick(); assert.deepEqual(a.clipboardWrites, [original]);
  const restored = app({storage:Object.fromEntries(a.storage)}); assert.equal(restored.elements.transcript.value, original);
});
test('export remains usable when local storage is full', async () => {
  const a = app({storageFailure:true}); a.elements.transcript.value = 'File backup'; a.elements.save.onclick();
  assert.equal(await a.blobs[0].text(), 'File backup'); assert.match(a.elements.saved.textContent, /Save .txt/);
});
for (const options of [{missingClipboard:true, copyFallback:true}, {copyFailure:true, copyFallback:true}, {missingClipboard:true, copyFallbackThrows:true}]) {
  test(`copy API fallback ${JSON.stringify(options)}`, async () => {
    const a = app(options); await a.elements.copy.onclick();
    assert.equal(a.elements.transcript.selected, true);
    assert.match(a.elements.status.textContent, options.copyFallback ? /Transcript copied/ : /copy it manually/);
  });
}
test('multi-result recognition appends only new finals and keeps Unicode and whitespace', async () => {
  const a = app(); await a.start(); const rec = a.recognitions[0];
  const result = (text, isFinal) => Object.assign([{transcript:text}], {isFinal});
  rec.onresult({resultIndex:0, results:[result('Hello', true), result('pending', false)]});
  rec.onresult({resultIndex:1, results:[result('Hello', true), result('café 🎙️', true), result('next', false)]});
  assert.equal(a.draft().transcript, 'Hello café 🎙️ '); assert.equal(a.elements.interim.textContent, 'next');
});
test('meter stays within 0–100 and cancels its latest frame on Stop', async () => {
  for (const sampleValue of [0, 127, 128, 129, 255]) {
    const a = app({sampleValue}); await a.start();
    for (let i = 0; i < 20; i++) { a.runFrame(); assert.equal(a.frames.size, 1); }
    const value = Number(a.elements.meter.attributes['aria-valuenow']); assert.ok(value >= 0 && value <= 100);
    a.stop(); assert.equal(a.frames.size, 0); assert.equal(a.elements.meter.attributes['aria-valuenow'], '0');
  }
});
test('failed object URL creation gives actionable export feedback without throwing', () => {
  const a = app({objectUrlError:true}); a.elements.transcript.value = 'Keep me';
  assert.doesNotThrow(() => a.elements.save.onclick());
  assert.equal(a.elements.transcript.value, 'Keep me');
  assert.match(a.elements.status.textContent, /save|download|export|copy/i);
});
test('failed download click cleans up its anchor and blob URL without throwing', () => {
  const a = app({downloadClickError:true});
  assert.doesNotThrow(() => a.elements.save.onclick());
  while (a.timers.size) a.runTimer();
  assert.equal(a.downloads[0].removed, true); assert.deepEqual(a.revoked, ['blob:test']);
});
test('meter failure after startup degrades gracefully without an uncaught animation error', async () => {
  const a = app({meterErrorAt:2}); await a.start();
  assert.doesNotThrow(() => a.runFrame());
  assert.match(a.elements.quality.textContent, /meter unavailable/);
  a.result(a.recognitions[0], 'Still working'); assert.equal(a.draft().transcript, 'Still working ');
  a.stop(); assert.equal(a.streams[0].track.stopped, 1);
});
test('1000 consecutive final speech chunks persist without duplication or pending saves', async () => {
  const a = app(); await a.start();
  for (let i = 0; i < 1000; i++) a.result(a.recognitions[0], `Sentence ${i}.`);
  assert.equal(a.draft().transcript, Array.from({length:1000}, (_, i) => `Sentence ${i}. `).join(''));
  assert.equal(a.timers.size, 0); assert.equal(a.frames.size, 1);
});
test('storage can recover after quota failure without losing in-memory speech', async () => {
  const options = {storageFailure:true}, a = app(options); await a.start();
  a.result(a.recognitions[0], 'Before'); options.storageFailure = false;
  a.result(a.recognitions[0], 'After'); assert.equal(a.draft().transcript, 'Before After ');
  assert.match(a.elements.saved.textContent, /Draft saved locally/);
});
test('multiple microphone tracks are all stopped and detached', async () => {
  const one = mediaStream(), two = mediaStream();
  const a = app({getUserMedia: async () => ({getTracks: () => [one.track, two.track]})});
  await a.start(); a.stop();
  assert.equal(one.track.stopped, 1); assert.equal(two.track.stopped, 1);
  assert.equal(one.track.onended, null); assert.equal(two.track.onended, null);
});
test('hidden-page autosave does not silently terminate an active recording', async () => {
  const a = app(); await a.start(); a.elements.transcript.value = 'Manual edit';
  a.document.visibilityState = 'hidden'; a.emitDocument('visibilitychange');
  assert.equal(a.draft().transcript, 'Manual edit'); assert.equal(a.streams[0].track.stopped, 0);
  assert.equal(a.elements.stop.disabled, false); assert.equal(a.recognitions[0].aborts, 0);
});
test('a fresh start after exhausted retries gets a new retry budget', async () => {
  const a = app(); await a.start(); const old = a.recognitions[0];
  for (let i = 0; i < 4; i++) { old.onerror({error:'network'}); if (old.onend) { old.onend(); a.runTimer(); } }
  await a.start(); const next = a.recognitions[1]; next.onerror({error:'network'}); next.onend();
  assert.equal(a.runTimer(), 1000); assert.equal(a.elements.status.textContent, 'Listening…');
});
test('permission denial then approval clears old guidance and starts normally', async () => {
  const a = app({getUserMedia: count => count === 1 ? Promise.reject(Object.assign(new Error(), {name:'NotAllowedError'})) : Promise.resolve(mediaStream())});
  await a.start(); assert.equal(a.elements['microphone-help'].hidden, false);
  await a.start(); assert.equal(a.elements['microphone-help'].hidden, true);
  assert.equal(a.elements.status.textContent, 'Listening…');
});
test('clear during recording keeps the session usable for subsequent speech', async () => {
  const a = app(); await a.start(); a.result(a.recognitions[0], 'Old');
  a.elements.clear.onclick(); assert.equal(a.draft().transcript, '');
  assert.equal(a.streams[0].track.stopped, 0);
  a.result(a.recognitions[0], 'New'); assert.equal(a.draft().transcript, 'New ');
});
test('stopping before pending permission rejection keeps status stopped', async () => {
  const request = deferred(), a = app({getUserMedia: () => request.promise});
  const starting = a.start(); a.stop(); request.reject(new Error('Permission cancelled')); await starting;
  assert.equal(a.elements.status.textContent, 'Stopped'); assert.equal(a.elements.start.disabled, false);
  assert.equal(a.elements['microphone-help'].hidden, true); assert.equal(a.recognitions.length, 0);
});
