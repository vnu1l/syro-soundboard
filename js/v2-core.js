'use strict';

function makeTimeline(name = `Timeline ${Math.max(1, state.timelines.length + 1)}`) {
  return { id: uid(), name, clips: [], zoom: 1, playhead: 0, createdAt: Date.now() };
}

function ensureV2State() {
  if (!Array.isArray(state.timelines) || !state.timelines.length) state.timelines = [makeTimeline('Timeline 1')];
  state.activeTimelineIndex = clamp(Number(state.activeTimelineIndex) || 0, 0, state.timelines.length - 1);
  state.pads.forEach(pad => { pad.effects = { ...defaultEffects(), ...(pad.effects || {}) }; if (pad.startOffset == null) pad.startOffset = 0; if (pad.endOffset == null) pad.endOffset = null; });
}

snapshot = function snapshotV2() {
  return JSON.stringify({
    boardTitle: state.boardTitle, pads: state.pads, selectedPadId: state.selectedPadId, padSize: state.padSize,
    masterVolume: state.masterVolume, activeGroup: state.activeGroup, timelines: state.timelines, activeTimelineIndex: state.activeTimelineIndex
  });
};

restoreSnapshot = function restoreSnapshotV2(json) {
  try {
    const parsed = JSON.parse(json); stopAll();
    state.boardTitle = parsed.boardTitle || 'My Soundboard';
    state.pads = Array.isArray(parsed.pads) ? parsed.pads : [];
    state.selectedPadId = parsed.selectedPadId || null;
    state.padSize = parsed.padSize || 'normal'; state.masterVolume = Number.isFinite(parsed.masterVolume) ? parsed.masterVolume : 100;
    state.activeGroup = parsed.activeGroup || 'all'; state.timelines = Array.isArray(parsed.timelines) ? parsed.timelines : [];
    state.activeTimelineIndex = Number(parsed.activeTimelineIndex) || 0; ensureV2State(); renderAll();
    if (typeof renderTimeline === 'function') renderTimeline(); markDirty();
  } catch (error) { console.error('Failed to restore V2 snapshot', error); }
};

loadState = function loadStateV2() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('syro-soundboard-state-v1');
    if (saved) {
      const parsed = JSON.parse(saved); Object.assign(state, {
        boardTitle: parsed.boardTitle || state.boardTitle, pads: Array.isArray(parsed.pads) ? parsed.pads : [], selectedPadId: parsed.selectedPadId || null,
        padSize: parsed.padSize || 'normal', masterVolume: Number.isFinite(parsed.masterVolume) ? parsed.masterVolume : 100,
        activeGroup: parsed.activeGroup || 'all', timelines: Array.isArray(parsed.timelines) ? parsed.timelines : [], activeTimelineIndex: Number(parsed.activeTimelineIndex) || 0
      });
    } else seedDemoPads();
    const savedSettings = localStorage.getItem(SETTINGS_KEY) || localStorage.getItem('syro-soundboard-settings-v1');
    if (savedSettings) Object.assign(settings, JSON.parse(savedSettings));
  } catch (error) { console.warn('Failed to load local state', error); seedDemoPads(); }
  ensureV2State();
};

function statusClass(value) { return value === 'granted' ? 'is-granted' : value === 'denied' ? 'is-denied' : ''; }
function setPermissionState(el, value, label) { if (!el) return; el.className = `permission-state ${statusClass(value)}`; el.textContent = label || value; }

async function queryPermission(name) {
  try { if (navigator.permissions?.query) return (await navigator.permissions.query({ name })).state; } catch (_) {}
  return 'prompt';
}

async function getPermissionSummary() {
  const microphone = await queryPermission('microphone');
  const notifications = 'Notification' in window ? Notification.permission : 'unsupported';
  let persistent = false; try { persistent = Boolean(await navigator.storage?.persisted?.()); } catch (_) {}
  return { microphone, notifications, storage: persistent ? 'granted' : 'prompt' };
}

