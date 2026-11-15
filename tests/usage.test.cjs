const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { estimate, hour } = require('../usage.js');

test('estimate charges a full block for every started hour', () => {
  assert.equal(estimate(0, false), 0);
  assert.equal(estimate(0, true), 10);
  assert.equal(estimate(5 * 60 * 1000, true), 10);
  assert.equal(estimate(hour, true), 10);
  assert.equal(estimate(hour + 1, true), 20);
  assert.equal(estimate(2 * hour + 1, true), 30);
});

test('each new session adds R10 and auto-resume controls additional hours', () => {
  const output = {};
  const toggle = { checked: false };
  const elements = {
    'usage-estimate': output,
    'usage-auto-resume': toggle,
    'usage-top-up': { valueAsNumber: 50, addEventListener() {} },
    'usage-remaining': {}
  };
  let time = 0;
  let tick;
  const window = {
    document: { getElementById: id => elements[id], querySelectorAll: () => [] },
    performance: { now: () => time },
    setInterval: callback => { tick = callback; },
    clearInterval: () => { tick = undefined; }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../usage.js'), 'utf8'), { window });
  const usage = window.transcriptionUsage;
  let limits = 0;
  const onLimit = () => { limits++; usage.stop(); };
  usage.start(onLimit);
  assert.match(output.textContent, /R10$/);
  time = hour + 1;
  tick();
  assert.equal(limits, 1);
  assert.match(output.textContent, /R10$/);
  toggle.checked = true;
  usage.start(onLimit);
  usage.start(onLimit);
  assert.match(output.textContent, /R20$/);
  time += hour + 1;
  tick();
  assert.match(output.textContent, /R30$/);
  toggle.checked = false;
  time += hour;
  tick();
  assert.equal(limits, 2);
  assert.match(output.textContent, /R30$/);
  assert.match(elements['usage-remaining'].textContent, /R20\.00$/);
});
