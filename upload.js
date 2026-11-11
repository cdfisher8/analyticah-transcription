(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const formats = ['mp3', 'm4a', 'wav', 'webm', 'mp4', 'mpeg', 'mpga', 'ogg', 'oga', 'opus', 'flac', 'aac'];
  const maxBytes = 25_000_000;
  let capabilities = null, selectedFile = null, selection = 0, requestNumber = 0, pending = null, configRequest = 0;
  const notice = text => { byId('upload-status').textContent = text; };
  let apiBase = '';
  let configurationError = '';
  try {
    const configured = window.ANALYTICAH_UPLOAD_CONFIG?.apiBase || window.location.origin;
    const url = new URL(configured, window.location.origin);
    if (url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error();
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error();
    apiBase = url.origin;
  } catch { configurationError = 'Secure file uploads are not configured. The app owner must connect an HTTPS transcription server.'; }

  function setBusy(busy) {
    byId('audio-file').disabled = busy;
    byId('upload-cancel').disabled = !busy;
    byId('upload-retry').disabled = busy;
    byId('upload-access-code').disabled = busy;
    byId('upload-consent').disabled = busy;
    byId('upload-start').disabled = busy || !selectedFile || !capabilities?.enabled;
    byId('start').disabled = busy;
    byId('lang').disabled = busy;
  }
  function renderButton() {
    byId('upload-start').disabled = !!pending || !selectedFile || !capabilities?.enabled;
  }
  function validSignature(bytes, extension) {
    const ascii = (offset, count) => String.fromCharCode(...bytes.slice(offset, offset + count));
    const mpeg = bytes[0] === 255 && (bytes[1] & 224) === 224;
    if (bytes.length < 4) return false;
    if (extension === 'wav') return bytes.length >= 12 && ['RIFF', 'RF64'].includes(ascii(0, 4)) && ascii(8, 4) === 'WAVE';
    if (['m4a', 'mp4'].includes(extension)) return bytes.length >= 12 && ascii(4, 4) === 'ftyp';
    if (['ogg', 'oga', 'opus'].includes(extension)) return ascii(0, 4) === 'OggS';
    if (extension === 'flac') return ascii(0, 4) === 'fLaC';
    if (extension === 'webm') return bytes[0] === 26 && bytes[1] === 69 && bytes[2] === 223 && bytes[3] === 163;
    if (extension === 'mpeg' && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 186) return true;
    return mpeg || ascii(0, 3) === 'ID3';
  }

  async function selectFile() {
    const version = ++selection;
    selectedFile = null; renderButton();
    const files = byId('audio-file').files;
    if (!files || files.length !== 1) { notice('Choose one recording to transcribe. Nothing has been uploaded.'); return; }
    const file = files[0];
    const extension = /\.([^.]+)$/.exec(file.name)?.[1].toLowerCase() || '';
    if (!formats.includes(extension)) { notice('Unsupported format. Choose MP3, M4A, WAV, WebM, OGG/Opus, FLAC, AAC, or an audio MP4/MPEG file.'); return; }
    if (!file.size) { notice('This file is empty. Choose a recording that contains audio.'); return; }
    if (file.size > Math.min(maxBytes, capabilities?.maxFileBytes || maxBytes)) { notice('The file is larger than 25 MB. Export a smaller file or split the recording.'); return; }
    try {
      const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      if (version !== selection) return;
      if (!validSignature(bytes, extension)) { notice('The file contents do not match its audio format. Renaming a file does not convert it.'); return; }
      selectedFile = file;
      notice(`${file.name} selected (${(file.size / 1_000_000).toFixed(2)} MB). Nothing has been uploaded.${capabilities?.enabled ? '' : ' The transcription server still needs to be enabled.'}`);
      renderButton();
    } catch { if (version === selection) notice('This file could not be read. Select it again or choose another recording.'); }
  }

  async function checkService() {
    const version = ++configRequest;
    capabilities = null; renderButton();
    if (window.isSecureContext === false || configurationError) {
      notice(configurationError || 'Open this app over HTTPS before sending a recording or access code.');
      return;
    }
    notice('Checking file transcription service…');
    try {
      const response = await fetch(apiBase + '/api/capabilities', { cache: 'no-store', signal: AbortSignal.timeout(10_000), credentials: 'omit', redirect: 'error' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (version !== configRequest) return;
      if (!data || data.provider !== 'OpenAI' || data.requiresAccessCode !== true || !Number.isFinite(data.maxFileBytes) || !Number.isFinite(data.maxDurationSeconds)) throw new Error();
      capabilities = data;
      if (!data.enabled) notice('File transcription is being set up. Live microphone transcription and transcript editing still work.');
      else notice(`Ready for one recording up to ${(data.maxFileBytes / 1_000_000).toFixed(0)} MB and ${Math.floor(data.maxDurationSeconds / 60)} minutes. Your file is sent only when you choose Transcribe file.`);
      renderButton();
    } catch {
      if (version === configRequest) notice('The file transcription server is unavailable or not configured yet. Live microphone transcription and editing still work.');
    }
  }

  async function upload() {
    if (pending) return;
    if (!capabilities?.enabled || !selectedFile) { notice('Choose a supported file and connect the transcription service first.'); return; }
    if (!byId('stop').disabled) { notice('Stop live listening before transcribing an uploaded recording.'); return; }
    if (!byId('upload-consent').checked) { notice('Confirm that you may send this recording to the app’s server and OpenAI for transcription.'); return; }
    const accessCode = byId('upload-access-code').value.trim();
    if (/^sk-/.test(accessCode)) { notice('Do not enter an OpenAI API key here. Use the separate upload access code supplied by the app owner.'); return; }
    if (accessCode.length < 24) { notice('Enter the upload access code supplied by the app owner.'); return; }
    const file = selectedFile, version = ++requestNumber, controller = new AbortController();
    pending = controller; setBusy(true);
    notice('Uploading and transcribing… This may take a few minutes. Your existing transcript will be preserved.');
    let timeout = false;
    const timer = setTimeout(() => { timeout = true; controller.abort(); }, 240_000);
    try {
      const response = await fetch(apiBase + '/api/transcriptions', {
        method: 'POST', body: file, credentials: 'omit', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name), 'X-App-Access-Code': accessCode }
      });
      const result = await response.json();
      if (version !== requestNumber) return;
      if (!response.ok) throw new Error(result && typeof result.message === 'string' ? result.message : 'The recording could not be transcribed.');
      if (!result || typeof result.text !== 'string' || result.text.length > 2_000_000) throw new Error('The server returned an invalid transcript.');
      const text = result.text.trim();
      if (!text) { notice('No speech was returned for this recording. Your existing transcript is unchanged.'); return; }
      const area = byId('transcript');
      area.value += (area.value ? '\n\n' : '') + text;
      area.scrollTop = area.scrollHeight;
      // Use the existing draft-saving path without persisting access codes.
      area.dispatchEvent(new Event('input', { bubbles: true }));
      if (typeof saveDraft === 'function') saveDraft();
      notice('File transcribed. The result was added to your transcript. Review it before sharing.');
    } catch (error) {
      if (version !== requestNumber) return;
      if (controller.signal.aborted) notice(timeout ? 'Transcription timed out. The service may already have processed and billed it; check before retrying.' : 'Transcription cancelled. Your existing transcript is unchanged. Processing may already have been billed.');
      else notice(error.message || 'The upload failed. Your existing transcript is unchanged.');
    } finally {
      clearTimeout(timer);
      if (version === requestNumber) { pending = null; setBusy(false); }
    }
  }

  byId('audio-file').addEventListener('change', selectFile);
  byId('upload-start').addEventListener('click', upload);
  byId('upload-retry').addEventListener('click', checkService);
  byId('upload-cancel').addEventListener('click', () => {
    if (!pending) return;
    ++requestNumber; pending.abort(); pending = null; setBusy(false);
    notice('Transcription cancelled. Your existing transcript is unchanged. Processing may already have been billed.');
  });
  window.addEventListener('pagehide', () => {
    ++requestNumber; pending?.abort(); pending = null;
    setBusy(false);
    byId('upload-access-code').value = '';
    notice('Upload stopped when you left the page. Check your transcript before starting again.');
  });
  checkService();
})();