async function refreshPermissionUi() {
  const summary = await getPermissionSummary();
  setPermissionState(els.startupMicState, summary.microphone, summary.microphone === 'prompt' ? 'Ask' : summary.microphone);
  setPermissionState(els.startupNotifState, summary.notifications, summary.notifications === 'default' ? 'Ask' : summary.notifications);
  setPermissionState(els.startupStorageState, summary.storage, summary.storage === 'prompt' ? 'Optional' : 'Persistent');
  document.querySelectorAll('[data-permission-status]').forEach(el => {
    const key = el.dataset.permissionStatus; const value = summary[key] || 'session';
    el.className = `permission-badge ${statusClass(value)}`; el.innerHTML = `<i></i>${escapeHtml(value === 'default' ? 'Ask' : value)}`;
  });
  return summary;
}

async function requestMicrophonePermission() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone capture is unavailable in this browser.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false } });
  stream.getTracks().forEach(track => track.stop()); return true;
}
async function requestNotificationPermission() {
  if (!('Notification' in window)) throw new Error('Desktop notifications are unavailable in this browser.');
  const result = await Notification.requestPermission(); if (result !== 'granted') throw new Error('Notification permission was not granted.'); return true;
}
async function requestPersistentStorage() { if (!navigator.storage?.persist) return false; try { return await navigator.storage.persist(); } catch (_) { return false; } }

const permissionGuideCopy = {
  microphone:{ title:'Microphone access', text:'Recording needs microphone permission. Syro only captures audio after you start a recording or Live session.', steps:['Press Request permission below.','Choose Allow in your browser permission prompt.','If blocked, click the lock/site icon beside the address and set Microphone to Allow.'] },
  notifications:{ title:'Notification access', text:'Background alerts need browser notification permission. They can be disabled at any time in Settings.', steps:['Press Request permission below.','Choose Allow in the browser prompt.','If blocked, open the site permissions from the address bar and enable Notifications.'] },
  system:{ title:'System / tab audio capture', text:'Browsers require you to choose a screen, window, or tab every time system audio capture starts.', steps:['Press Request source below.','Choose a tab/window/screen in the browser picker.','Enable Share audio when the picker offers it, then confirm Share.'] },
  storage:{ title:'Persistent local storage', text:'Persistent storage reduces the chance that the browser removes locally saved sounds under storage pressure.', steps:['Press Request persistence.','The browser decides whether persistence can be granted.','Backups remain recommended for important boards.'] }
};

function showPermissionGuide(type, afterGranted = null) {
  runtime.permissionGuideType = type; runtime.permissionAfterGranted = afterGranted;
  const copy = permissionGuideCopy[type] || permissionGuideCopy.microphone;
  els.permissionGuideTitle.textContent = copy.title; els.permissionGuideText.textContent = copy.text;
  els.permissionGuideSteps.innerHTML = copy.steps.map((step,i)=>`<div class="guide-step"><b>${i+1}</b><div><strong>${i===0?'Request':i===1?'Browser prompt':'If it is blocked'}</strong><p>${escapeHtml(step)}</p></div></div>`).join('');
  els.permissionGuideRequestBtn.textContent = type === 'system' ? 'Request source' : type === 'storage' ? 'Request persistence' : 'Request permission';
  openModal(els.permissionGuideModal);
}

async function requestCapability(type) {
  if (type === 'microphone') return requestMicrophonePermission();
  if (type === 'notifications') return requestNotificationPermission();
  if (type === 'storage') return requestPersistentStorage();
  if (type === 'system') return true;
  return false;
}

async function requireCapability(type, action) {
  if (type === 'microphone') { const stateValue = await queryPermission('microphone'); if (stateValue === 'granted') return true; }
  if (type === 'notifications' && Notification.permission === 'granted') return true;
  showPermissionGuide(type, action); return false;
}

