async function startLiveSession(){
  if(runtime.liveSession){ toggleTimeline(true); const liveIndex=state.timelines.findIndex(t=>t.id===runtime.liveSession.timelineId); if(liveIndex>=0){state.activeTimelineIndex=liveIndex;renderTimeline();} return; }
  const needBoard=runtime.timelineVisibleSources.has('board'); const needMic=runtime.timelineVisibleSources.has('mic'); const needSystem=runtime.timelineVisibleSources.has('system'); const streams=[]; const nativeCaptures=[]; audioContext();
  try{
    if(needBoard&&runtime.captureDestination) streams.push({source:'board',stream:runtime.captureDestination.stream,owned:false});
    // Display capture is requested first so the call remains inside the user's click activation.
    if(needSystem){ if(window.SyroDesktop?.available&&SyroDesktop.capabilities?.systemLoopback){ nativeCaptures.push(await SyroDesktop.startCapture('system')); } else { if(!navigator.mediaDevices?.getDisplayMedia) throw new Error('System capture is unavailable in this browser.'); const display=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true}); if(!display.getAudioTracks().length){display.getTracks().forEach(t=>t.stop());throw new Error('The selected source did not provide audio. Enable Share audio in the picker.');} streams.push({source:'system',stream:display,owned:true}); } }
    if(needMic){ const mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}}); streams.push({source:'mic',stream:mic,owned:true}); }
    if(!streams.length&&!nativeCaptures.length) throw new Error('Enable Board, Mic or System in the Timeline source filters first.');
    const before=snapshot(); const tl=makeTimeline(`Live ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`); state.timelines.push(tl); state.activeTimelineIndex=state.timelines.length-1; commitHistory(before);
    const session={timelineId:tl.id,startedAt:performance.now(),recorders:[],streams,nativeCaptures,chunks:new Map()}; runtime.liveSession=session;
    for(const item of streams){ const chunks=[]; session.chunks.set(item.source,chunks); const audioOnly=new MediaStream(item.stream.getAudioTracks()); const recorder=new MediaRecorder(audioOnly); recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)}; recorder.start(500); session.recorders.push({source:item.source,recorder,mime:recorder.mimeType||'audio/webm'}); }
    runtime.liveTimerId=setInterval(()=>{ if(runtime.liveSession){ const elapsed=(performance.now()-session.startedAt)/1000; els.timelineMeta.textContent=`LIVE · ${formatDuration(elapsed)}`; els.timelinePlayhead.style.left=`${70+elapsed*timelinePps()}px`; els.timelineViewport.scrollLeft=Math.max(0,70+elapsed*timelinePps()-els.timelineViewport.clientWidth+110); } },250);
    toggleTimeline(true);renderTimeline();toast('Live Timeline recording started','success',true);
  }catch(error){ console.error(error); streams.forEach(x=>{if(x.owned!==false)x.stream.getTracks().forEach(t=>t.stop())}); for(const cap of nativeCaptures){try{await SyroDesktop.stopCapture(cap.id)}catch(_){}} toast(error.message||'Live capture could not start','danger'); if((error.name==='NotAllowedError'||error.name==='SecurityError')&&needSystem&&!window.SyroDesktop?.available)showPermissionGuide('system'); }
}

async function stopLiveSession(){ const session=runtime.liveSession;if(!session)return; clearInterval(runtime.liveTimerId); const duration=Math.max(.1,(performance.now()-session.startedAt)/1000);
  const waits=session.recorders.map(({recorder})=>new Promise(resolve=>{ const done=recorder.onstop; recorder.onstop=e=>{try{done?.(e)}finally{resolve()}}; if(recorder.state!=='inactive')recorder.stop();else resolve(); })); await Promise.all(waits); session.streams.forEach(x=>{if(x.owned!==false)x.stream.getTracks().forEach(t=>t.stop())});
  const nativeResults=[]; for(const cap of session.nativeCaptures||[]){try{nativeResults.push(await SyroDesktop.stopCapture(cap.id))}catch(error){console.warn(error)}}
  const tl=state.timelines.find(t=>t.id===session.timelineId); if(tl){
    for(const rec of session.recorders){ const chunks=session.chunks.get(rec.source)||[]; if(!chunks.length)continue; const blob=new Blob(chunks,{type:rec.mime}); const key=`audio:${uid()}`; await idbSet(key,blob); tl.clips.push({id:uid(),name:rec.source==='mic'?'Live microphone':rec.source==='system'?'Live system audio':'Live board output',source:rec.source,start:0,duration,kind:'file',audioKey:key,mime:blob.type,synth:null,color:rec.source==='mic'?'#b06cff':rec.source==='system'?'#657cff':'#9964ff',effects:defaultEffects(),startOffset:0,endOffset:null}); }
    for(const result of nativeResults){ try{const blob=await SyroDesktop.readFileBlob(result.path,'audio/wav');const key=`audio:${uid()}`;await idbSet(key,blob);tl.clips.push({id:uid(),name:'Live system audio',source:'system',start:0,duration,kind:'file',audioKey:key,mime:'audio/wav',synth:null,color:'#657cff',effects:defaultEffects(),startOffset:0,endOffset:null});}catch(error){console.warn('Failed to import native capture',error)} }
  }
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
