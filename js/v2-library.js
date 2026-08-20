'use strict';

const BUILTIN_SOUNDS = [
  ['Deep Pulse','impact','pulse',.55],['Soft Ping','ui','ping',.8],['Bass Hit','impact','bass',.45],['Air Sweep','transition','sweep',1.2],
  ['Neon Click','ui','click',.18],['Glass Tap','ui','glass',.35],['Soft Pop','ui','pop',.28],['Confirm','ui','confirm',.42],
  ['Error Buzz','ui','error',.48],['Tiny Bell','chime','bell',1.05],['Dream Chime','chime','chime',1.45],['Crystal','chime','crystal',1.25],
  ['Whoosh Short','transition','whoosh',.65],['Reverse Air','transition','reverse',.9],['Riser','transition','riser',1.6],['Drop','transition','drop',.7],
  ['Laser','sci-fi','laser',.55],['Zap','sci-fi','zap',.34],['Power Up','sci-fi','powerup',1.25],['Glitch','sci-fi','glitch',.72],
  ['Sub Boom','impact','subboom',1.1],['Punch','impact','punch',.34],['Metal Hit','impact','metal',.68],['Snap','impact','snap',.2],
  ['Notification','alert','notify',.7],['Warning','alert','warning',1.1],['Success','alert','success',.8],['Countdown','alert','countdown',.55]
].map(([name,category,synth,duration],i)=>({id:`builtin-${synth}`,name,category,synth,duration,color:accentPalette[i%accentPalette.length]}));

const EFFECT_PRESETS = [
  ['Clean Boost','utility',{volume:118,compression:18}],['Punchy','utility',{volume:108,bass:5,treble:2,compression:42}],['Broadcast','voice',{bass:2,treble:5,lowpass:15000,compression:58}],['Telephone','voice',{bass:-9,treble:7,lowpass:4200,drive:9}],
  ['Deep Voice','voice',{bass:10,treble:-4,pitch:-3,compression:26}],['Bright Voice','voice',{bass:-2,treble:8,pitch:1,compression:32}],['Hall','space',{reverb:58,echo:8}],['Cave','space',{reverb:78,echo:22,bass:4}],
  ['Small Room','space',{reverb:24,compression:15}],['Long Echo','space',{echo:62,reverb:18}],['Distant','space',{volume:72,reverb:48,lowpass:6600}],['Dream','creative',{reverb:68,echo:26,treble:5,pitch:2}],
  ['Dark','creative',{bass:7,treble:-8,lowpass:7200}],['Crunch','creative',{drive:38,compression:45,bass:3}],['Destroyed','creative',{drive:78,lowpass:5200,compression:62}],['Tiny','creative',{pitch:7,treble:5,bass:-6}],
  ['Monster','creative',{pitch:-7,bass:12,drive:18,compression:45}],['Radio','creative',{bass:-7,treble:4,lowpass:5200,drive:14,compression:50}],['Left Focus','stereo',{pan:-70}],['Right Focus','stereo',{pan:70}],
  ['Bass Max','tone',{bass:15,compression:24}],['Treble Spark','tone',{treble:14,bass:-2}],['Muffled','tone',{lowpass:2400,reverb:8}],['Soft Air','tone',{treble:7,reverb:18,compression:12}]
].map(([name,category,effects],i)=>({id:`fx-${i}`,name,category,effects}));

const SYNTH_DURATIONS = Object.fromEntries(BUILTIN_SOUNDS.map(s=>[s.synth,s.duration]));

