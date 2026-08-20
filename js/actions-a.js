async function addFiles(files) {
  const audioFiles = [...files].filter(file => file.type.startsWith('audio/'));
  if (!audioFiles.length) return toast('No supported audio files found');
  const before = snapshot();
  let added = 0;
  for (const file of audioFiles) {
    try {
      const audioKey = `audio:${uid()}`;
      await idbSet(audioKey, file);
      let duration = 0;
      try {
        const arrayBuffer = await file.arrayBuffer();
        const decoded = await audioContext().decodeAudioData(arrayBuffer.slice(0));
        duration = decoded.duration;
      } catch (_) {}
      state.pads.push(makePad({
        name: file.name.replace(/\.[^.]+$/, ''),
        audioKey,
        mime: file.type,
        duration,
        color: accentPalette[state.pads.length % accentPalette.length],
      }));
      added++;
    } catch (error) {
      console.error('Failed to add file', file.name, error);
    }
  }
  if (added) {
    commitHistory(before);
    state.selectedPadId = state.pads.at(-1)?.id || null;
    renderAll();
    markDirty();
    toast(`${added} sound${added === 1 ? '' : 's'} added`);
  }
}

function duplicatePad(id) {
  const sourcePad = state.pads.find(p => p.id === id);
  if (!sourcePad) return;
  const before = snapshot();
  const clone = JSON.parse(JSON.stringify(sourcePad));
  clone.id = uid();
  clone.name = `${sourcePad.name} copy`;
  clone.shortcut = '';
  clone.createdAt = Date.now();
  const index = state.pads.findIndex(p => p.id === id);
  state.pads.splice(index + 1, 0, clone);
  if (runtime.buffers.has(id)) runtime.buffers.set(clone.id, runtime.buffers.get(id));
  state.selectedPadId = clone.id;
  commitHistory(before);
  renderAll();
  toast('Sound duplicated');
}

function copyPad(id, cut = false) {
  const pad = state.pads.find(p => p.id === id);
  if (!pad) return;
  state.clipboard = JSON.parse(JSON.stringify(pad));
  state.cutId = cut ? id : null;
  toast(cut ? 'Sound cut' : 'Sound copied');
}

function pastePad() {
  if (!state.clipboard) return;
  const before = snapshot();
  const clone = JSON.parse(JSON.stringify(state.clipboard));
  const originalId = clone.id;
  clone.id = uid();
  clone.name = state.cutId ? clone.name : `${clone.name} copy`;
  clone.shortcut = '';
  clone.createdAt = Date.now();
  state.pads.push(clone);
  if (runtime.buffers.has(originalId)) runtime.buffers.set(clone.id, runtime.buffers.get(originalId));
  if (state.cutId) {
    const removeIndex = state.pads.findIndex(p => p.id === state.cutId);
    if (removeIndex >= 0) state.pads.splice(removeIndex, 1);
    stopPad(state.cutId);
    runtime.buffers.delete(state.cutId);
    state.cutId = null;
    state.clipboard = null;
  }
  state.selectedPadId = clone.id;
  commitHistory(before);
  renderAll();
  toast('Sound pasted');
}

async function deletePad(id) {
  const index = state.pads.findIndex(p => p.id === id);
  if (index < 0) return;
  const before = snapshot();
  const [pad] = state.pads.splice(index, 1);
  stopPad(id);
  runtime.buffers.delete(id);
  // Keep the stored audio blob so Undo can fully restore a deleted pad.
  // Orphan cleanup can be performed later from storage maintenance settings.
  if (state.selectedPadId === id) state.selectedPadId = state.pads[index]?.id || state.pads[index - 1]?.id || null;
  commitHistory(before);
  renderAll();
  toast('Sound deleted');
}

function renamePad(id) {
  const pad = state.pads.find(p => p.id === id);
  if (!pad) return;
  const next = window.prompt('Rename sound', pad.name);
  if (!next || next.trim() === pad.name) return;
  const before = snapshot();
  pad.name = next.trim().slice(0, 80);
  commitHistory(before);
  renderAll();
}

function resetEffects() {
  const pad = selectedPad();
  if (!pad) return;
  const before = snapshot();
  pad.effects = defaultEffects();
  updateLiveNodes(pad);
  commitHistory(before);
  renderEffects();
  toast('Effects reset');
}

function shortcutFromEvent(event) {
  const ignored = ['Shift', 'Control', 'Alt', 'Meta'];
  if (ignored.includes(event.key)) return '';
  const parts = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Meta');
  let key = event.key;
  if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toUpperCase();
  else key = key.replace(/^Arrow/, '');
  parts.push(key);
  return parts.join('+');
}

function normalizeShortcut(value) {
  return value.replaceAll(' ', '').toLowerCase();
}

function isTypingTarget(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
}

