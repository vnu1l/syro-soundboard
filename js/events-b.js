
els.effectsResetBtn.addEventListener('click', resetEffects);
effectControls.forEach(([name, control]) => {
  control.addEventListener('pointerdown', () => { runtime.effectGestureBefore = snapshot(); });
  control.addEventListener('input', () => {
    const pad = selectedPad();
    if (!pad) return;
    pad.effects[name] = Number(control.value);
    setEffectControl(name, pad.effects[name]);
    updateLiveNodes(pad);
    markDirty();
  });
  control.addEventListener('change', () => {
    commitHistory(runtime.effectGestureBefore);
    runtime.effectGestureBefore = null;
  });
  control.addEventListener('keydown', () => {
    if (!runtime.effectGestureBefore) runtime.effectGestureBefore = snapshot();
  });
  control.addEventListener('keyup', () => {
    commitHistory(runtime.effectGestureBefore);
    runtime.effectGestureBefore = null;
  });
});

els.playbackModeSelect.addEventListener('change', () => {
  const pad = selectedPad();
  if (!pad) return;
  const before = snapshot();
  pad.playbackMode = els.playbackModeSelect.value;
  stopPad(pad.id);
  commitHistory(before);
  renderAll();
});

els.shortcutCapture.addEventListener('click', () => {
  if (!selectedPad()) return;
  runtime.shortcutListening = true;
  els.shortcutCapture.classList.add('is-listening');
  els.shortcutCapture.textContent = 'Press keys…';
  setTimeout(() => {
    if (runtime.shortcutListening) {
      runtime.shortcutListening = false;
      els.shortcutCapture.classList.remove('is-listening');
      els.shortcutCapture.textContent = selectedPad()?.shortcut || 'None';
    }
  }, 8000);
});

els.addEffectBtn.addEventListener('click', () => toast('More effect modules will plug into this chain here'));
els.exportBtn?.addEventListener('click', exportBackup);

els.motionToggle?.addEventListener('change', () => { settings.motion = els.motionToggle.checked; applySettingsToUi(); saveState(); });
els.uiSoundsToggle?.addEventListener('change', () => { settings.uiSounds = els.uiSoundsToggle.checked; saveState(); uiTick(720, .015); });
els.autosaveToggle?.addEventListener('change', () => { settings.autosave = els.autosaveToggle.checked; saveState(); });

for (const input of $$('input[type="range"]')) paintRange(input);

// Custom hotkeys, app shortcuts and copy protection.
document.addEventListener('keydown', event => {
  if (runtime.shortcutListening) {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      runtime.shortcutListening = false;
      els.shortcutCapture.classList.remove('is-listening');
      els.shortcutCapture.textContent = selectedPad()?.shortcut || 'None';
      return;
    }
    const value = shortcutFromEvent(event);
    if (!value) return;
    const pad = selectedPad();
    const conflict = state.pads.find(item => item.id !== pad.id && normalizeShortcut(item.shortcut) === normalizeShortcut(value));
    const before = snapshot();
    pad.shortcut = value;
    runtime.shortcutListening = false;
    els.shortcutCapture.classList.remove('is-listening');
    commitHistory(before);
    renderAll();
    toast(conflict ? `Shortcut moved from ${conflict.name}` : `Shortcut set to ${value}`);
    if (conflict) {
      conflict.shortcut = '';
      renderAll();
      markDirty();
    }
    return;
  }

  const typing = isTypingTarget(event.target);
  const key = event.key.toLowerCase();
  if (!typing && event.ctrlKey && key === 'k') { event.preventDefault(); els.searchInput.focus(); els.searchInput.select(); return; }
  if (!typing && event.ctrlKey && key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); return; }
  if (!typing && ((event.ctrlKey && event.shiftKey && key === 'z') || (event.ctrlKey && key === 'y'))) { event.preventDefault(); redo(); return; }
  if (!typing && event.ctrlKey && key === 's') { event.preventDefault(); saveState(true); return; }
  if (!typing && event.ctrlKey && key === 'c' && selectedPad()) { event.preventDefault(); copyPad(state.selectedPadId); return; }
  if (!typing && event.ctrlKey && key === 'x' && selectedPad()) { event.preventDefault(); copyPad(state.selectedPadId, true); return; }
  if (!typing && event.ctrlKey && key === 'v') { event.preventDefault(); pastePad(); return; }
  if (!typing && event.ctrlKey && key === 'd' && selectedPad()) { event.preventDefault(); duplicatePad(state.selectedPadId); return; }
  if (!typing && event.key === 'Delete' && selectedPad()) { event.preventDefault(); deletePad(state.selectedPadId); return; }
  if (!typing && event.key === 'F2' && selectedPad()) { event.preventDefault(); renamePad(state.selectedPadId); return; }
  if (!typing && event.code === 'Space' && selectedPad()) { event.preventDefault(); playPad(state.selectedPadId); return; }
  if (!typing && event.key === 'Escape') { hideContextMenu(); stopAll(); return; }

  if (!typing && !event.repeat) {
    const pressed = normalizeShortcut(shortcutFromEvent(event));
    const pad = state.pads.find(item => item.shortcut && normalizeShortcut(item.shortcut) === pressed);
    if (pad) { event.preventDefault(); playPad(pad.id); }
  }
});

// Disable browser copy/cut/context menu outside editable text while preserving our app shortcuts.
document.addEventListener('copy', event => { if (!isTypingTarget(event.target)) event.preventDefault(); });
document.addEventListener('cut', event => { if (!isTypingTarget(event.target)) event.preventDefault(); });
document.addEventListener('selectstart', event => { if (!isTypingTarget(event.target)) event.preventDefault(); });
document.addEventListener('contextmenu', event => {
  if (!isTypingTarget(event.target) && !event.target.closest('.sound-pad')) event.preventDefault();
});

// Drag & drop audio from the desktop.
window.addEventListener('dragenter', event => {
  if (![...event.dataTransfer.types].includes('Files')) return;
  runtime.dragDepth++;
  els.dropOverlay.classList.add('is-visible');
});
window.addEventListener('dragover', event => {
  if (![...event.dataTransfer.types].includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
});
window.addEventListener('dragleave', () => {
  runtime.dragDepth = Math.max(0, runtime.dragDepth - 1);
  if (!runtime.dragDepth) els.dropOverlay.classList.remove('is-visible');
});
window.addEventListener('drop', async event => {
  event.preventDefault();
  runtime.dragDepth = 0;
  els.dropOverlay.classList.remove('is-visible');
  await addFiles(event.dataTransfer.files);
});

// Keep work safe when the page is hidden or being closed.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && state.dirty) saveState();
});
window.addEventListener('beforeunload', () => { if (state.dirty) saveState(); });

// Service worker is optional; localhost and HTTPS only.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

loadState();
renderAll();
bindGlobalPointerGlow();
if(typeof ensureV2State==='function')ensureV2State();
