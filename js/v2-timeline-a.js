'use strict';

function currentTimeline(){ ensureV2State(); return state.timelines[state.activeTimelineIndex]; }
function timelinePps(){ return 80*(currentTimeline()?.zoom||1); }
function timelineDuration(tl=currentTimeline()){ const end=Math.max(8,...(tl?.clips||[]).map(c=>(c.start||0)+(c.duration||0))); return Math.ceil(end+2); }
function clipTrackSource(clip){ return ['mic','system'].includes(clip.source)?clip.source:'board'; }
function timelineWaveCache(){ if(!runtime.timelineWaveforms)runtime.timelineWaveforms=new Map(); return runtime.timelineWaveforms; }
function waveformKey(clip){ return `${clip.kind||'file'}:${clip.audioKey||clip.synth||clip.id}:${clip.startOffset||0}:${clip.endOffset||''}`; }
function placeholderTimelineWave(id,count=42){ let seed=[...String(id)].reduce((n,c)=>n+c.charCodeAt(0),17);return Array.from({length:count},()=>{seed=(seed*9301+49297)%233280;const a=.16+(seed/233280)*.78;return `<i style="--amp:${a.toFixed(3)}"></i>`}).join(''); }
function peaksFromAudioBuffer(buffer,count=96){
  const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i)); const frames=buffer.length; const block=Math.max(1,Math.floor(frames/count)); const out=[];
  for(let i=0;i<count;i++){const start=i*block,end=Math.min(frames,start+block);let peak=0;for(let j=start;j<end;j++){let v=0;for(const ch of channels)v+=Math.abs(ch[j]||0);v/=Math.max(1,channels.length);if(v>peak)peak=v}out.push(Math.max(.06,Math.min(1,Math.pow(peak,.62))))} return out;
}
async function loadTimelineWaveform(clip){ const key=waveformKey(clip),cache=timelineWaveCache(); if(cache.has(key))return cache.get(key); const buffer=await getTimelineClipBuffer(clip); const peaks=peaksFromAudioBuffer(buffer,96);cache.set(key,peaks);return peaks; }
function paintTimelineWave(el,peaks){ const wave=el?.querySelector('.timeline-clip__wave');if(!wave||!el.isConnected)return; const width=Math.max(18,el.clientWidth-8),count=Math.max(12,Math.min(peaks.length,Math.floor(width/3))); const step=peaks.length/count; let html='';for(let i=0;i<count;i++){const a=peaks[Math.min(peaks.length-1,Math.floor(i*step))]||.08;html+=`<i style="--amp:${a.toFixed(3)}"></i>`}wave.innerHTML=html; }
function scheduleTimelineWaveform(clip,el){ const run=()=>loadTimelineWaveform(clip).then(peaks=>{if(el.dataset.clipId===clip.id)paintTimelineWave(el,peaks)}).catch(()=>{}); if('requestIdleCallback'in window)requestIdleCallback(run,{timeout:500});else setTimeout(run,0); }


function renderTimeline(){
  if(!els.timelinePanel||els.timelinePanel.hidden) return;
  const tl=currentTimeline(); const pps=timelinePps(); const duration=timelineDuration(tl); const width=Math.max(900,70+duration*pps);
  els.timelineCanvas.style.width=`${width}px`; els.timelineCanvas.style.setProperty('--pps',`${pps}px`);
  els.timelineName.textContent=tl.name; els.timelineMeta.textContent=`${tl.clips.length} clip${tl.clips.length===1?'':'s'} · ${formatDuration(duration)}`;
  els.timelineZoomRange.value=Math.round((tl.zoom||1)*100); paintRange(els.timelineZoomRange);
  els.timelineRuler.innerHTML=''; for(let sec=0;sec<=duration;sec+=Math.max(1,Math.ceil(40/pps))){ const tick=document.createElement('span'); tick.className='timeline-tick'; tick.style.left=`${70+sec*pps}px`; tick.textContent=`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`; els.timelineRuler.append(tick); }
  $$('.timeline-track',els.timelineCanvas).forEach(track=>{ const source=track.dataset.source; track.hidden=!runtime.timelineVisibleSources.has(source); track.querySelectorAll('.timeline-clip').forEach(c=>c.remove()); });
  for(const clip of tl.clips){ const source=clipTrackSource(clip); if(!runtime.timelineVisibleSources.has(source)) continue; const track=$(`.timeline-track[data-source="${source}"]`,els.timelineCanvas); if(!track) continue; const el=document.createElement('div'); el.className=`timeline-clip ${runtime.timelineSelection.has(clip.id)?'is-selected':''}`; el.draggable=true; el.dataset.clipId=clip.id; el.style.left=`${70+(clip.start||0)*pps}px`; el.style.width=`${Math.max(34,(clip.duration||.2)*pps)}px`; el.style.setProperty('--clip-color',clip.color||'#9664ff'); el.innerHTML=`<span class="timeline-clip__wave">${placeholderTimelineWave(clip.id)}</span><strong>${escapeHtml(clip.name||'Clip')}</strong><small>${formatDuration(clip.duration||0)}</small>`; track.append(el); scheduleTimelineWaveform(clip,el); }
  els.timelinePlayhead.style.left=`${70+(tl.playhead||0)*pps}px`;
  els.timelineDropHint.hidden=tl.clips.length>0;
  els.timelinePrevBtn.disabled=state.activeTimelineIndex<=0; els.timelineNextBtn.disabled=state.activeTimelineIndex>=state.timelines.length-1;
  els.timelineLiveBtn.classList.toggle('is-live',Boolean(runtime.liveSession)); els.timelineStopLiveBtn.hidden=!runtime.liveSession;
  bindTimelineClipGlow();
}

