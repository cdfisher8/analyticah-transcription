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
  const timers = new Map();
  const windowEvents = {}, documentEvents = {}, contexts = [], recognitions = [], streams = [];
  const storage = new Map(Object.entries(options.storage || {}));
  let clockId = 0, requests = 0;
  class AudioContext {
    constructor() { if (options.audioConstructorError) throw new Error('Audio unavailable'); this.closed = 0; contexts.push(this); }
    resume() { return options.resume ? options.resume(contexts.length) : Promise.resolve(); }
    close() { this.closed++; return Promise.resolve(); }
    createAnalyser() { return { fftSize: 2048, getByteTimeDomainData: values => values.fill(128) }; }
    createMediaStreamSource() { return { connect() {} }; }
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
    stop() { this.stops++; }
    abort() { this.aborts++; }
  }
  const navigator = {
    mediaDevices: { getUserMedia() {
      requests++;
      if (options.getUserMedia) return options.getUserMedia(requests);
      const stream = mediaStream(); streams.push(stream); return Promise.resolve(stream);
    } },
    clipboard: { writeText: async () => {} }
  };
  if (options.missingMedia) delete navigator.mediaDevices;
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
    execCommand: () => options.copyFallback === true,
    body: { appendChild() {} },
    createElement: () => ({ click() {}, remove() {} })
  };
  if (options.policyBlocked) document.permissionsPolicy = { allowsFeature: () => false };
  const context = vm.createContext({
    window, document, navigator, Uint8Array, Date, Math, JSON, Promise, Blob,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => {
        if (options.storageFailure) throw new Error('QuotaExceeded');
        storage.set(key, value);
      }
    },
    confirm: () => options.confirm !== false,
    setTimeout: (fn, delay) => { const id = ++clockId; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: () => ++clockId, cancelAnimationFrame() {}
  });
  vm.runInContext(source, context);
  return {
    elements, window, document, contexts, recognitions, streams, storage, timers,
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
