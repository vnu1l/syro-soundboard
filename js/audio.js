function paintRange(input) {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value);
  const pct = ((value - min) / (max - min)) * 100;
  input.style.setProperty('--pct', `${pct}%`);
}

function selectPad(id) {
  state.selectedPadId = id;
  renderPads();
  renderEffects();
}

function audioContext() {
  if (!runtime.audioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    runtime.audioContext = new Ctx({ latencyHint: 'interactive' });
    runtime.masterGain = runtime.audioContext.createGain();
    runtime.masterGain.gain.value=state.masterVolume/100;
    runtime.captureDestination=runtime.audioContext.createMediaStreamDestination();
    runtime.masterGain.connect(runtime.audioContext.destination); runtime.masterGain.connect(runtime.captureDestination);
    runtime.reverbImpulse = createImpulseResponse(runtime.audioContext, 2.2, 2.4);
  }
  if (runtime.audioContext.state === 'suspended') runtime.audioContext.resume();
  return runtime.audioContext;
}

function createImpulseResponse(ctx, duration = 2, decay = 2) {
  const rate = ctx.sampleRate;
  const length = rate * duration;
  const impulse = ctx.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  return impulse;
}

function createSynthBuffer(kind) {
  const ctx = audioContext();
  const durations = { pulse: .55, ping: .8, bass: .45, sweep: 1.2 };
  const duration = durations[kind] || .6;
  const length = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const t = i / ctx.sampleRate;
    const fade = Math.pow(1 - i / length, kind === 'sweep' ? 1.8 : 3.2);
    if (kind === 'pulse') data[i] = Math.sin(2 * Math.PI * (78 + 22 * Math.exp(-t * 10)) * t) * fade * .75;
    else if (kind === 'ping') data[i] = (Math.sin(2 * Math.PI * 620 * t) + .32 * Math.sin(2 * Math.PI * 1240 * t)) * fade * .35;
    else if (kind === 'bass') data[i] = Math.sin(2 * Math.PI * (105 - 45 * t) * t) * fade * .85;
    else {
      const noise = Math.random() * 2 - 1;
      const envelope = Math.sin(Math.PI * clamp(t / duration, 0, 1));
      data[i] = noise * envelope * .12;
    }
  }
  return buffer;
}

async function getBuffer(pad) {
  if (runtime.buffers.has(pad.id)) return runtime.buffers.get(pad.id);
  let buffer;
  if (pad.kind === 'synth') buffer = createSynthBuffer(pad.synth);
  else {
    const blob = await idbGet(pad.audioKey);
    if (!blob) throw new Error('Audio file not found in local storage');
    const arrayBuffer = await blob.arrayBuffer();
    buffer = await audioContext().decodeAudioData(arrayBuffer.slice(0));
  }
  runtime.buffers.set(pad.id, buffer);
  return buffer;
}

function makeDriveCurve(amount = 0) {
  const samples = 256; const curve = new Float32Array(samples); const k = Math.max(0, amount) * 3;
  if (!k) { for (let i=0;i<samples;i++) curve[i]=(i*2/(samples-1))-1; return curve; }
  for (let i=0;i<samples;i++) { const x=(i*2/(samples-1))-1; curve[i]=((1+k)*x)/(1+k*Math.abs(x)); }
  return curve;
}
function applyCompression(node, amount = 0) {
  const a=clamp(amount/100,0,1); node.threshold.value=-8-(a*34); node.knee.value=8+(a*22); node.ratio.value=1+(a*11); node.attack.value=.006; node.release.value=.18+(a*.2);
}

function buildVoice(buffer, pad) {
  const ctx = audioContext();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = pad.playbackMode === 'loop';

  source.playbackRate.value = Math.pow(2, (pad.effects.pitch || 0) / 12);

  const bass = ctx.createBiquadFilter();
  bass.type = 'lowshelf'; bass.frequency.value = 180; bass.gain.value = pad.effects.bass || 0;
  const treble = ctx.createBiquadFilter();
  treble.type = 'highshelf'; treble.frequency.value = 3200; treble.gain.value = pad.effects.treble || 0;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass'; lowpass.frequency.value = pad.effects.lowpass || 20000; lowpass.Q.value = .25;
  const drive = ctx.createWaveShaper(); drive.oversample = '2x'; drive.curve = makeDriveCurve(pad.effects.drive || 0);
  const compressor = ctx.createDynamicsCompressor();
  applyCompression(compressor, pad.effects.compression || 0);

  const gain = ctx.createGain(); gain.gain.value = pad.effects.volume / 100;

  const pan = ctx.createStereoPanner();
  pan.pan.value = pad.effects.pan / 100;

  const dry = ctx.createGain();
  dry.gain.value = 1;

  const reverb = ctx.createConvolver();
  reverb.buffer = runtime.reverbImpulse;
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = (pad.effects.reverb / 100) * .78;

  const delay = ctx.createDelay(1.5);
  delay.delayTime.value = .24;
  const echoGain = ctx.createGain();
  echoGain.gain.value = (pad.effects.echo / 100) * .58;
  const feedback = ctx.createGain();
  feedback.gain.value = Math.min(.55, (pad.effects.echo / 100) * .52);

  source.connect(bass); bass.connect(treble); treble.connect(lowpass); lowpass.connect(drive); drive.connect(compressor); compressor.connect(gain);
  gain.connect(dry);
  dry.connect(pan);

  gain.connect(reverb);
  reverb.connect(reverbGain);
  reverbGain.connect(pan);

  gain.connect(delay);
  delay.connect(echoGain);
  echoGain.connect(pan);
  delay.connect(feedback);
  feedback.connect(delay);

  pan.connect(runtime.masterGain);
  return { source, nodes:{bass,treble,lowpass,drive,compressor,gain,pan,reverbGain,echoGain,feedback} };
}