openModal = function openModalV2(modal) {
  if (!modal) return; els.modalLayer.hidden = false; els.modalLayer.classList.remove('is-closing');
  $$('.modal', els.modalLayer).forEach(item => item.hidden = item !== modal);
  requestAnimationFrame(() => modal.querySelector('button, input, select')?.focus({preventScroll:true}));
};
closeModals = async function closeModalsV2() {
  if (runtime.mediaRecorder && runtime.mediaRecorder.state === 'recording') await stopRecording(true);
  els.modalLayer.classList.add('is-closing');
  setTimeout(()=>{ els.modalLayer.hidden=true; els.modalLayer.classList.remove('is-closing'); $$('.modal',els.modalLayer).forEach(m=>m.hidden=true); },150);
};

const baseToast = toast;
toast = function toastV2(message, type='info', desktop=false) {
  if (settings.inAppNotifications !== false) {
    const item=document.createElement('div'); item.className=`toast toast--${type}`; item.innerHTML=`<i></i><span>${escapeHtml(message)}</span>`; els.toastStack.append(item);
    const life=clamp(Number(settings.notificationDuration)||2500,1200,7000); setTimeout(()=>item.classList.add('is-out'),Math.max(500,life-220)); setTimeout(()=>item.remove(),life);
  }
  if ((desktop || document.hidden) && settings.backgroundNotifications && Notification.permission === 'granted') showDesktopNotification(message);
  if (settings.notificationSound) uiTick(820,.011);
};

async function showDesktopNotification(message) {
  try {
    if ('serviceWorker' in navigator) { const reg=await navigator.serviceWorker.ready; await reg.showNotification('Syro Soundboard',{body:message,tag:'syro-status',renotify:true}); }
    else new Notification('Syro Soundboard',{body:message});
  } catch (_) {}
}

applySettingsToUi = function applySettingsToUiV2() {
  if (els.motionToggle) els.motionToggle.checked = settings.motion !== false;
  if (els.uiSoundsToggle) els.uiSoundsToggle.checked = Boolean(settings.uiSounds);
  if (els.autosaveToggle) els.autosaveToggle.checked = settings.autosave !== false;
  document.body.classList.toggle('reduce-motion', settings.motion === false);
  document.body.classList.toggle('reduce-glow', settings.hoverGlow === false);
  document.body.classList.toggle('compact-ui', Boolean(settings.compactUi));
};

function pulseContextTargets() {
  const pad=selectedPad(); els.selectionContextChip.hidden=!pad;
  if (pad) els.selectionContextChip.querySelector('span').textContent=`Editing ${pad.name}`;
  [els.effectsPanel,els.addSoundBtn,els.recordBtn].forEach(el=>{ if(!el) return; el.classList.remove('context-target-pulse'); void el.offsetWidth; el.classList.add('context-target-pulse'); setTimeout(()=>el.classList.remove('context-target-pulse'),850); });
}

selectPad = function selectPadV2(id) {
  const changed=state.selectedPadId!==id; state.selectedPadId=id;
  $$('.sound-pad',els.padsGrid).forEach(el=>el.classList.toggle('is-selected',el.dataset.padId===id));
  renderEffects(); if(changed)pulseContextTargets();
};
function clearPadSelection(){ if(!state.selectedPadId)return; state.selectedPadId=null; $$('.sound-pad',els.padsGrid).forEach(el=>el.classList.remove('is-selected')); renderEffects(); els.selectionContextChip.hidden=true; }

// Keep one IndexedDB connection alive instead of opening/closing it for every sound operation.
openDb = function openDbFast(){
  if(runtime.dbPromise)return runtime.dbPromise;
  runtime.dbPromise=new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,DB_VERSION);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(AUDIO_STORE))db.createObjectStore(AUDIO_STORE)};request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();runtime.dbPromise=null};resolve(db)};request.onerror=()=>{runtime.dbPromise=null;reject(request.error)}});return runtime.dbPromise;
};
idbSet=async function idbSetFast(key,value){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(AUDIO_STORE,'readwrite');tx.objectStore(AUDIO_STORE).put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})};
idbGet=async function idbGetFast(key){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(AUDIO_STORE,'readonly');const req=tx.objectStore(AUDIO_STORE).get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})};
idbDelete=async function idbDeleteFast(key){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(AUDIO_STORE,'readwrite');tx.objectStore(AUDIO_STORE).delete(key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})};