createSynthBuffer = function createSynthBufferV2(kind) {
  const ctx=audioContext(); const duration=SYNTH_DURATIONS[kind]||{pulse:.55,ping:.8,bass:.45,sweep:1.2}[kind]||.7;
  const length=Math.max(1,Math.floor(ctx.sampleRate*duration)); const buffer=ctx.createBuffer(1,length,ctx.sampleRate); const data=buffer.getChannelData(0);
  const rnd=()=>Math.random()*2-1; const env=(i,p=2.5)=>Math.pow(Math.max(0,1-i/length),p);
  for(let i=0;i<length;i++){
    const t=i/ctx.sampleRate, x=i/length; let v=0;
    switch(kind){
      case 'pulse':v=Math.sin(2*Math.PI*(78+22*Math.exp(-t*10))*t)*env(i,3.1)*.75;break;
      case 'ping':v=(Math.sin(2*Math.PI*620*t)+.32*Math.sin(2*Math.PI*1240*t))*env(i,3)*.35;break;
      case 'bass':v=Math.sin(2*Math.PI*(108-48*x)*t)*env(i,3.3)*.88;break;
      case 'sweep':v=rnd()*Math.sin(Math.PI*x)*.11;break;
      case 'click':v=(rnd()*.35+Math.sin(2*Math.PI*1250*t)*.2)*env(i,16);break;
      case 'glass':v=(Math.sin(2*Math.PI*1480*t)+.45*Math.sin(2*Math.PI*2360*t))*env(i,6)*.28;break;
      case 'pop':v=Math.sin(2*Math.PI*(220-120*x)*t)*env(i,8)*.65;break;
      case 'confirm':v=(Math.sin(2*Math.PI*660*t)*(x<.42)+Math.sin(2*Math.PI*990*t)*(x>=.42))*env(i,2.2)*.22;break;
      case 'error':v=(Math.sin(2*Math.PI*130*t)+.35*Math.sin(2*Math.PI*138*t))*env(i,2.2)*.35;break;
      case 'bell':v=(Math.sin(2*Math.PI*880*t)+.35*Math.sin(2*Math.PI*1320*t)+.16*Math.sin(2*Math.PI*1760*t))*env(i,2.6)*.24;break;
      case 'chime':v=(Math.sin(2*Math.PI*523*t)+.5*Math.sin(2*Math.PI*784*t)+.22*Math.sin(2*Math.PI*1046*t))*env(i,1.9)*.18;break;
      case 'crystal':v=(Math.sin(2*Math.PI*1180*t)+.5*Math.sin(2*Math.PI*1770*t))*env(i,2)*.22;break;
      case 'whoosh':v=rnd()*Math.sin(Math.PI*x)*(.06+.14*x);break;
      case 'reverse':v=rnd()*Math.pow(x,1.8)*.17;break;
      case 'riser':v=(rnd()*.06+Math.sin(2*Math.PI*(120+900*x)*t)*.12)*Math.pow(x,1.5);break;
      case 'drop':v=Math.sin(2*Math.PI*(520-440*x)*t)*env(i,1.4)*.25;break;
      case 'laser':v=Math.sin(2*Math.PI*(1100-900*x)*t)*env(i,1.8)*.24;break;
      case 'zap':v=(Math.sin(2*Math.PI*(1800-1300*x)*t)+rnd()*.25)*env(i,5)*.22;break;
      case 'powerup':v=Math.sin(2*Math.PI*(120+900*x*x)*t)*Math.sin(Math.PI*x)*.2;break;
      case 'glitch':v=((i%Math.max(2,Math.floor(ctx.sampleRate*.012)))<ctx.sampleRate*.006?1:-1)*rnd()*env(i,1.6)*.12;break;
      case 'subboom':v=Math.sin(2*Math.PI*(74-28*x)*t)*env(i,2.2)*.92;break;
      case 'punch':v=(rnd()*.2+Math.sin(2*Math.PI*(160-80*x)*t)*.7)*env(i,8);break;
      case 'metal':v=(Math.sin(2*Math.PI*510*t)+.5*Math.sin(2*Math.PI*817*t)+rnd()*.08)*env(i,3)*.22;break;
      case 'snap':v=rnd()*env(i,22)*.55;break;
      case 'notify':v=(Math.sin(2*Math.PI*740*t)*(x<.45)+Math.sin(2*Math.PI*1040*t)*(x>=.45))*env(i,2.3)*.2;break;
      case 'warning':v=Math.sin(2*Math.PI*(x<.5?420:350)*t)*(.35+.65*Math.sin(Math.PI*x))*env(i,1.2)*.18;break;
      case 'success':v=(Math.sin(2*Math.PI*523*t)+Math.sin(2*Math.PI*659*t)+Math.sin(2*Math.PI*784*t))*env(i,2.2)*.11;break;
      case 'countdown':v=Math.sin(2*Math.PI*880*t)*env(i,10)*.24;break;
      default:v=rnd()*env(i,3)*.08;
    }
    data[i]=clamp(v,-1,1);
  }
  return buffer;
};