function bindTimelineClipGlow(){ $$('.timeline-clip',els.timelineCanvas).forEach(bindPointerGlow); }
function toggleTimeline(force){
  const isOpen=els.timelinePanel.classList.contains('is-open'); const show=force??!isOpen; els.timelineToggleBtn.classList.toggle('is-active',show); $('#app').classList.toggle('has-timeline',show);
  if(show){ clearTimeout(runtime.timelineCloseTimer); els.timelinePanel.hidden=false; requestAnimationFrame(()=>{els.timelinePanel.classList.add('is-open');renderTimeline();requestAnimationFrame(()=>els.timelinePanel.scrollIntoView({block:'nearest',behavior:settings.motion===false?'auto':'smooth'}));}); }
  else { els.timelinePanel.classList.remove('is-open'); runtime.timelineCloseTimer=setTimeout(()=>{if(!els.timelinePanel.classList.contains('is-open'))els.timelinePanel.hidden=true},430); }
}
function addTimeline(){ const before=snapshot(); state.timelines.splice(state.activeTimelineIndex+1,0,makeTimeline()); state.activeTimelineIndex++; commitHistory(before); renderTimeline(); toast('New timeline created','success'); }
function navigateTimeline(delta){ const next=clamp(state.activeTimelineIndex+delta,0,state.timelines.length-1); if(next===state.activeTimelineIndex)return; state.activeTimelineIndex=next; runtime.timelineSelection.clear(); renderTimeline(); markDirty(); }

function padToTimelineClip(pad,start=0,source='board'){
  return {id:uid(),name:pad.name,source,start:Math.max(0,start),duration:Math.max(.05,(pad.endOffset??pad.duration)-(pad.startOffset||0)),kind:pad.kind,audioKey:pad.audioKey||null,mime:pad.mime||'',synth:pad.synth||null,color:pad.color,effects:{...pad.effects},startOffset:pad.startOffset||0,endOffset:pad.endOffset??null};
}
function addPadToTimeline(pad,start=0){ const before=snapshot(); const clip=padToTimelineClip(pad,start); currentTimeline().clips.push(clip); runtime.timelineSelection=new Set([clip.id]); commitHistory(before); renderTimeline(); toast(`${pad.name} added to timeline`,'success'); return clip; }

async function addTimelineFiles(files,start=0){ const audioFiles=[...files].filter(f=>f.type.startsWith('audio/')); if(!audioFiles.length)return toast('No supported audio files found','warn'); const before=snapshot(); let cursor=start;
  for(const file of audioFiles){ const audioKey=`audio:${uid()}`; await idbSet(audioKey,file); let duration=0; try{duration=(await audioContext().decodeAudioData((await file.arrayBuffer()).slice(0))).duration}catch(_){} currentTimeline().clips.push({id:uid(),name:file.name.replace(/\.[^.]+$/,''),source:'board',start:cursor,duration:duration||1,kind:'file',audioKey,mime:file.type,synth:null,color:accentPalette[currentTimeline().clips.length%accentPalette.length],effects:defaultEffects(),startOffset:0,endOffset:null}); cursor+=Math.max(.15,duration||1); }
  commitHistory(before);renderTimeline();markDirty();toast(`${audioFiles.length} timeline file${audioFiles.length===1?'':'s'} added`,'success');
}

function timelinePositionFromClientX(clientX){ const rect=els.timelineCanvas.getBoundingClientRect(); return Math.max(0,(clientX-rect.left-70)/timelinePps()); }
function selectTimelineClip(id,event){ if(event?.ctrlKey||event?.metaKey){ if(runtime.timelineSelection.has(id))runtime.timelineSelection.delete(id);else runtime.timelineSelection.add(id); }else runtime.timelineSelection=new Set([id]); renderTimeline(); }

function createPadsFromTimelineSelection(){ const clips=currentTimeline().clips.filter(c=>runtime.timelineSelection.has(c.id)); if(!clips.length)return; const before=snapshot();
  for(const clip of clips){ const pad=makePad({name:clip.name,kind:clip.kind,audioKey:clip.audioKey,mime:clip.mime,synth:clip.synth,duration:(clip.endOffset??clip.startOffset+clip.duration)-(clip.startOffset||0),effects:{...defaultEffects(),...(clip.effects||{})},color:clip.color}); pad.startOffset=clip.startOffset||0; pad.endOffset=clip.endOffset??((clip.startOffset||0)+clip.duration); state.pads.push(pad); state.selectedPadId=pad.id; }
  commitHistory(before);renderAll();toast(`${clips.length} timeline clip${clips.length===1?'':'s'} added to board`,'success');
}

async function recordBlobToTimeline(blob,source='mic',name='Timeline recording'){
  const before=snapshot(); const key=`audio:${uid()}`; await idbSet(key,blob); let duration=0; try{duration=(await audioContext().decodeAudioData((await blob.arrayBuffer()).slice(0))).duration}catch(_){} const tl=currentTimeline(); const start=Math.max(0,...tl.clips.map(c=>c.start+c.duration)); tl.clips.push({id:uid(),name,source,start,duration:duration||.1,kind:'file',audioKey:key,mime:blob.type,synth:null,color:source==='mic'?'#b06cff':'#657cff',effects:defaultEffects(),startOffset:0,endOffset:null}); commitHistory(before);renderTimeline();markDirty();toast('Recording added to timeline','success');
}

