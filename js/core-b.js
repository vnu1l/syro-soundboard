function markDirty() {
  state.dirty = true;
  els.saveState.classList.add('is-dirty');
  els.saveState.innerHTML = '<i></i> Unsaved changes';
  if (settings.autosave) {
    clearTimeout(state.autosaveTimer);
    state.autosaveTimer = setTimeout(saveState, 450);
  }
}

function saveState(showToast = false) {
  clearTimeout(state.autosaveTimer);
  try {
    localStorage.setItem(STORAGE_KEY, snapshot());
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    state.dirty = false;
    els.saveState.classList.remove('is-dirty');
    els.saveState.innerHTML = '<i></i> Saved locally';
    if (showToast) toast('Board saved locally');
  } catch (error) {
    console.error(error);
    els.saveState.innerHTML = '<i></i> Save failed';
    toast('Could not save local board');
  }
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      state.boardTitle = parsed.boardTitle || state.boardTitle;
      state.pads = Array.isArray(parsed.pads) ? parsed.pads : [];
      state.selectedPadId = parsed.selectedPadId || null;
      state.padSize = parsed.padSize || 'normal';
      state.masterVolume = Number.isFinite(parsed.masterVolume) ? parsed.masterVolume : 100;
      state.activeGroup = parsed.activeGroup || 'all';
    } else {
      seedDemoPads();
    }
    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    if (savedSettings) Object.assign(settings, JSON.parse(savedSettings));
  } catch (error) {
    console.warn('Failed to load local state', error);
    seedDemoPads();
  }
}

function seedDemoPads() {
  state.pads = [
    makePad({ name: 'Deep Pulse', kind: 'synth', synth: 'pulse', duration: 0.55, shortcut: '1', color: accentPalette[0], group: 'effects' }),
    makePad({ name: 'Soft Ping', kind: 'synth', synth: 'ping', duration: 0.8, shortcut: '2', color: accentPalette[1], group: 'effects', effects: { ...defaultEffects(), reverb: 20 } }),
    makePad({ name: 'Bass Hit', kind: 'synth', synth: 'bass', duration: 0.45, shortcut: '3', color: accentPalette[2], group: 'effects', effects: { ...defaultEffects(), bass: 8 } }),
    makePad({ name: 'Air Sweep', kind: 'synth', synth: 'sweep', duration: 1.2, shortcut: '4', color: accentPalette[3], group: 'effects', effects: { ...defaultEffects(), reverb: 12 } }),
  ];
}

function makePad(overrides = {}) {
  return {
    id: uid(),
    name: overrides.name || 'Untitled sound',
    kind: overrides.kind || 'file',
    audioKey: overrides.audioKey || null,
    mime: overrides.mime || '',
    synth: overrides.synth || null,
    duration: overrides.duration || 0,
    shortcut: overrides.shortcut || '',
    playbackMode: overrides.playbackMode || 'restart',
    effects: { ...defaultEffects(), ...(overrides.effects || {}) },
    color: overrides.color || accentPalette[state.pads.length % accentPalette.length],
    group: overrides.group || 'all',
    favorite: Boolean(overrides.favorite),
    createdAt: overrides.createdAt || Date.now(),
  };
}

function selectedPad() {
  return state.pads.find(p => p.id === state.selectedPadId) || null;
}

function filteredPads() {
  const term = state.search.trim().toLowerCase();
  return state.pads.filter(pad => {
    const groupMatch = state.activeGroup === 'all' ||
      (state.activeGroup === 'favorites' && pad.favorite) ||
      pad.group === state.activeGroup;
    const searchMatch = !term || pad.name.toLowerCase().includes(term) || pad.shortcut.toLowerCase().includes(term);
    return groupMatch && searchMatch;
  });
}

function waveformBars(id, count = 29) {
  let seed = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) || 17;
  const bars = [];
  for (let i = 0; i < count; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    const value = 5 + Math.round((seed / 233280) * 22);
    bars.push(`<i style="--h:${value}px"></i>`);
  }
  return bars.join('');
}

function modeLabel(mode) {
  return ({ restart: 'Restart', overlap: 'Stack', toggle: 'Toggle', loop: 'Loop', oneshot: 'One shot' })[mode] || 'Restart';
}

