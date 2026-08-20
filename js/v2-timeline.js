'use strict';

function currentTimeline(){ ensureV2State(); return state.timelines[state.activeTimelineIndex]; }
function timelinePps(){ return 80*(currentTimeline()?.zoom||1); }
function timelineDuration(tl=currentTimeline()){ const end=Math.max(8,...(tl?.clips||[]).map(c=>(c.start||0)+(c.duration||0))); return Math.ceil(end+2); }
function clipTrackSource(clip){ return ['mic','system'].includes(clip.source)?clip.source:'board'; }

function renderTimeline(){
  if(!els.timelinePanel||els.timelinePanel.hidden) return;
  const tl=currentTimeline(); const pps=timelinePps(); const duration=timelineDuration(tl); const width=Math.max(900,70+duration*pps);
  els.timelineCanvas.style.width=`${width}px`; els.timelineCanvas.style.setProperty('--pps',`${pps}px`);
  els.timelineName.textContent=tl.name; els.timelineMeta.textContent=`${tl.clips.length} clip${tl.clips.length===1?'':'s'} · ${formatDuration(duration)}`;
  els.timelineZoomRange.value=Math.round((tl.zoom||1)*100); paintRange(els.timelineZoomRange);
  els.timelineRuler.innerHTML=''; for(let sec=0;sec<=duration;sec+=Math.max(1,Math.ceil(40/pps))){ const tick=document.createElement('span'); tick.className='timeline-tick'; tick.style.left=`${70+sec*pps}px`; tick.textContent=`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`; els.timelineRuler.append(tick); }
  $$('.timeline-track',els.timelineCanvas).forEach(track=>{ const source=track.dataset.source; track.hidden=!runtime.timelineVisibleSources.has(source); track.querySelectorAll('.timeline-clip').forEach(c=>c.remove()); });
  for(const clip of tl.clips){ const source=clipTrackSource(clip); if(!runtime.timelineVisibleSources.has(source)) continue; const track=$(`.timeline-track[data-source="${source}"]`,els.timelineCanvas); if(!track) continue; const el=document.createElement('div'); el.className=`timeline-clip ${runtime.timelineSelection.has(clip.id)?'is-selected':''}`; el.draggable=true; el.dataset.clipId=clip.id; el.style.left=`${70+(clip.start||0)*pps}px`; el.style.width=`${Math.max(34,(clip.duration||.2)*pps)}px`; el.style.setProperty('--clip-color',clip.color||'#9664ff'); el.innerHTML=`<span class="timeline-clip__wave"></span><strong>${escapeHtml(clip.name||'Clip')}</strong><small>${formatDuration(clip.duration||0)}</small>`; track.append(el); }
  els.timelinePlayhead.style.left=`${70+(tl.playhead||0)*pps}px`;
  els.timelineDropHint.hidden=tl.clips.length>0;
  els.timelinePrevBtn.disabled=state.activeTimelineIndex<=0; els.timelineNextBtn.disabled=state.activeTimelineIndex>=state.timelines.length-1;
  els.timelineLiveBtn.classList.toggle('is-live',Boolean(runtime.liveSession)); els.timelineStopLiveBtn.hidden=!runtime.liveSession;
  bindTimelineClipGlow();
}

function bindTimelineClipGlow(){ $$('.timeline-clip',els.timelineCanvas).forEach(bindPointerGlow); }
function toggleTimeline(force){ const show=force??els.timelinePanel.hidden; els.timelinePanel.hidden=!show; els.timelineToggleBtn.classList.toggle('is-active',show); $('#app').classList.toggle('has-timeline',show); if(show){renderTimeline(); requestAnimationFrame(()=>els.timelinePanel.scrollIntoView({block:'nearest',behavior:settings.motion===false?'auto':'smooth'}));} }
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

async function startLiveSession(){
  if(runtime.liveSession){ toggleTimeline(true); const liveIndex=state.timelines.findIndex(t=>t.id===runtime.liveSession.timelineId); if(liveIndex>=0){state.activeTimelineIndex=liveIndex;renderTimeline();} return; }
  const needBoard=runtime.timelineVisibleSources.has('board'); const needMic=runtime.timelineVisibleSources.has('mic'); const needSystem=runtime.timelineVisibleSources.has('system'); const streams=[]; audioContext();
  try{
    if(needBoard&&runtime.captureDestination) streams.push({source:'board',stream:runtime.captureDestination.stream,owned:false});
    // Display capture is requested first so the call remains inside the user's click activation.
    if(needSystem){ if(!navigator.mediaDevices?.getDisplayMedia) throw new Error('System capture is unavailable in this browser.'); const display=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true}); if(!display.getAudioTracks().length){display.getTracks().forEach(t=>t.stop());throw new Error('The selected source did not provide audio. Enable Share audio in the picker.');} streams.push({source:'system',stream:display,owned:true}); }
    if(needMic){ const mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}}); streams.push({source:'mic',stream:mic,owned:true}); }
    if(!streams.length) throw new Error('Enable Mic or System in the Timeline source filters first.');
    const before=snapshot(); const tl=makeTimeline(`Live ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`); state.timelines.push(tl); state.activeTimelineIndex=state.timelines.length-1; commitHistory(before);
    const session={timelineId:tl.id,startedAt:performance.now(),recorders:[],streams,chunks:new Map()}; runtime.liveSession=session;
    for(const item of streams){ const chunks=[]; session.chunks.set(item.source,chunks); const audioOnly=new MediaStream(item.stream.getAudioTracks()); const recorder=new MediaRecorder(audioOnly); recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)}; recorder.start(500); session.recorders.push({source:item.source,recorder,mime:recorder.mimeType||'audio/webm'}); }
    runtime.liveTimerId=setInterval(()=>{ if(runtime.liveSession){ const elapsed=(performance.now()-session.startedAt)/1000; els.timelineMeta.textContent=`LIVE · ${formatDuration(elapsed)}`; els.timelinePlayhead.style.left=`${70+elapsed*timelinePps()}px`; els.timelineViewport.scrollLeft=Math.max(0,70+elapsed*timelinePps()-els.timelineViewport.clientWidth+110); } },250);
    toggleTimeline(true);renderTimeline();toast('Live Timeline recording started','success',true);
  }catch(error){ console.error(error); streams.forEach(x=>{if(x.owned!==false)x.stream.getTracks().forEach(t=>t.stop())}); toast(error.message||'Live capture could not start','danger'); if((error.name==='NotAllowedError'||error.name==='SecurityError')&&needSystem)showPermissionGuide('system'); }
}