function isPadPlaying(id) {
  return (runtime.active.get(id)?.length || 0) > 0;
}

async function playPad(id) {
  const pad = state.pads.find(p => p.id === id);
  if (!pad) return;
  const currentlyPlaying = isPadPlaying(id);
  if (pad.playbackMode === 'toggle' && currentlyPlaying) return stopPad(id);
  if (pad.playbackMode === 'oneshot' && currentlyPlaying) return;
  if (pad.playbackMode === 'restart' || pad.playbackMode === 'loop') stopPad(id);

  try {
    const buffer = await getBuffer(pad);
    const voice = buildVoice(buffer, pad);
    const ctx = audioContext();
    const startOffset = clamp(Number(pad.startOffset)||0, 0, Math.max(0, buffer.duration-.01));
    const rawEnd = pad.endOffset == null ? buffer.duration : clamp(Number(pad.endOffset), startOffset+.01, buffer.duration);
    const playDuration = Math.max(.01, rawEnd-startOffset);
    if (pad.playbackMode === 'loop') { voice.source.loopStart=startOffset; voice.source.loopEnd=rawEnd; }
    const startedAt = ctx.currentTime;
    const activeEntry = { source:voice.source,nodes:voice.nodes,startedAt,duration:playDuration/voice.source.playbackRate.value,raf:0 };
    const list = runtime.active.get(id) || [];
    while (list.length >= Math.max(1, Number(settings.maxPolyphony)||8)) { const old=list.shift(); try{old.source.stop()}catch(_){} cancelAnimationFrame(old.raf); }
    list.push(activeEntry); runtime.active.set(id,list);

    voice.source.onended=()=>removeActiveEntry(id,activeEntry);
    if (pad.playbackMode === 'loop') voice.source.start(0,startOffset); else voice.source.start(0,startOffset,playDuration);
    updatePlayingUi();
    animatePadProgress(id, activeEntry, pad.playbackMode === 'loop');
    uiTick(380, .018);
  } catch (error) {
    console.error(error);
    toast(error.message || 'Could not play this sound');
  }
}

function removeActiveEntry(id, entry) {
  cancelAnimationFrame(entry.raf);
  const list = runtime.active.get(id) || [];
  const next = list.filter(item => item !== entry);
  if (next.length) runtime.active.set(id, next);
  else runtime.active.delete(id);
  updatePlayingUi();
  const padEl = $(`.sound-pad[data-pad-id="${CSS.escape(id)}"]`);
  if (padEl && !next.length) padEl.style.setProperty('--progress', '0%');
}

function stopPad(id) {
  const list = runtime.active.get(id) || [];
  list.forEach(entry => {
    cancelAnimationFrame(entry.raf);
    try { entry.source.onended = null; entry.source.stop(); } catch (_) {}
  });
  runtime.active.delete(id);
  updatePlayingUi();
  const padEl = $(`.sound-pad[data-pad-id="${CSS.escape(id)}"]`);
  if (padEl) padEl.style.setProperty('--progress', '0%');
}

function stopAll() {
  [...runtime.active.keys()].forEach(stopPad);
  runtime.active.clear();
  updatePlayingUi();
}

function updateLiveNodes(pad) {
  const list = runtime.active.get(pad.id) || [];
  list.forEach(entry => {
    const now = audioContext().currentTime;
    entry.nodes.bass.gain.setTargetAtTime(pad.effects.bass||0,now,.015);
    entry.nodes.treble.gain.setTargetAtTime(pad.effects.treble||0,now,.015);
    entry.nodes.lowpass.frequency.setTargetAtTime(pad.effects.lowpass||20000,now,.02);
    entry.nodes.drive.curve=makeDriveCurve(pad.effects.drive||0); applyCompression(entry.nodes.compressor,pad.effects.compression||0);
    entry.source.playbackRate.setTargetAtTime(Math.pow(2,(pad.effects.pitch||0)/12),now,.02);
    entry.nodes.gain.gain.setTargetAtTime(pad.effects.volume / 100, now, .015);
    entry.nodes.pan.pan.setTargetAtTime(pad.effects.pan / 100, now, .015);
    entry.nodes.reverbGain.gain.setTargetAtTime((pad.effects.reverb / 100) * .78, now, .02);
    entry.nodes.echoGain.gain.setTargetAtTime((pad.effects.echo / 100) * .58, now, .02);
    entry.nodes.feedback.gain.setTargetAtTime(Math.min(.55, (pad.effects.echo / 100) * .52), now, .02);
  });
}

function animatePadProgress(id, entry, loop) {
  const tick = () => {
    if (!(runtime.active.get(id) || []).includes(entry)) return;
    const elapsed = audioContext().currentTime - entry.startedAt;
    const ratio = loop ? (elapsed % entry.duration) / entry.duration : clamp(elapsed / entry.duration, 0, 1);
    const padEl = $(`.sound-pad[data-pad-id="${CSS.escape(id)}"]`);
    if (padEl) padEl.style.setProperty('--progress', `${ratio * 100}%`);
    entry.raf = requestAnimationFrame(tick);
  };
  tick();
}

function updatePlayingUi() {
  const playingIds = [...runtime.active.keys()];
  $$('.sound-pad', els.padsGrid).forEach(el => el.classList.toggle('is-playing', playingIds.includes(el.dataset.padId)));
  els.transport.classList.toggle('is-playing', playingIds.length > 0);
  if (!playingIds.length) els.nowPlayingText.textContent = 'Nothing playing';
  else {
    const names = playingIds.map(id => state.pads.find(p => p.id === id)?.name).filter(Boolean);
    els.nowPlayingText.textContent = names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];
  }
}

