/* Manual speaker labels: no audio analysis or automatic speaker detection. */
(function (root) {
  'use strict';
  const storageKey = 'analyticah-transcription-speakers-v1';
  function insertSpeaker(text, position, number) {
    if (!Number.isSafeInteger(number) || number < 1 || number > 999) throw new Error('Invalid speaker');
    const at = Math.max(0, Math.min(text.length, Number.isFinite(position) ? Math.trunc(position) : text.length));
    // Never replace a selection or existing words. A label starts a new paragraph.
    const before = text.slice(0, at), after = text.slice(at);
    const prefix = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
    const label = 'Speaker ' + number + ': ';
    return { text: before + prefix + label + after, cursor: before.length + prefix.length + label.length };
  }
  if (typeof module === 'object' && module.exports) { module.exports = { insertSpeaker }; return; }
  const doc = root.document, area = doc.getElementById('transcript');
  if (!area) return;
  const list = doc.getElementById('speaker-list'), picker = doc.getElementById('speaker-select');
  const notice = doc.getElementById('speaker-status'), add = doc.getElementById('speaker-add');
  let count = 2, cursor = area.value.length, dragging = null, undo = null, cursorText = area.value;
  try {
    const saved = Number(root.localStorage.getItem(storageKey));
    if (Number.isSafeInteger(saved) && saved >= 2 && saved <= 999) count = saved;
  } catch (_) { /* Transcript draft remains independent of speaker preferences. */ }
  function rememberCursor() { cursor = area.selectionStart; cursorText = area.value; }
  for (const event of ['select', 'keyup', 'click', 'input', 'blur']) area.addEventListener(event, rememberCursor);
  function announce(message) { notice.textContent = message; }
  function apply(number) {
    if (!Number.isSafeInteger(number) || number < 1 || number > count) return;
    const old = area.value;
    if (old !== cursorText) cursor = old.length; // Live speech, upload or Clear may change text without a cursor event.
    const change = insertSpeaker(old, cursor, number);
    undo = { before: old, after: change.text, cursor };
    area.value = change.text;
    area.focus(); area.setSelectionRange(change.cursor, change.cursor); cursor = change.cursor;
    area.dispatchEvent(new Event('input', { bubbles: true }));
    // Existing draft handler persists the transcript and exports use the same text.
    doc.getElementById('speaker-undo').disabled = false;
    announce('Speaker ' + number + ' inserted. Type or edit their paragraph.');
  }
  area.addEventListener('keydown', event => {
    if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.repeat || !/^[1-9]$/.test(event.key)) return;
    const number = Number(event.key);
    if (number > count) return;
    event.preventDefault(); rememberCursor(); apply(number);
  });
  function render() {
    const selected = picker.value;
    list.replaceChildren(); picker.replaceChildren();
    for (let n = 1; n <= count; n++) {
      const option = doc.createElement('option'); option.value = String(n); option.textContent = 'Speaker ' + n; picker.appendChild(option);
      const chip = doc.createElement('button'); chip.type = 'button'; chip.textContent = 'Speaker ' + n; chip.draggable = true;
      chip.setAttribute('aria-label', 'Insert Speaker ' + n + ' at the transcript cursor');
      chip.addEventListener('click', () => apply(n));
      chip.addEventListener('dragstart', event => { dragging = n; event.dataTransfer.setData('application/x-analyticah-speaker', String(n)); event.dataTransfer.effectAllowed = 'copy'; });
      chip.addEventListener('dragend', () => { dragging = null; area.classList.remove('speaker-drop'); });
      list.appendChild(chip);
    }
    picker.value = selected || '1'; add.disabled = count >= 999;
  }
  add.addEventListener('click', () => {
    if (count >= 999) return;
    count++; render(); picker.value = String(count);
    try { root.localStorage.setItem(storageKey, String(count)); } catch (_) { announce('Speaker added for this session. Local saving is unavailable.'); return; }
    announce('Speaker ' + count + ' added.');
  });
  doc.getElementById('speaker-insert').addEventListener('click', () => apply(Number(picker.value)));
  doc.getElementById('speaker-undo').addEventListener('click', () => {
    if (!undo || area.value !== undo.after) { announce('Transcript changed. Undo label is unavailable to protect your edits.'); return; }
    area.value = undo.before; area.focus(); area.setSelectionRange(undo.cursor, undo.cursor); cursor = undo.cursor; undo = null;
    area.dispatchEvent(new Event('input', { bubbles: true })); doc.getElementById('speaker-undo').disabled = true;
    announce('Last speaker label undone.');
  });
  area.addEventListener('dragover', event => {
    if (dragging !== null) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; area.classList.add('speaker-drop'); }
  });
  area.addEventListener('dragleave', () => area.classList.remove('speaker-drop'));
  area.addEventListener('drop', event => {
    if (dragging === null) return; // Leave ordinary text/file drops to the browser.
    event.preventDefault(); const n = dragging; dragging = null; area.classList.remove('speaker-drop'); apply(n);
  });
  render();
})(typeof window === 'undefined' ? globalThis : window);