async function stopLiveSession(){ const session=runtime.liveSession;if(!session)return; clearInterval(runtime.liveTimerId); const duration=Math.max(.1,(performance.now()-session.startedAt)/1000);
  const waits=session.recorders.map(({recorder})=>new Promise(resolve=>{ const done=recorder.onstop; recorder.onstop=e=>{try{done?.(e)}finally{resolve()}}; if(recorder.state!=='inactive')recorder.stop();else resolve(); })); await Promise.all(waits); session.streams.forEach(x=>{if(x.owned!==false)x.stream.getTracks().forEach(t=>t.stop())});
  const tl=state.timelines.find(t=>t.id===session.timelineId); if(tl){ for(const rec of session.recorders){ const chunks=session.chunks.get(rec.source)||[]; if(!chunks.length)continue; const blob=new Blob(chunks,{type:rec.mime}); const key=`audio:${uid()}`; await idbSet(key,blob); tl.clips.push({id:uid(),name:rec.source==='mic'?'Live microphone':rec.source==='system'?'Live system audio':'Live board output',source:rec.source,start:0,duration,kind:'file',audioKey:key,mime:blob.type,synth:null,color:rec.source==='mic'?'#b06cff':rec.source==='system'?'#657cff':'#9964ff',effects:defaultEffects(),startOffset:0,endOffset:null}); } }
  runtime.liveSession=null; markDirty(); saveState(); renderTimeline();toast('Live Timeline stopped and saved','success',true);
}

async function getTimelineClipBuffer(clip){
  if(clip.kind==='synth') return createSynthBuffer(clip.synth);
  const blob=await idbGet(clip.audioKey); if(!blob) throw new Error(`Missing audio for ${clip.name}`); return audioContext().decodeAudioData((await blob.arrayBuffer()).slice(0));
}
async function playTimeline(){
  stopTimelinePlayback(); const tl=currentTimeline(); if(!tl.clips.length)return toast('Timeline is empty','warn'); const ctx=audioContext(); const zero=ctx.currentTime+.04; runtime.timelinePlaybackStartedAt=performance.now(); runtime.timelineVoices=[];
  for(const clip of tl.clips){
    try{ const buffer=await getTimelineClipBuffer(clip); const pad=makePad({name:clip.name,kind:clip.kind,audioKey:clip.audioKey,synth:clip.synth,duration:clip.duration,effects:{...defaultEffects(),...(clip.effects||{})}}); pad.startOffset=clip.startOffset||0; pad.endOffset=clip.endOffset??((clip.startOffset||0)+(clip.duration||buffer.duration)); const voice=buildVoice(buffer,pad); const startOffset=clamp(pad.startOffset,0,Math.max(0,buffer.duration-.01)); const duration=Math.max(.01,Math.min(clip.duration||buffer.duration,buffer.duration-startOffset)); voice.source.start(zero+(clip.start||0),startOffset,duration); runtime.timelineVoices.push(voice.source); }catch(error){console.warn(error)}
  }
  const total=timelineDuration(tl); const tick=()=>{ const elapsed=(performance.now()-runtime.timelinePlaybackStartedAt)/1000; tl.playhead=clamp(elapsed,0,total); els.timelinePlayhead.style.left=`${70+tl.playhead*timelinePps()}px`; if(elapsed<total&&runtime.timelineVoices.length)runtime.timelinePlaybackRaf=requestAnimationFrame(tick);else stopTimelinePlayback(false); }; tick(); toast('Timeline playback started','success');
}
function stopTimelinePlayback(reset=true){ cancelAnimationFrame(runtime.timelinePlaybackRaf); runtime.timelinePlaybackRaf=0; for(const src of runtime.timelineVoices||[]){try{src.stop()}catch(_){}} runtime.timelineVoices=[]; if(reset&&currentTimeline()){currentTimeline().playhead=0;if(els.timelinePlayhead)els.timelinePlayhead.style.left='70px';} }
