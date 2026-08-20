// ---- Event wiring ---------------------------------------------------------

els.addSoundBtn.addEventListener('click', () => els.audioFileInput.click());
els.emptyAddBtn.addEventListener('click', () => els.audioFileInput.click());
els.audioFileInput.addEventListener('change', async () => {
  await addFiles(els.audioFileInput.files);
  els.audioFileInput.value = '';
});

els.recordBtn.addEventListener('click', () => openModal(els.recordModal));
els.settingsBtn.addEventListener('click', () => openModal(els.settingsModal));
$$('[data-close-modal]').forEach(button => button.addEventListener('click', closeModals));
$('.modal-backdrop').addEventListener('click', closeModals);

els.recordToggleBtn.addEventListener('click', async () => {
  if (runtime.mediaRecorder?.state === 'recording') await stopRecording(false);
  else await startRecording();
});

els.undoBtn.addEventListener('click', undo);
els.redoBtn.addEventListener('click', redo);
els.saveBtn.addEventListener('click', () => saveState(true));
els.stopAllBtn.addEventListener('click', () => { stopAll(); uiTick(260, .015); });

els.searchInput.addEventListener('input', () => {
  state.search = els.searchInput.value;
  renderPads();
});

els.padSizeSelect.addEventListener('change', () => {
  const before = snapshot();
  state.padSize = els.padSizeSelect.value;
  commitHistory(before);
  renderPads();
});

els.masterVolumeRange.addEventListener('input', () => {
  state.masterVolume = Number(els.masterVolumeRange.value);
  els.masterVolumeOut.textContent = `${state.masterVolume}%`;
  paintRange(els.masterVolumeRange);
  if (runtime.masterGain) runtime.masterGain.gain.value = state.masterVolume / 100;
  markDirty();
});

els.masterVolumeRange.addEventListener('change', () => markDirty());

els.boardTitle.addEventListener('focus', () => { els.boardTitle.dataset.before = snapshot(); });
els.boardTitle.addEventListener('input', () => {
  state.boardTitle = els.boardTitle.textContent.trim().slice(0, 80) || 'My Soundboard';
  markDirty();
});
els.boardTitle.addEventListener('blur', () => {
  const before = els.boardTitle.dataset.before;
  commitHistory(before);
  els.boardTitle.textContent = state.boardTitle;
});
els.boardTitle.addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); els.boardTitle.blur(); }
});

els.groupsList.addEventListener('click', event => {
  const item = event.target.closest('.group-item');
  if (!item) return;
  state.activeGroup = item.dataset.group;
  renderCounts();
  renderPads();
  uiTick(500, .009);
});

els.newGroupBtn.addEventListener('click', () => toast('Custom groups are next in the board editor'));
els.boardMenuBtn.addEventListener('click', () => toast('Board menu: backup, layout and import tools are being expanded'));

els.padsGrid.addEventListener('click', event => {
  const pad = event.target.closest('.sound-pad');
  if (!pad) return;
  const id = pad.dataset.padId;
  selectPad(id);
  playPad(id);
});

els.padsGrid.addEventListener('contextmenu', event => {
  const pad = event.target.closest('.sound-pad');
  if (!pad) return;
  showContextMenu(event, pad.dataset.padId);
});

els.contextMenu.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button || !runtime.contextPadId) return;
  const id = runtime.contextPadId;
  const action = button.dataset.action;
  hideContextMenu();
  if (action === 'play') playPad(id);
  else if (action === 'stop') stopPad(id);
  else if (action === 'copy') copyPad(id);
  else if (action === 'duplicate') duplicatePad(id);
  else if (action === 'rename') renamePad(id);
  else if (action === 'delete') deletePad(id);
});

document.addEventListener('pointerdown', event => {
  if (!event.target.closest('#contextMenu')) hideContextMenu();
});
window.addEventListener('blur', hideContextMenu);
window.addEventListener('resize', hideContextMenu, { passive: true });
