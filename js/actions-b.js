function toast(message) {
  const item = document.createElement('div');
  item.className = 'toast';
  item.innerHTML = `<i></i><span>${escapeHtml(message)}</span>`;
  els.toastStack.append(item);
  setTimeout(() => item.classList.add('is-out'), 2200);
  setTimeout(() => item.remove(), 2450);
}

function openModal(modal) {
  els.modalLayer.hidden = false;
  [els.recordModal, els.settingsModal].forEach(item => item.hidden = item !== modal);
}

async function closeModals() {
  if (runtime.mediaRecorder && runtime.mediaRecorder.state === 'recording') await stopRecording(true);
  els.modalLayer.hidden = true;
  els.recordModal.hidden = true;
  els.settingsModal.hidden = true;
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    toast('Recording is not supported in this browser');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    runtime.mediaStream = stream;
    runtime.mediaChunks = [];
    runtime.mediaRecorder = new MediaRecorder(stream);
    runtime.mediaRecorder.ondataavailable = e => { if (e.data.size) runtime.mediaChunks.push(e.data); };
    runtime.mediaRecorder.onstop = async () => {
      if (!runtime.mediaChunks.length) return;
      const blob = new Blob(runtime.mediaChunks, { type: runtime.mediaRecorder?.mimeType || 'audio/webm' });
      await addRecordedBlob(blob);
    };
    runtime.mediaRecorder.start(100);
    runtime.recordStartedAt = performance.now();
    els.recordToggleBtn.querySelector('span:last-child').textContent = 'Stop recording';
    els.recorderOrb.classList.add('is-recording');
    els.recordStatus.textContent = 'Recording from microphone';
    setupRecordMeter(stream);
    runtime.recordTimerId = setInterval(updateRecordTimer, 80);
  } catch (error) {
    console.error(error);
    toast('Microphone permission was not granted','warn');
    if (typeof showPermissionGuide === 'function') showPermissionGuide('microphone', () => openModal(els.recordModal));
  }
}

function updateRecordTimer() {
  const elapsed = (performance.now() - runtime.recordStartedAt) / 1000;
  const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const seconds = Math.floor(elapsed % 60).toString().padStart(2, '0');
  const tenths = Math.floor((elapsed % 1) * 10);
  els.recordTimer.textContent = `${minutes}:${seconds}.${tenths}`;
}

function setupRecordMeter(stream) {
  const ctx = audioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  runtime.recordAnalyser = analyser;
  const data = new Uint8Array(analyser.frequencyBinCount);
  const tick = () => {
    if (!runtime.recordAnalyser) return;
    analyser.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    const pct = clamp((avg / 110) * 100, 0, 100);
    els.recordMeter.style.width = `${pct}%`;
    els.recorderOrb.style.transform = `scale(${1 + pct / 900})`;
    runtime.recordAnimationId = requestAnimationFrame(tick);
  };
  tick();
}

async function stopRecording(discard = false) {
  if (!runtime.mediaRecorder) return;
  const recorder = runtime.mediaRecorder;
  if (discard) recorder.onstop = null;
  if (recorder.state !== 'inactive') recorder.stop();
  runtime.mediaStream?.getTracks().forEach(track => track.stop());
  clearInterval(runtime.recordTimerId);
  cancelAnimationFrame(runtime.recordAnimationId);
  runtime.recordAnalyser = null;
  runtime.mediaStream = null;
  runtime.mediaRecorder = null;
  els.recordToggleBtn.querySelector('span:last-child').textContent = 'Start recording';
  els.recorderOrb.classList.remove('is-recording');
  els.recorderOrb.style.transform = '';
  els.recordMeter.style.width = '0%';
  els.recordStatus.textContent = discard ? 'Recording discarded' : 'Recording saved';
}

async function addRecordedBlob(blob) {
  const before = snapshot();
  const audioKey = `audio:${uid()}`;
  await idbSet(audioKey, blob);
  let duration = 0;
  try {
    const buffer = await audioContext().decodeAudioData((await blob.arrayBuffer()).slice(0));
    duration = buffer.duration;
  } catch (_) {}
  const pad = makePad({ name: `Recording ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, audioKey, mime: blob.type, duration, group: 'voice' });
  state.pads.push(pad);
  state.selectedPadId = pad.id;
  commitHistory(before);
  renderAll();
  markDirty();
  toast('Recording added to board');
  setTimeout(closeModals, 260);
}

async function exportBackup() {
  const button=els.exportBtn||document.querySelector('#settingsExportBtn');
  const buttonText=button?.textContent||'Export backup';
  if(button){button.textContent='Preparing…';button.disabled=true;}
  try {
    const audio = {};
    const timelineKeys=(state.timelines||[]).flatMap(t=>(t.clips||[]).map(c=>c.audioKey));
    const uniqueKeys=[...new Set([...state.pads.map(p=>p.audioKey),...timelineKeys].filter(Boolean))];
    for (const key of uniqueKeys) {
      const blob = await idbGet(key);
      if (!blob) continue;
      audio[key] = { type: blob.type, data: await blobToDataUrl(blob) };
    }
    const payload = { version: 1, exportedAt: new Date().toISOString(), state: JSON.parse(snapshot()), audio };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${slugify(state.boardTitle) || 'soundboard'}.syroboard`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast('Backup exported');
  } catch (error) {
    console.error(error);
    toast('Backup export failed');
  } finally {
    if(button){button.textContent=buttonText;button.disabled=false;}
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function applySettingsToUi() {
  if (els.motionToggle) els.motionToggle.checked = settings.motion;
  if (els.uiSoundsToggle) els.uiSoundsToggle.checked = settings.uiSounds;
  if (els.autosaveToggle) els.autosaveToggle.checked = settings.autosave;
  document.body.classList.toggle('reduce-motion', !settings.motion);
}

function uiTick(freq = 620, volume = .012) {
  if (!settings.uiSounds) return;
  try {
    const ctx = audioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .035);
    osc.connect(gain).connect(runtime.masterGain);
    osc.start();
    osc.stop(ctx.currentTime + .04);
  } catch (_) {}
}

function bindPadPointerGlow() {
  $$('.sound-pad', els.padsGrid).forEach(bindPointerGlow);
}

function bindPointerGlow(element) {
  if (element.dataset.glowBound) return;
  element.dataset.glowBound = '1';
  element.addEventListener('pointermove', event => {
    const rect = element.getBoundingClientRect();
    element.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    element.style.setProperty('--my', `${event.clientY - rect.top}px`);
  }, { passive: true });
}

function bindGlobalPointerGlow() {
  $$('.glass-panel, .ui-btn, .icon-btn, .transport-stop, .add-effect-btn').forEach(bindPointerGlow);
}

function showContextMenu(event, padId) {
  runtime.contextPadId = padId;
  const pad = state.pads.find(p => p.id === padId);
  if (!pad) return;
  event.preventDefault();
  selectPad(padId);
  els.contextMenu.hidden = false;
  els.contextMenu.style.left = '0px';
  els.contextMenu.style.top = '0px';
  const rect = els.contextMenu.getBoundingClientRect();
  const x = Math.min(event.clientX, window.innerWidth - rect.width - 8);
  const y = Math.min(event.clientY, window.innerHeight - rect.height - 8);
  els.contextMenu.style.left = `${Math.max(8, x)}px`;
  els.contextMenu.style.top = `${Math.max(8, y)}px`;
}

function hideContextMenu() {
  els.contextMenu.hidden = true;
  runtime.contextPadId = null;
}

