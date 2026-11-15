(function (root) {
  'use strict';
  const hour = 60 * 60 * 1000;
  const rate = 10;

  function estimate(elapsed, started) {
    return started ? Math.max(1, Math.ceil(elapsed / hour)) * rate : 0;
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { estimate, hour };
    return;
  }

  const doc = root.document;
  const display = doc.getElementById('usage-estimate');
  const autoResume = doc.getElementById('usage-auto-resume');
  const topUp = doc.getElementById('usage-top-up');
  const remaining = doc.getElementById('usage-remaining');
  let startedAt = null;
  let timer;
  let cost = 0;
  let completedCost = 0;

  function render() {
    const total = completedCost + cost;
    display.textContent = 'Estimated usage this visit: R' + total;
    const amount = topUp.valueAsNumber;
    remaining.textContent = Number.isFinite(amount) && amount > 0
      ? 'Estimated credit left: R' + Math.max(0, amount - total).toFixed(2)
      : 'Enter a positive top-up to estimate remaining credit.';
  }

  topUp.addEventListener('input', render);
  for (const button of doc.querySelectorAll('[data-top-up-step]')) {
    button.addEventListener('click', () => {
      const next = (topUp.valueAsNumber || 50) + Number(button.dataset.topUpStep);
      if (next <= 0 || !Number.isFinite(next)) return;
      topUp.value = next.toFixed(2);
      render();
    });
  }

  function update() {
    const elapsed = root.performance.now() - startedAt;
    const limit = Math.max(1, cost / rate) * hour;
    cost = estimate(autoResume.checked ? elapsed : Math.min(elapsed, limit), true);
    render();
    return !autoResume.checked && elapsed >= limit;
  }

  root.transcriptionUsage = {
    start(onLimit) {
      if (startedAt !== null) return;
      startedAt = root.performance.now();
      update();
      timer = root.setInterval(() => {
        if (update()) onLimit();
      }, 1000);
    },
    stop() {
      if (startedAt === null) return;
      root.clearInterval(timer);
      update();
      completedCost += cost;
      cost = 0;
      startedAt = null;
    }
  };
  render();
})(typeof window === 'undefined' ? globalThis : window);
