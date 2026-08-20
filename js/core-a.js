'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const STORAGE_KEY = 'syro-soundboard-state-v2';
const SETTINGS_KEY = 'syro-soundboard-settings-v2';
const ONBOARDING_KEY = 'syro-soundboard-onboarding-v2';
const TUTORIAL_KEY = 'syro-soundboard-tutorial-v2';
const DB_NAME = 'syro-soundboard-audio';
const DB_VERSION = 1;
const AUDIO_STORE = 'audio';
const accentPalette = ['#955cff', '#8b68ff', '#b05cff', '#7657ef', '#ad6cf2', '#7868d9'];

const defaultEffects = () => ({ volume:100,bass:0,reverb:0,echo:0,pan:0,treble:0,lowpass:20000,drive:0,compression:0,pitch:0 });

const state = {
  boardTitle: 'My Soundboard',
  pads: [],
  selectedPadId: null,
  padSize: 'normal',
  masterVolume: 100,
  activeGroup: 'all',
  search: '',
  clipboard: null,
  cutId: null,
  undoStack: [],
  redoStack: [],
  maxHistory: 120,
  dirty: false,
  autosaveTimer: null,
  timelines: [],
  activeTimelineIndex: 0,
};

const settings = {
  motion:true, uiSounds:false, autosave:true, hoverGlow:true, compactUi:false,
  inAppNotifications:true, desktopNotifications:false, backgroundNotifications:false, notificationSound:false, notificationDuration:2500,
  persistentStorage:true, confirmDelete:false, maxPolyphony:8, defaultPlaybackMode:'restart', autoOpenTimeline:false
};

const runtime = {
  audioContext: null,
  masterGain:null, captureDestination:null,
  buffers: new Map(),
  active: new Map(),
  reverbImpulse: null,
  contextPadId: null,
  effectGestureBefore: null,
  shortcutListening: false,
  mediaRecorder: null,
  mediaStream: null,
  mediaChunks: [],
  recordStartedAt: 0,
  recordTimerId: null,
  recordAnalyser: null,
  recordAnimationId: null,
  dragDepth:0, recordTarget:'new-pad', permissionGuideType:null,
  timelineSelection:new Set(), timelineVisibleSources:new Set(['board','mic','system']), timelinePanning:false, timelinePanStartX:0, timelinePanStartScroll:0,
  liveSession:null, liveTimerId:null, timelineVoices:[], timelinePlaybackRaf:0, timelinePlaybackStartedAt:0, tutorialStep:0, libraryTab:'sounds', libraryCategory:'all', librarySearch:'',
};

const els = {
  padsGrid: $('#padsGrid'),
  emptyAddBtn: $('#emptyAddBtn'),
  addSoundBtn: $('#addSoundBtn'),
  audioFileInput: $('#audioFileInput'),
  recordBtn: $('#recordBtn'),
  undoBtn: $('#undoBtn'),
  redoBtn: $('#redoBtn'),
  saveBtn: $('#saveBtn'),
  searchInput: $('#searchInput'),
  settingsBtn: $('#settingsBtn'),
  timelineToggleBtn:$('#timelineToggleBtn'), timelinePanel:$('#timelinePanel'), timelineViewport:$('#timelineViewport'), timelineCanvas:$('#timelineCanvas'), timelineRuler:$('#timelineRuler'), timelinePlayhead:$('#timelinePlayhead'), timelineName:$('#timelineName'), timelineMeta:$('#timelineMeta'), timelinePrevBtn:$('#timelinePrevBtn'), timelineNextBtn:$('#timelineNextBtn'), timelineNewBtn:$('#timelineNewBtn'), timelinePlayBtn:$('#timelinePlayBtn'), timelineStopBtn:$('#timelineStopBtn'), timelineAddBtn:$('#timelineAddBtn'), timelineRecordBtn:$('#timelineRecordBtn'), timelineLiveBtn:$('#timelineLiveBtn'), timelineStopLiveBtn:$('#timelineStopLiveBtn'), timelineZoomRange:$('#timelineZoomRange'), timelineFileInput:$('#timelineFileInput'),
  libraryBtn:$('#libraryBtn'), libraryDrawer:$('#libraryDrawer'), libraryScrim:$('#libraryScrim'), libraryCloseBtn:$('#libraryCloseBtn'), librarySearchInput:$('#librarySearchInput'), libraryGrid:$('#libraryGrid'), libraryCategories:$('#libraryCategories'),
  selectionContextChip:$('#selectionContextChip'),
  newGroupBtn: $('#newGroupBtn'),
  groupsList: $('#groupsList'),
  allCount: $('#allCount'),
  boardTitle: $('#boardTitle'),
  saveState: $('#saveState'),
  padSizeSelect: $('#padSizeSelect'),
  boardMenuBtn: $('#boardMenuBtn'),
  selectedSoundSummary: $('#selectedSoundSummary'),
  effectsResetBtn: $('#effectsResetBtn'),
  volumeRange: $('#volumeRange'),
  bassRange: $('#bassRange'),
  reverbRange: $('#reverbRange'),
  echoRange: $('#echoRange'),
  panRange: $('#panRange'),
  volumeOut: $('#volumeOut'),
  bassOut: $('#bassOut'),
  reverbOut: $('#reverbOut'),
  echoOut: $('#echoOut'),
  panOut: $('#panOut'),
  playbackModeSelect: $('#playbackModeSelect'),
  shortcutCapture: $('#shortcutCapture'),
  addEffectBtn: $('#addEffectBtn'),
  stopAllBtn: $('#stopAllBtn'),
  transport: $('.transport'),
  nowPlayingText: $('#nowPlayingText'),
  masterVolumeRange: $('#masterVolumeRange'),
  masterVolumeOut: $('#masterVolumeOut'),
  contextMenu: $('#contextMenu'),
  modalLayer: $('#modalLayer'),
  recordModal: $('#recordModal'),
  settingsModal: $('#settingsModal'),
  recordToggleBtn: $('#recordToggleBtn'),
  recorderOrb: $('#recorderOrb'),
  recordMeter: $('#recordMeter'),
  recordTimer: $('#recordTimer'),
  recordStatus: $('#recordStatus'),
  motionToggle: $('#motionToggle'),
  uiSoundsToggle: $('#uiSoundsToggle'),
  autosaveToggle: $('#autosaveToggle'),
  exportBtn: $('#exportBtn'),
  settingsTabs:$('#settingsTabs'), settingsContent:$('#settingsContent'), permissionGuideModal:$('#permissionGuideModal'), permissionGuideTitle:$('#permissionGuideTitle'), permissionGuideText:$('#permissionGuideText'), permissionGuideSteps:$('#permissionGuideSteps'), permissionGuideRequestBtn:$('#permissionGuideRequestBtn'),
  startupLayer:$('#startupLayer'), startupGrantBtn:$('#startupGrantBtn'), startupLimitedBtn:$('#startupLimitedBtn'), startupMicState:$('#startupMicState'), startupNotifState:$('#startupNotifState'), startupStorageState:$('#startupStorageState'),
  tutorialLayer:$('#tutorialLayer'), tutorialSpotlight:$('#tutorialSpotlight'), tutorialCard:$('#tutorialCard'), tutorialCount:$('#tutorialCount'), tutorialTitle:$('#tutorialTitle'), tutorialText:$('#tutorialText'), tutorialNextBtn:$('#tutorialNextBtn'), tutorialSkipStep:$('#tutorialSkipStep'), tutorialSkipAll:$('#tutorialSkipAll'),
  toastStack: $('#toastStack'),
  dropOverlay: $('#dropOverlay'),
};

