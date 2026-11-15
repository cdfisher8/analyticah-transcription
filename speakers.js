/* Manual speaker labels: no audio analysis or automatic speaker detection. */
(function (root) {
  'use strict';
  const storageKey = 'analyticah-transcription-speakers-v1';
  const namesKey = 'analyticah-transcription-speaker-names';
  const maxSpeakers = 10;
  function insertSpeaker(text, position, number, name = 'Speaker ' + number) {
    if (!Number.isSafeInteger(number) || number < 1 || number > maxSpeakers) throw new Error('Invalid speaker');
    const at = Math.max(0, Math.min(text.length, Number.isFinite(position) ? Math.trunc(position) : text.length));
    // Never replace a selection or existing words. A label starts a new paragraph.
    const before = text.slice(0, at), after = text.slice(at);
    const prefix = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
    const label = name + ': ';
    return { text: before + prefix + label + after, cursor: before.length + prefix.length + label.length };
  }
  if (typeof module === 'object' && module.exports) { module.exports = { insertSpeaker }; return; }
  const doc = root.document, area = doc.getElementById('transcript');
  if (!area) return;
  const list = doc.getElementById('speaker-list');
  const notice = doc.getElementById('speaker-status'), add = doc.getElementById('speaker-add');
  let count = 2, cursor = area.value.length, dragging = null, undo = null, cursorText = area.value;
  let names = [];
  try {
    const saved = Number(root.localStorage.getItem(storageKey));
    if (Number.isSafeInteger(saved) && saved >= 2 && saved <= 999) count = Math.min(saved, maxSpeakers);
    const savedNames = JSON.parse(root.localStorage.getItem(namesKey));
    if (Array.isArray(savedNames)) names = savedNames.slice(0, maxSpeakers);
  } catch (_) { /* Transcript draft remains independent of speaker preferences. */ }
  function speakerName(number) {
    const name = names[number - 1];
    return (typeof name === 'string' && name.replace(/[\r\n]+/g, ' ').trim()) || 'Speaker ' + number;
  }
  function rememberCursor() { cursor = area.selectionStart; cursorText = area.value; }
  for (const event of ['select', 'keyup', 'click', 'input', 'blur']) area.addEventListener(event, rememberCursor);
  function announce(message) { notice.textContent = message; }
  function apply(number) {
    if (!Number.isSafeInteger(number) || number < 1 || number > count) return;
    const old = area.value;
    if (old !== cursorText) cursor = old.length; // Live speech, upload or Clear may change text without a cursor event.
    const name = speakerName(number);
    const change = insertSpeaker(old, cursor, number, name);
    undo = { before: old, after: change.text, cursor };
    area.value = change.text;
    area.focus(); area.setSelectionRange(change.cursor, change.cursor); cursor = change.cursor;
    area.dispatchEvent(new Event('input', { bubbles: true }));
    // Existing draft handler persists the transcript and exports use the same text.
    doc.getElementById('speaker-undo').disabled = false;
    announce(name + ' inserted.');
  }
  area.addEventListener('keydown', event => {
    if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.repeat || !/^[1-9]$/.test(event.key)) return;
    const number = Number(event.key);
    if (number > count) return;
    event.preventDefault(); rememberCursor(); apply(number);
  });
  function render() {
    list.replaceChildren();
    for (let n = 1; n <= count; n++) {
      const row = doc.createElement('div'); row.className = 'speaker-row';
      const name = doc.createElement('input'); name.type = 'text'; name.value = speakerName(n);
      name.setAttribute('aria-label', 'Name of speaker ' + n);
      const chip = doc.createElement('button'); chip.type = 'button'; chip.textContent = 'Insert'; chip.draggable = true;
      function updateLabel() {
        chip.setAttribute('aria-label', 'Insert ' + speakerName(n) + ' at the transcript cursor');
      }
      updateLabel();
      name.addEventListener('input', () => {
        names[n - 1] = name.value;
        updateLabel();
        try { root.localStorage.setItem(namesKey, JSON.stringify(names)); }
        catch (_) { announce('Speaker name changed for this session. Local saving is unavailable.'); }
      });
      name.addEventListener('blur', () => { name.value = speakerName(n); });
      chip.addEventListener('click', () => apply(n));
      chip.addEventListener('dragstart', event => { dragging = n; event.dataTransfer.setData('application/x-analyticah-speaker', String(n)); event.dataTransfer.effectAllowed = 'copy'; });
      chip.addEventListener('dragend', () => { dragging = null; area.classList.remove('speaker-drop'); });
      row.appendChild(name); row.appendChild(chip); list.appendChild(row);
    }
    add.disabled = count >= maxSpeakers;
  }
  add.addEventListener('click', () => {
    if (count >= maxSpeakers) return;
    count++; render();
    try { root.localStorage.setItem(storageKey, String(count)); } catch (_) { announce('Speaker added for this session. Local saving is unavailable.'); return; }
    announce(count === maxSpeakers ? 'Speaker 10 added. Maximum of 10 speakers reached.' : 'Speaker ' + count + ' added.');
  });
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