function formatDuration(seconds) {
  if (!seconds || !Number.isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function renderPads() {
  const pads = filteredPads();
  els.padsGrid.dataset.size = state.padSize;
  els.padsGrid.innerHTML = pads.map((pad, index) => `
    <button class="sound-pad ${pad.id === state.selectedPadId ? 'is-selected' : ''} ${isPadPlaying(pad.id) ? 'is-playing' : ''}" data-pad-id="${pad.id}" style="--pad-accent:${pad.color};animation-delay:${Math.min(index * 25, 200)}ms" type="button">
      <span class="sound-pad__top">
        <span class="sound-pad__icon"><svg><use href="#i-wave"></use></svg></span>
        <span class="sound-pad__mode">${escapeHtml(modeLabel(pad.playbackMode))}</span>
      </span>
      <span class="sound-pad__wave">${waveformBars(pad.id)}</span>
      <span class="sound-pad__bottom">
        <span class="sound-pad__info"><strong>${escapeHtml(pad.name)}</strong><small>${formatDuration(pad.duration)}</small></span>
        <kbd class="sound-pad__key">${pad.shortcut ? escapeHtml(pad.shortcut) : '—'}</kbd>
      </span>
      <span class="sound-pad__progress"></span>
    </button>
  `).join('');
  els.emptyAddBtn.classList.toggle('is-visible', state.pads.length === 0);
  bindPadPointerGlow();
}

function renderCounts() {
  els.allCount.textContent = state.pads.length;
  $$('.group-item', els.groupsList).forEach(button => {
    const group = button.dataset.group;
    button.classList.toggle('is-active', group === state.activeGroup);
    const em = $('em', button);
    if (!em || group === 'all') return;
    em.textContent = group === 'favorites'
      ? state.pads.filter(p => p.favorite).length
      : state.pads.filter(p => p.group === group).length;
  });
}

function renderEffects() {
  const pad = selectedPad();
  const enabled = Boolean(pad);
  effectControls.forEach(([, control]) => control.disabled = !enabled);
  els.playbackModeSelect.disabled = !enabled;
  els.shortcutCapture.disabled = !enabled;
  els.addEffectBtn.disabled = !enabled;

  if (!pad) {
    els.selectedSoundSummary.innerHTML = '<div class="selected-sound__icon"><svg><use href="#i-wave"></use></svg></div><div><strong>No sound selected</strong><small>Select a pad to edit it</small></div>';
    setEffectControl('volume', 100);
    setEffectControl('bass', 0);
    setEffectControl('reverb', 0);
    setEffectControl('echo', 0);
    setEffectControl('pan', 0);
    els.playbackModeSelect.value = 'restart';
    els.shortcutCapture.textContent = 'None';
    return;
  }

  els.selectedSoundSummary.innerHTML = `<div class="selected-sound__icon" style="color:${pad.color};border-color:${pad.color}33;background:${pad.color}12"><svg><use href="#i-wave"></use></svg></div><div><strong>${escapeHtml(pad.name)}</strong><small>${formatDuration(pad.duration)} · ${escapeHtml(modeLabel(pad.playbackMode))}</small></div>`;
  Object.entries(pad.effects).forEach(([key, value]) => setEffectControl(key, value));
  els.playbackModeSelect.value = pad.playbackMode;
  els.shortcutCapture.textContent = pad.shortcut || 'None';
}

function setEffectControl(name, value) {
  const map = {
    volume: [els.volumeRange, els.volumeOut, `${value}%`],
    bass: [els.bassRange, els.bassOut, `${value > 0 ? '+' : ''}${value} dB`],
    reverb: [els.reverbRange, els.reverbOut, `${value}%`],
    echo: [els.echoRange, els.echoOut, `${value}%`],
    pan: [els.panRange, els.panOut, value === 0 ? 'Center' : `${Math.abs(value)} ${value < 0 ? 'L' : 'R'}`],
  };
  const entry = map[name];
  if (!entry) return;
  const [input, output, text] = entry;
  input.value = value;
  output.textContent = text;
  paintRange(input);
}

function renderMaster() {
  els.masterVolumeRange.value = state.masterVolume;
  els.masterVolumeOut.textContent = `${state.masterVolume}%`;
  paintRange(els.masterVolumeRange);
  if (runtime.masterGain) runtime.masterGain.gain.value = state.masterVolume / 100;
}

function renderAll() {
  els.boardTitle.textContent = state.boardTitle;
  els.padSizeSelect.value = state.padSize;
  els.searchInput.value = state.search;
  renderPads();
  renderCounts();
  renderEffects();
  renderMaster();
  updateHistoryButtons();
  applySettingsToUi();
}