function openLibrary(tab='sounds') { runtime.libraryTab=tab; els.libraryDrawer.classList.add('is-open'); els.libraryScrim.classList.add('is-open'); renderLibrary(); setTimeout(()=>els.librarySearchInput.focus(),180); }
function closeLibrary(){ els.libraryDrawer.classList.remove('is-open'); els.libraryScrim.classList.remove('is-open'); }
function libraryItems(){ return runtime.libraryTab==='sounds'?BUILTIN_SOUNDS:EFFECT_PRESETS; }
function libraryCategories(){ return ['all',...new Set(libraryItems().map(i=>i.category))]; }

function renderLibrary(){
  const term=runtime.librarySearch.trim().toLowerCase(); const items=libraryItems().filter(item=>(runtime.libraryCategory==='all'||item.category===runtime.libraryCategory)&&(!term||item.name.toLowerCase().includes(term)||item.category.includes(term)));
  els.libraryCategories.innerHTML=libraryCategories().map(cat=>`<button class="category-chip ${cat===runtime.libraryCategory?'is-active':''}" data-category="${cat}">${cat==='all'?'All':cat.replace(/(^|-)\w/g,m=>m.toUpperCase())}</button>`).join('');
  els.libraryGrid.innerHTML=items.length?items.map(item=>runtime.libraryTab==='sounds'?`<article class="library-card" data-library-id="${item.id}" style="--card-accent:${item.color}"><div class="library-card__top"><span class="library-card__icon"><svg><use href="#i-wave"></use></svg></span><span class="library-card__tag">${item.category}</span></div><strong>${escapeHtml(item.name)}</strong><small>${item.duration.toFixed(2)} sec · generated locally</small><div class="library-card__actions"><button class="library-mini" data-library-action="preview">Preview</button><button class="library-mini" data-library-action="apply">${selectedPad()?'Replace selected':'Add to board'}</button></div></article>`:`<article class="library-card" data-library-id="${item.id}"><div class="library-card__top"><span class="library-card__icon"><svg><use href="#i-spark"></use></svg></span><span class="library-card__tag">${item.category}</span></div><strong>${escapeHtml(item.name)}</strong><small>${Object.keys(item.effects).join(' · ')}</small><div class="library-card__actions"><button class="library-mini" data-library-action="apply">Apply to selected</button></div></article>`).join(''):'<div class="library-empty">No library items match this filter.</div>';
  $$('.library-card',els.libraryGrid).forEach(bindPointerGlow);
}

function previewLibrarySound(item){
  try{ const buffer=createSynthBuffer(item.synth); const pad=makePad({name:item.name,kind:'synth',synth:item.synth,duration:item.duration,effects:defaultEffects()}); const voice=buildVoice(buffer,pad); voice.source.start(); setTimeout(()=>{try{voice.source.stop()}catch(_){}},Math.min(item.duration*1000+100,2200)); }catch(e){toast('Could not preview sound','danger');}
}

function applyLibrarySound(item){
  const before=snapshot(); const target=selectedPad();
  if(target){ stopPad(target.id); runtime.buffers.delete(target.id); Object.assign(target,{name:item.name,kind:'synth',synth:item.synth,audioKey:null,mime:'',duration:item.duration,startOffset:0,endOffset:null}); target.effects={...target.effects}; commitHistory(before); renderAll(); toast(`Replaced ${target.name}`,'success'); }
  else { const pad=makePad({name:item.name,kind:'synth',synth:item.synth,duration:item.duration,group:item.category==='impact'?'effects':'all',color:item.color}); state.pads.push(pad); state.selectedPadId=pad.id; commitHistory(before); renderAll(); toast(`${item.name} added`,'success'); }
  renderLibrary();
}
function applyEffectPreset(item){ const pad=selectedPad(); if(!pad){toast('Select a sound pad before applying an effect preset','warn');return;} const before=snapshot(); pad.effects={...pad.effects,...item.effects}; updateLiveNodes(pad); commitHistory(before); renderEffects(); pulseContextTargets(); toast(`${item.name} applied`,'success'); }
