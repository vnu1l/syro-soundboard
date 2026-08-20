'use strict';

(() => {
  const Native = window.SyroDesktop;
  if (!Native?.available) return;

  if (!Object.prototype.hasOwnProperty.call(settings,'inputDeviceId')) settings.inputDeviceId='';
  if (!Object.prototype.hasOwnProperty.call(settings,'outputDeviceId')) settings.outputDeviceId='';
  Native.mediaDevices = Native.mediaDevices || [];

  Native.refreshMediaDevices = async function refreshMediaDevices(){
    if(!navigator.mediaDevices?.enumerateDevices){this.mediaDevices=[];return []}
    try{this.mediaDevices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput'||d.kind==='audiooutput')}
    catch(error){console.warn('Media device enumeration failed',error);this.mediaDevices=[]}
    return this.mediaDevices;
  };

  const originalGum=navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  if(originalGum){
    navigator.mediaDevices.getUserMedia=constraints=>{
      if(constraints?.audio&&settings.inputDeviceId){
        const audio=constraints.audio===true?{}:{...constraints.audio};
        if(!audio.deviceId)audio.deviceId={exact:settings.inputDeviceId};
        constraints={...constraints,audio};
      }
      return originalGum(constraints);
    };
  }

  const baseAudioContext=audioContext;
  let appliedSink=null;
  audioContext=function desktopAudioContext(){
    const ctx=baseAudioContext();
    const desired=settings.outputDeviceId||'';
    if(desired!==appliedSink&&typeof ctx.setSinkId==='function'){
      appliedSink=desired;ctx.setSinkId(desired).catch(error=>{appliedSink=null;console.warn('Output routing failed',error)});
    }
    return ctx;
  };

  window.setSyroOutputDevice=async deviceId=>{
    settings.outputDeviceId=deviceId||'';
    const ctx=audioContext();
    if(typeof ctx.setSinkId!=='function'){
      if(deviceId)throw new Error('This WebView2 version does not expose per-app output routing. Use Windows Sound settings instead.');
      return;
    }
    await ctx.setSinkId(deviceId||'');appliedSink=deviceId||'';
  };

  function deviceOptions(items,selected,label){
    return items.map((d,i)=>`<option value="${escapeHtml(d.deviceId)}" ${selected===d.deviceId?'selected':''}>${escapeHtml(d.label||`${label} ${i+1}`)}${d.deviceId==='default'?' · Default':''}</option>`).join('');
  }
  function mountRoutingUi(){
    const page=$('.settings-page',els.settingsContent);if(!page)return;
    $('.desktop-native-settings',page)?.remove();
    const inputs=Native.mediaDevices.filter(d=>d.kind==='audioinput'),outputs=Native.mediaDevices.filter(d=>d.kind==='audiooutput');
    const nativeIn=Native.devices.filter(d=>d.kind==='input').length,nativeOut=Native.devices.filter(d=>d.kind==='output').length;
    const group=document.createElement('div');group.className='settings-group desktop-routing-settings';
    group.innerHTML=`<p class="settings-group-title">Windows audio routing</p>
      <label class="setting-row-v2"><div><strong>Playback output</strong><small>Route Syro playback to a specific Windows output.</small></div><div class="setting-control"><select class="setting-select" data-web-device="output"><option value="">System default</option>${deviceOptions(outputs,settings.outputDeviceId,'Output')}</select></div></label>
      <label class="setting-row-v2"><div><strong>Recording input</strong><small>Input used by Record and microphone Timeline tracks.</small></div><div class="setting-control"><select class="setting-select" data-web-device="input"><option value="">System default</option>${deviceOptions(inputs,settings.inputDeviceId,'Input')}</select></div></label>
      <div class="setting-row-v2"><div><strong>Native audio engine</strong><small>${nativeIn} input · ${nativeOut} output devices detected through Windows audio.</small></div><button class="permission-row-action" data-routing-refresh>Refresh</button></div>
      <div class="setting-row-v2"><div><strong>Windows Sound settings</strong><small>Formats, defaults and per-app routing.</small></div><button class="permission-row-action" data-routing-windows>Open</button></div>`;
    page.append(group);
  }

  const previousRender=renderSettingsPage;
  renderSettingsPage=function desktopRoutingSettings(page='general'){
    previousRender(page);
    if(page==='audio')Native.refreshMediaDevices().then(mountRoutingUi).catch(mountRoutingUi);
  };

  els.settingsContent.addEventListener('change',async event=>{
    const select=event.target.closest('[data-web-device]');if(!select)return;
    const isOutput=select.dataset.webDevice==='output';
    if(isOutput){
      try{await window.setSyroOutputDevice(select.value);saveState();toast(select.value?'Playback output changed':'Playback returned to system default','success')}
      catch(error){toast(error.message||String(error),'warn')}
    }else{settings.inputDeviceId=select.value;saveState();toast(select.value?'Recording input changed':'Recording input returned to system default','success')}
  });
  els.settingsContent.addEventListener('click',async event=>{
    if(event.target.closest('[data-routing-refresh]')){await Native.refreshMediaDevices();mountRoutingUi();toast('Audio devices refreshed','success');return}
    if(event.target.closest('[data-routing-windows]'))Native.openSettings('sound').catch(error=>toast(String(error),'danger'));
  });

  navigator.mediaDevices?.addEventListener?.('devicechange',()=>Native.refreshMediaDevices().catch(()=>{}));
  Native.refreshMediaDevices().then(()=>{if(settings.outputDeviceId)audioContext()}).catch(()=>{});
})();
