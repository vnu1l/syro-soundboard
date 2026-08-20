'use strict';

(() => {
  const Native=window.SyroDesktop;
  if(!Native?.available||!Native.capabilities?.processLoopback)return;
  runtime.timelineVisibleSources.add('process');
  if(!Object.prototype.hasOwnProperty.call(settings,'processCapturePid'))settings.processCapturePid=0;
  if(!Object.prototype.hasOwnProperty.call(settings,'processCaptureName'))settings.processCaptureName='';

  const pills=$('.timeline-source-pills');
  if(pills&&!$('[data-source-filter="process"]',pills))pills.insertAdjacentHTML('beforeend','<button class="source-pill is-on" data-source-filter="process" title="Capture one Windows application">Process</button>');
  if(els.timelineCanvas&&!$('.timeline-track[data-source="process"]',els.timelineCanvas)){
    const track=document.createElement('div');track.className='timeline-track';track.dataset.label='PROCESS';track.dataset.source='process';
    els.timelineCanvas.insertBefore(track,els.timelinePlayhead);
  }
  const oldClipTrackSource=clipTrackSource;
  clipTrackSource=clip=>clip?.source==='process'?'process':oldClipTrackSource(clip);

  Native.ensureProcessPicker=function(){
    let modal=$('#processPickerModal');if(modal)return modal;
    modal=document.createElement('section');modal.id='processPickerModal';modal.className='modal glass-panel process-picker-modal';modal.hidden=true;modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
    modal.innerHTML=`<div class="modal-head"><div><p class="eyebrow">WINDOWS AUDIO SOURCE</p><h2>Capture an application</h2></div><button class="icon-btn" data-process-cancel><svg><use href="#i-x"></use></svg></button></div>
      <p class="startup-lead">Choose one running process. Syro records only that application's audio using Windows process loopback.</p>
      <div class="search-box process-search"><svg><use href="#i-search"></use></svg><input id="processSearchInput" type="search" autocomplete="off" placeholder="Search running apps..."></div>
      <div class="process-list" id="processList"></div><div class="modal-actions"><button class="ui-btn" data-process-cancel>Cancel</button></div>`;
    els.modalLayer.append(modal);return modal;
  };
  Native.chooseProcess=async function(){
    const modal=this.ensureProcessPicker(),input=$('#processSearchInput',modal),list=$('#processList',modal),processes=await this.processesList();
    const render=()=>{const q=(input.value||'').trim().toLowerCase();const visible=processes.filter(p=>p.pid&&(!q||p.name.toLowerCase().includes(q)||(p.executable||'').toLowerCase().includes(q))).slice(0,200);list.innerHTML=visible.map(p=>`<button class="process-row" data-process-pid="${p.pid}"><span class="process-icon">${escapeHtml((p.name||'?').slice(0,1).toUpperCase())}</span><span><strong>${escapeHtml(p.name||`PID ${p.pid}`)}</strong><small>PID ${p.pid}${p.executable?` · ${escapeHtml(p.executable)}`:''}</small></span><em>Capture</em></button>`).join('')||'<div class="process-empty">No matching process</div>'};
    input.value='';render();openModal(modal);setTimeout(()=>input.focus(),50);
    return new Promise(resolve=>{let done=false;const finish=async value=>{if(done)return;done=true;modal.removeEventListener('click',click);input.removeEventListener('input',render);await closeModals();resolve(value)};const click=e=>{const row=e.target.closest('[data-process-pid]');if(row){finish(processes.find(p=>p.pid===Number(row.dataset.processPid))||null);return}if(e.target.closest('[data-process-cancel]'))finish(null)};modal.addEventListener('click',click);input.addEventListener('input',render)});
  };

  startLiveSession=async function desktopLiveSession(){
    if(runtime.liveSession){toggleTimeline(true);const liveIndex=state.timelines.findIndex(t=>t.id===runtime.liveSession.timelineId);if(liveIndex>=0){state.activeTimelineIndex=liveIndex;renderTimeline()}return}
    const needBoard=runtime.timelineVisibleSources.has('board'),needMic=runtime.timelineVisibleSources.has('mic'),needSystem=runtime.timelineVisibleSources.has('system'),needProcess=runtime.timelineVisibleSources.has('process');
    const streams=[],nativeCaptures=[];audioContext();
    try{
      if(needBoard&&runtime.captureDestination)streams.push({source:'board',stream:runtime.captureDestination.stream,owned:false});
      if(needSystem)nativeCaptures.push({...await Native.startCapture('system'),source:'system',name:'Live system audio'});
      if(needProcess){const choice=await Native.chooseProcess();if(!choice)throw new Error('Process capture cancelled.');settings.processCapturePid=choice.pid;settings.processCaptureName=choice.name;saveState();nativeCaptures.push({...await Native.startCapture('process',choice.pid),source:'process',name:`${choice.name} audio`})}
      if(needMic){const mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});streams.push({source:'mic',stream:mic,owned:true})}
      if(!streams.length&&!nativeCaptures.length)throw new Error('Enable at least one Timeline source first.');
      const before=snapshot(),tl=makeTimeline(`Live ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`);state.timelines.push(tl);state.activeTimelineIndex=state.timelines.length-1;commitHistory(before);
      const session={timelineId:tl.id,startedAt:performance.now(),recorders:[],streams,nativeCaptures,chunks:new Map()};runtime.liveSession=session;
      for(const item of streams){const chunks=[];session.chunks.set(item.source,chunks);const recorder=new MediaRecorder(new MediaStream(item.stream.getAudioTracks()));recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.start(500);session.recorders.push({source:item.source,recorder,mime:recorder.mimeType||'audio/webm'})}
      runtime.liveTimerId=setInterval(()=>{if(runtime.liveSession){const elapsed=(performance.now()-session.startedAt)/1000;els.timelineMeta.textContent=`LIVE · ${formatDuration(elapsed)}`;els.timelinePlayhead.style.left=`${70+elapsed*timelinePps()}px`;els.timelineViewport.scrollLeft=Math.max(0,70+elapsed*timelinePps()-els.timelineViewport.clientWidth+110)}},250);
      toggleTimeline(true);renderTimeline();toast('Live Timeline recording started','success',true);
    }catch(error){console.error(error);streams.forEach(x=>{if(x.owned!==false)x.stream.getTracks().forEach(t=>t.stop())});for(const cap of nativeCaptures){try{await Native.stopCapture(cap.id)}catch(_){}}toast(error.message||'Live capture could not start','danger')}
  };

  stopLiveSession=async function desktopStopLive(){
    const session=runtime.liveSession;if(!session)return;clearInterval(runtime.liveTimerId);const duration=Math.max(.1,(performance.now()-session.startedAt)/1000);
    const waits=session.recorders.map(({recorder})=>new Promise(resolve=>{const done=recorder.onstop;recorder.onstop=e=>{try{done?.(e)}finally{resolve()}};if(recorder.state!=='inactive')recorder.stop();else resolve()}));await Promise.all(waits);session.streams.forEach(x=>{if(x.owned!==false)x.stream.getTracks().forEach(t=>t.stop())});
    const nativeResults=[];for(const cap of session.nativeCaptures||[]){try{nativeResults.push({...await Native.stopCapture(cap.id),source:cap.source||cap.mode,name:cap.name})}catch(error){console.warn(error)}}
    const tl=state.timelines.find(t=>t.id===session.timelineId);if(tl){
      for(const rec of session.recorders){const chunks=session.chunks.get(rec.source)||[];if(!chunks.length)continue;const blob=new Blob(chunks,{type:rec.mime}),key=`audio:${uid()}`;await idbSet(key,blob);tl.clips.push({id:uid(),name:rec.source==='mic'?'Live microphone':'Live board output',source:rec.source,start:0,duration,kind:'file',audioKey:key,mime:blob.type,synth:null,color:rec.source==='mic'?'#b06cff':'#9964ff',effects:defaultEffects(),startOffset:0,endOffset:null})}
      for(const result of nativeResults){try{const blob=await Native.readFileBlob(result.path,'audio/wav'),key=`audio:${uid()}`;await idbSet(key,blob);const source=result.source==='process'?'process':'system';tl.clips.push({id:uid(),name:result.name||(source==='process'?'Live process audio':'Live system audio'),source,start:0,duration,kind:'file',audioKey:key,mime:'audio/wav',synth:null,color:source==='process'?'#43b8d8':'#657cff',effects:defaultEffects(),startOffset:0,endOffset:null})}catch(error){console.warn('Failed to import native capture',error)}}
    }
    runtime.liveSession=null;markDirty();saveState();renderTimeline();toast('Live Timeline stopped and saved','success',true);
  };
})();
