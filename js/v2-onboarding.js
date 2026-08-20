'use strict';

const tutorialSteps=[
  {target:'.workspace',title:'Your sound board',text:'Pads live here. Click a pad to select and play it. Right-click for copy, duplicate, rename, delete and more.'},
  {target:'#effectsPanel',title:'Context follows your selection',text:'Select a pad and the Effects panel, Add sound and Record controls pulse. While selected, Add sound or Record replaces that pad instead of creating a new one.'},
  {target:'#libraryBtn',title:'Built-in Sound & FX Library',text:'Open a large local library of generated sounds and effect presets. Add them to the board or apply them to the selected pad.'},
  {target:'#timelineToggleBtn',title:'Timeline workspace',text:'Timeline opens above the board. Drag pads or files into it, zoom, pan with the middle mouse button, multi-select clips, record tracks and use Live capture.'},
  {target:'#settingsBtn',title:'Everything stays configurable',text:'Settings contains audio, interface, notification, permission and storage controls. Permission help is always available when an action is blocked.'}
];

function safeLocalGet(key){try{return localStorage.getItem(key)}catch(_){return null}}
function safeLocalSet(key,value){try{localStorage.setItem(key,value)}catch(_){}}
function firstRunNeedsStartup(){return safeLocalGet(ONBOARDING_KEY)!=='done'}
function tutorialCompleted(){return safeLocalGet(TUTORIAL_KEY)==='done'}

async function showStartupIfNeeded(){
  await refreshPermissionUi();
  if(firstRunNeedsStartup()){ els.startupLayer.hidden=false; document.body.classList.add('body-hidden-overflow'); }
  else if(!tutorialCompleted()) startTutorial();
}

async function grantStartupPermissions(){
  els.startupGrantBtn.disabled=true; const label=els.startupGrantBtn.querySelector('span'); const old=label.textContent; label.textContent='Requesting…';
  let micOk=false,notifOk=false;
  try{await requestMicrophonePermission();micOk=true}catch(error){console.warn(error);toast('Microphone permission was not granted','warn')}
  try{await requestNotificationPermission();notifOk=true;settings.desktopNotifications=true;settings.backgroundNotifications=true}catch(error){console.warn(error);toast('Notifications remain disabled','warn')}
  if(settings.persistentStorage) await requestPersistentStorage(); await refreshPermissionUi(); saveState();
  els.startupGrantBtn.disabled=false; label.textContent=old; safeLocalSet(ONBOARDING_KEY,'done');
  setTimeout(()=>finishStartup(),250);
}
function finishStartup(){ els.startupLayer.hidden=true; document.body.classList.remove('body-hidden-overflow'); if(!tutorialCompleted())startTutorial(); }

function startTutorial(step=0){ runtime.tutorialStep=clamp(step,0,tutorialSteps.length-1); els.tutorialLayer.hidden=false; document.body.classList.add('body-hidden-overflow'); renderTutorialStep(); }
function tutorialTarget(){ return document.querySelector(tutorialSteps[runtime.tutorialStep]?.target); }
function renderTutorialStep(){
  $$('.tutorial-focus').forEach(el=>el.classList.remove('tutorial-focus')); const step=tutorialSteps[runtime.tutorialStep]; if(!step)return finishTutorial();
  const target=tutorialTarget(); target?.classList.add('tutorial-focus'); els.tutorialCount.textContent=`${runtime.tutorialStep+1} / ${tutorialSteps.length}`; els.tutorialTitle.textContent=step.title; els.tutorialText.textContent=step.text; els.tutorialNextBtn.textContent=runtime.tutorialStep===tutorialSteps.length-1?'Finish':'Next';
  requestAnimationFrame(()=>positionTutorialUi(target));
}
function positionTutorialUi(target){ positionTutorialSpotlight(target); positionTutorialCard(target); }
function positionTutorialSpotlight(target){
  const spot=els.tutorialSpotlight;if(!spot)return;
  if(!target){spot.hidden=true;return;} spot.hidden=false;
  const r=target.getBoundingClientRect(), pad=9;
  spot.style.left=`${Math.max(6,r.left-pad)}px`; spot.style.top=`${Math.max(6,r.top-pad)}px`;
  spot.style.width=`${Math.min(innerWidth-12,r.width+pad*2)}px`; spot.style.height=`${Math.min(innerHeight-12,r.height+pad*2)}px`;
  spot.style.borderRadius=getComputedStyle(target).borderRadius||'16px';
}
function positionTutorialCard(target){ const card=els.tutorialCard;if(!target){card.style.left='50%';card.style.top='50%';card.style.transform='translate(-50%,-50%)';return;} const r=target.getBoundingClientRect(); const cr=card.getBoundingClientRect(); const gap=14; let left=r.right+gap,top=clamp(r.top,12,innerHeight-cr.height-12); if(left+cr.width>innerWidth-12)left=Math.max(12,r.left-cr.width-gap); if(left<12){left=clamp(r.left,12,innerWidth-cr.width-12);top=clamp(r.bottom+gap,12,innerHeight-cr.height-12)} card.style.left=`${left}px`;card.style.top=`${top}px`;card.style.transform='none'; }
function nextTutorial(){ if(runtime.tutorialStep>=tutorialSteps.length-1)return finishTutorial(); runtime.tutorialStep++;renderTutorialStep(); }
function finishTutorial(){ $$('.tutorial-focus').forEach(el=>el.classList.remove('tutorial-focus')); if(els.tutorialSpotlight)els.tutorialSpotlight.hidden=true; els.tutorialLayer.hidden=true;document.body.classList.remove('body-hidden-overflow');safeLocalSet(TUTORIAL_KEY,'done'); }
function skipTutorialStep(){ nextTutorial(); }
