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
window.addEventListener('resize',()=>{if(!els.tutorialLayer.hidden)positionTutorialUi(tutorialTarget())},{passive:true}); window.addEventListener('scroll',()=>{if(!els.tutorialLayer.hidden)positionTutorialUi(tutorialTarget())},{passive:true,capture:true});

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

