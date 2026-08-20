'use strict';

// Context-aware top actions: capture phase runs before the original listeners.
els.addSoundBtn.addEventListener('click',()=>{runtime.fileAction=selectedPad()?'replace-selected':'new-pad'},true);
els.emptyAddBtn.addEventListener('click',()=>{runtime.fileAction='new-pad'},true);
els.recordBtn.addEventListener('click',()=>{runtime.recordTarget=selectedPad()?'replace-pad':'new-pad';els.recordStatus.textContent=selectedPad()?`Recording will replace ${selectedPad().name}`:'Ready to record'},true);

// Main toolbar and contextual panels.
els.timelineToggleBtn.addEventListener('click',()=>toggleTimeline());
els.libraryBtn.addEventListener('click',()=>openLibrary('sounds')); els.libraryCloseBtn.addEventListener('click',closeLibrary); els.libraryScrim.addEventListener('click',closeLibrary);
els.settingsBtn.addEventListener('click',()=>openSettings('general'));

// Library.
$$('.library-tab').forEach(btn=>btn.addEventListener('click',()=>{runtime.libraryTab=btn.dataset.libraryTab;runtime.libraryCategory='all';$$('.library-tab').forEach(x=>x.classList.toggle('is-active',x===btn));renderLibrary()}));
els.librarySearchInput.addEventListener('input',()=>{runtime.librarySearch=els.librarySearchInput.value;renderLibrary()});
els.libraryCategories.addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(!b)return;runtime.libraryCategory=b.dataset.category;renderLibrary()});
els.libraryGrid.addEventListener('click',e=>{const card=e.target.closest('[data-library-id]');const action=e.target.closest('[data-library-action]')?.dataset.libraryAction;if(!card||!action)return;if(runtime.libraryTab==='sounds'){const item=BUILTIN_SOUNDS.find(x=>x.id===card.dataset.libraryId);if(!item)return;if(action==='preview')previewLibrarySound(item);else applyLibrarySound(item)}else{const item=EFFECT_PRESETS.find(x=>x.id===card.dataset.libraryId);if(item&&action==='apply')applyEffectPreset(item)}});

// Startup permission screen.
els.startupGrantBtn.addEventListener('click',grantStartupPermissions); els.startupLimitedBtn.addEventListener('click',()=>{safeLocalSet(ONBOARDING_KEY,'done');finishStartup()});
els.tutorialNextBtn.addEventListener('click',nextTutorial); els.tutorialSkipStep.addEventListener('click',skipTutorialStep); els.tutorialSkipAll.addEventListener('click',finishTutorial);
window.addEventListener('resize',()=>{if(!els.tutorialLayer.hidden)positionTutorialCard(tutorialTarget())},{passive:true});

// Permission helper.
els.permissionGuideRequestBtn.addEventListener('click',async()=>{const type=runtime.permissionGuideType;const after=runtime.permissionAfterGranted;runtime.permissionAfterGranted=null;
  try{
    if(type==='system'){closeModals(); if(after)after(); else startLiveSession(); return;}
    const ok=await requestCapability(type);await refreshPermissionUi();if(ok!==false){toast(`${permissionGuideCopy[type]?.title||'Permission'} ready`,'success');closeModals();if(after)setTimeout(after,170)}
  }catch(error){console.warn(error);toast(error.message||'Permission was not granted','warn');refreshPermissionUi()}
});

// Settings navigation and controls.
els.settingsTabs.addEventListener('click',e=>{const b=e.target.closest('[data-settings-page]');if(b)renderSettingsPage(b.dataset.settingsPage)});
els.settingsContent.addEventListener('change',e=>{
  const toggle=e.target.closest('[data-setting-toggle]');if(toggle)return applySettingValue(toggle.dataset.settingToggle,toggle.checked);
  const number=e.target.closest('[data-setting-number]');if(number)return applySettingValue(number.dataset.settingNumber,clamp(Number(number.value),Number(number.min),Number(number.max)));
  const select=e.target.closest('[data-setting-select]');if(select)return applySettingValue(select.dataset.settingSelect,select.value);
});
els.settingsContent.addEventListener('input',e=>{const r=e.target.closest('[data-setting-range="master"]');if(!r)return;state.masterVolume=Number(r.value);r.nextElementSibling.textContent=`${state.masterVolume}%`;paintRange(r);renderMaster();markDirty()});
els.settingsContent.addEventListener('click',e=>{const help=e.target.closest('[data-permission-help]');if(help)return showPermissionGuide(help.dataset.permissionHelp);if(e.target.closest('#settingsExportBtn'))exportBackup()});

// Timeline buttons.
els.timelinePrevBtn.addEventListener('click',()=>navigateTimeline(-1)); els.timelineNextBtn.addEventListener('click',()=>navigateTimeline(1)); els.timelineNewBtn.addEventListener('click',addTimeline);
els.timelinePlayBtn.addEventListener('click',playTimeline);els.timelineStopBtn.addEventListener('click',()=>stopTimelinePlayback());
els.timelineAddBtn.addEventListener('click',()=>els.timelineFileInput.click());els.timelineFileInput.addEventListener('change',async()=>{await addTimelineFiles(els.timelineFileInput.files,currentTimeline().playhead||0);els.timelineFileInput.value=''});
els.timelineRecordBtn.addEventListener('click',()=>{runtime.recordTarget='timeline';els.recordStatus.textContent='Recording will be added to Timeline';openModal(els.recordModal)});
els.timelineLiveBtn.addEventListener('click',startLiveSession);els.timelineStopLiveBtn.addEventListener('click',stopLiveSession);
els.timelineZoomRange.addEventListener('input',()=>{currentTimeline().zoom=Number(els.timelineZoomRange.value)/100;paintRange(els.timelineZoomRange);renderTimeline();markDirty()});
$$('[data-source-filter]').forEach(btn=>btn.addEventListener('click',()=>{const source=btn.dataset.sourceFilter;if(runtime.timelineVisibleSources.has(source))runtime.timelineVisibleSources.delete(source);else runtime.timelineVisibleSources.add(source);btn.classList.toggle('is-on',runtime.timelineVisibleSources.has(source));renderTimeline()}));

