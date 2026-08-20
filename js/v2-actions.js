'use strict';

async function decodeDuration(blob){ try{return (await audioContext().decodeAudioData((await blob.arrayBuffer()).slice(0))).duration}catch(_){return 0} }
async function replacePadAudioWithFile(pad,file){ const audioKey=`audio:${uid()}`;await idbSet(audioKey,file);const duration=await decodeDuration(file);stopPad(pad.id);runtime.buffers.delete(pad.id);Object.assign(pad,{name:file.name.replace(/\.[^.]+$/,''),kind:'file',audioKey,mime:file.type,synth:null,duration,startOffset:0,endOffset:null}); }

addFiles = async function addFilesV2(files){
  const audioFiles=[...files].filter(file=>file.type.startsWith('audio/'));if(!audioFiles.length)return toast('No supported audio files found','warn');const before=snapshot();let added=0;
  const replace=runtime.fileAction==='replace-selected'&&selectedPad();runtime.fileAction=null;
  for(let i=0;i<audioFiles.length;i++){
    const file=audioFiles[i];try{
      if(i===0&&replace){await replacePadAudioWithFile(replace,file);added++;continue}
      const audioKey=`audio:${uid()}`;await idbSet(audioKey,file);const duration=await decodeDuration(file);const pad=makePad({name:file.name.replace(/\.[^.]+$/,''),audioKey,mime:file.type,duration,color:accentPalette[state.pads.length%accentPalette.length],playbackMode:settings.defaultPlaybackMode||'restart'});state.pads.push(pad);state.selectedPadId=pad.id;added++;
    }catch(error){console.error('Failed to add file',file.name,error)}
  }
  if(added){commitHistory(before);renderAll();markDirty();pulseContextTargets();toast(replace?'Selected sound replaced':`${added} sound${added===1?'':'s'} added`,'success')}
};

addRecordedBlob = async function addRecordedBlobV2(blob){
  if(runtime.recordTarget==='timeline'){await recordBlobToTimeline(blob,'mic',`Recording ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`);runtime.recordTarget='new-pad';setTimeout(closeModals,220);return}
  const before=snapshot();const duration=await decodeDuration(blob);const target=runtime.recordTarget==='replace-pad'?selectedPad():null;const audioKey=`audio:${uid()}`;await idbSet(audioKey,blob);
  if(target){stopPad(target.id);runtime.buffers.delete(target.id);Object.assign(target,{name:`Recording ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`,kind:'file',audioKey,mime:blob.type,duration,group:'voice',startOffset:0,endOffset:null});state.selectedPadId=target.id;}
  else{const pad=makePad({name:`Recording ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`,audioKey,mime:blob.type,duration,group:'voice',playbackMode:settings.defaultPlaybackMode||'restart'});state.pads.push(pad);state.selectedPadId=pad.id;}
  runtime.recordTarget='new-pad';commitHistory(before);renderAll();markDirty();toast(target?'Selected sound replaced with recording':'Recording added to board','success');setTimeout(closeModals,220);
};

const deletePadBase=deletePad;
deletePad=async function deletePadV2(id){const pad=state.pads.find(p=>p.id===id);if(settings.confirmDelete&&pad&&!confirm(`Delete ${pad.name}?`))return;return deletePadBase(id)};