const effectControls = [
  ['volume', els.volumeRange],
  ['bass', els.bassRange],
  ['reverb', els.reverbRange],
  ['echo', els.echoRange],
  ['pan', els.panRange],
  ['treble', $('#trebleRange')], ['lowpass',$('#lowpassRange')], ['drive',$('#driveRange')], ['compression',$('#compressionRange')], ['pitch',$('#pitchRange')],
];
els.trebleRange=$('#trebleRange'); els.lowpassRange=$('#lowpassRange'); els.driveRange=$('#driveRange'); els.compressionRange=$('#compressionRange'); els.pitchRange=$('#pitchRange');
els.trebleOut=$('#trebleOut'); els.lowpassOut=$('#lowpassOut'); els.driveOut=$('#driveOut'); els.compressionOut=$('#compressionOut'); els.pitchOut=$('#pitchOut');

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE)) db.createObjectStore(AUDIO_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, 'readwrite');
    tx.objectStore(AUDIO_STORE).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, 'readonly');
    const req = tx.objectStore(AUDIO_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function idbDelete(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, 'readwrite');
    tx.objectStore(AUDIO_STORE).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

function snapshot() {
  return JSON.stringify({
    boardTitle: state.boardTitle,
    pads: state.pads,
    selectedPadId: state.selectedPadId,
    padSize: state.padSize,
    masterVolume: state.masterVolume,
    activeGroup: state.activeGroup,
  });
}

function restoreSnapshot(json) {
  try {
    const parsed = JSON.parse(json);
    stopAll();
    state.boardTitle = parsed.boardTitle || 'My Soundboard';
    state.pads = Array.isArray(parsed.pads) ? parsed.pads : [];
    state.selectedPadId = parsed.selectedPadId || null;
    state.padSize = parsed.padSize || 'normal';
    state.masterVolume = Number.isFinite(parsed.masterVolume) ? parsed.masterVolume : 100;
    state.activeGroup = parsed.activeGroup || 'all';
    renderAll();
    markDirty();
  } catch (error) {
    console.error('Failed to restore history snapshot', error);
  }
}

function commitHistory(before) {
  if (!before || before === snapshot()) return;
  state.undoStack.push(before);
  if (state.undoStack.length > state.maxHistory) state.undoStack.shift();
  state.redoStack.length = 0;
  updateHistoryButtons();
  markDirty();
}

function undo() {
  if (!state.undoStack.length) return;
  const current = snapshot();
  const previous = state.undoStack.pop();
  state.redoStack.push(current);
  restoreSnapshot(previous);
  updateHistoryButtons();
  toast('Undid last change');
}

function redo() {
  if (!state.redoStack.length) return;
  const current = snapshot();
  const next = state.redoStack.pop();
  state.undoStack.push(current);
  restoreSnapshot(next);
  updateHistoryButtons();
  toast('Redid change');
}

function updateHistoryButtons() {
  els.undoBtn.disabled = state.undoStack.length === 0;
  els.redoBtn.disabled = state.redoStack.length === 0;
}