// Timeline panning, selection and positioning.
els.timelineViewport.addEventListener('pointerdown',e=>{runtime.timelineHasFocus=true;if(e.button===1){e.preventDefault();runtime.timelinePanning=true;runtime.timelinePanStartX=e.clientX;runtime.timelinePanStartScroll=els.timelineViewport.scrollLeft;els.timelineViewport.classList.add('is-panning');els.timelineViewport.setPointerCapture?.(e.pointerId)}});
els.timelineViewport.addEventListener('pointermove',e=>{if(runtime.timelinePanning)els.timelineViewport.scrollLeft=runtime.timelinePanStartScroll-(e.clientX-runtime.timelinePanStartX)});
function endPan(){runtime.timelinePanning=false;els.timelineViewport.classList.remove('is-panning')}els.timelineViewport.addEventListener('pointerup',endPan);els.timelineViewport.addEventListener('pointercancel',endPan);
els.timelineCanvas.addEventListener('click',e=>{const clip=e.target.closest('.timeline-clip');if(clip)return selectTimelineClip(clip.dataset.clipId,e);if(e.target.closest('.timeline-ruler')||e.target.closest('.timeline-track')){currentTimeline().playhead=timelinePositionFromClientX(e.clientX);renderTimeline()}});
els.timelineCanvas.addEventListener('dblclick',e=>{if(e.target.closest('.timeline-clip')){selectTimelineClip(e.target.closest('.timeline-clip').dataset.clipId,e);createPadsFromTimelineSelection()}});

// Drag pads -> timeline; clips -> timeline/board.
els.padsGrid.addEventListener('dragstart',e=>{const pad=e.target.closest('.sound-pad');if(!pad)return;runtime.timelineHasFocus=false;e.dataTransfer.setData('application/x-syro-pad',pad.dataset.padId);e.dataTransfer.effectAllowed='copyMove'});
els.timelineCanvas.addEventListener('dragstart',e=>{const clip=e.target.closest('.timeline-clip');if(!clip)return;if(!runtime.timelineSelection.has(clip.dataset.clipId))runtime.timelineSelection=new Set([clip.dataset.clipId]);const selected=[...runtime.timelineSelection];e.dataTransfer.setData('application/x-syro-timeline',JSON.stringify(selected));e.dataTransfer.setData('text/plain',selected.join(','));e.dataTransfer.effectAllowed='copyMove'});
els.timelineViewport.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('application/x-syro-pad')||e.dataTransfer.types.includes('application/x-syro-timeline')||e.dataTransfer.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy'}});
els.timelineViewport.addEventListener('drop',async e=>{e.preventDefault();e.stopPropagation();const start=timelinePositionFromClientX(e.clientX);const padId=e.dataTransfer.getData('application/x-syro-pad');if(padId){const pad=state.pads.find(p=>p.id===padId);if(pad)addPadToTimeline(pad,start);return}const clipRaw=e.dataTransfer.getData('application/x-syro-timeline');if(clipRaw){const ids=JSON.parse(clipRaw);const clips=currentTimeline().clips.filter(c=>ids.includes(c.id));if(clips.length){const before=snapshot();const anchor=Math.min(...clips.map(c=>c.start));clips.forEach(c=>c.start=Math.max(0,start+(c.start-anchor)));commitHistory(before);renderTimeline()}return}if(e.dataTransfer.files?.length)await addTimelineFiles(e.dataTransfer.files,start)});
els.padsGrid.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('application/x-syro-timeline')){e.preventDefault();e.dataTransfer.dropEffect='copy'}});
els.padsGrid.addEventListener('drop',e=>{if(e.dataTransfer.getData('application/x-syro-timeline')){e.preventDefault();e.stopPropagation();createPadsFromTimelineSelection()}});

// Better context selection and timeline delete shortcut.
els.padsGrid.addEventListener('pointerdown',()=>{runtime.timelineHasFocus=false});
$('.workspace').addEventListener('pointerdown',e=>{if(!e.target.closest('.sound-pad')&&!e.target.closest('button,input,select,[contenteditable]'))clearPadSelection()});
document.addEventListener('keydown',e=>{if(runtime.timelineHasFocus&&runtime.timelineSelection.size&&!isTypingTarget(e.target)&&e.key==='Delete'){e.preventDefault();e.stopImmediatePropagation();const before=snapshot();currentTimeline().clips=currentTimeline().clips.filter(c=>!runtime.timelineSelection.has(c.id));runtime.timelineSelection.clear();commitHistory(before);renderTimeline();toast('Timeline clips deleted')}} ,true);

// Initial V2 boot after the V1 state loader has run.
ensureV2State(); if(settings.autoOpenTimeline)toggleTimeline(true); renderLibrary(); renderSettingsPage('general'); refreshPermissionUi(); showStartupIfNeeded();
