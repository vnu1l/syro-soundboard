'use strict';

(() => {
  const tauri = window.__TAURI__;
  if (!tauri?.core?.invoke) return;
  const invoke = tauri.core.invoke;
  const listen = tauri.event?.listen;
  const Native = window.SyroDesktop = {
    available: true,
    capabilities: null,
    devices: [],
    processes: [],
    async invoke(command, args={}) { return invoke(command, args); },
    async refresh() {
      const [capabilities, devices] = await Promise.all([
        invoke('native_capabilities'), invoke('native_audio_devices').catch(()=>[])
      ]);
      this.capabilities = capabilities; this.devices = devices;
      document.documentElement.dataset.runtime='desktop'; document.body?.classList.add('desktop-runtime');
      return capabilities;
    },
    async processesList(){ this.processes=await invoke('native_processes'); return this.processes; },
    async startCapture(mode='system', processId=null){ return invoke('native_capture_start',{mode,processId}); },
    async stopCapture(id){ return invoke('native_capture_stop',{id}); },
    async readFileBlob(path,type='audio/wav'){ const bytes=await invoke('native_read_file',{path}); return new Blob([new Uint8Array(bytes)],{type}); },
    async syncHotkeys(){
      const bindings=(state?.pads||[]).filter(p=>p.shortcut).map(p=>({shortcut:p.shortcut.replace(/^Ctrl/i,'Control'),padId:p.id}));
      try{await invoke('native_sync_hotkeys',{bindings})}catch(error){console.warn('Native hotkey sync failed',error)}
    },
    async getAutostart(){return invoke('native_get_autostart')},
    async setAutostart(enabled){return invoke('native_set_autostart',{enabled:Boolean(enabled)})},
    async openSettings(page){return invoke('native_open_windows_settings',{page})}
  };

  const originalSaveState=saveState;
  saveState=function saveStateDesktop(...args){const result=originalSaveState(...args);clearTimeout(runtime.nativeHotkeyTimer);runtime.nativeHotkeyTimer=setTimeout(()=>Native.syncHotkeys(),120);return result;};

  if (listen) listen('syro://shortcut', event => { const id=event.payload; if(id) playPad(id); }).catch(console.warn);

  const baseAudioPage=SETTINGS_PAGES.audio;
  SETTINGS_PAGES.audio=()=>{
    const base=baseAudioPage();
    const inputs=Native.devices.filter(d=>d.kind==='input'),outputs=Native.devices.filter(d=>d.kind==='output');
    const opts=(items,key)=>items.map(d=>`<option value="${escapeHtml(d.id)}" ${settings[key]===d.id?'selected':''}>${escapeHtml(d.name)}${d.isDefault?' · Default':''}</option>`).join('');
    return base.replace('</section>',`<div class="settings-group desktop-native-settings"><p class="settings-group-title">Native Windows audio</p>
      <label class="setting-row-v2"><div><strong>Output device</strong><small>Native output routing target.</small></div><div class="setting-control"><select class="setting-select" data-native-device="output"><option value="">System default</option>${opts(outputs,'nativeOutputDevice')}</select></div></label>
      <label class="setting-row-v2"><div><strong>Input device</strong><small>Preferred microphone / input source.</small></div><div class="setting-control"><select class="setting-select" data-native-device="input"><option value="">System default</option>${opts(inputs,'nativeInputDevice')}</select></div></label>
      <div class="setting-row-v2"><div><strong>Windows Sound settings</strong><small>Manage devices, formats and per-app routing.</small></div><button class="permission-row-action" data-native-open="sound">Open</button></div>
    </div></section>`);
  };
  const baseGeneral=SETTINGS_PAGES.general;
  SETTINGS_PAGES.general=()=>baseGeneral().replace('</section>',`<div class="settings-group desktop-native-settings"><p class="settings-group-title">Desktop behavior</p>
    <label class="setting-row-v2"><div><strong>Start with Windows</strong><small>Launch Syro silently and keep it ready in the tray.</small></div><div class="setting-control"><input class="switch-input" id="nativeAutostartToggle" type="checkbox"><i class="switch-ui"></i></div></label>
    <div class="setting-row-v2"><div><strong>Close to tray</strong><small>The X button hides Syro instead of stopping audio and hotkeys.</small></div><span class="permission-badge is-granted"><i></i>Active</span></div>
  </div></section>`);

  const oldRenderSettings=renderSettingsPage;
  renderSettingsPage=function renderSettingsDesktop(page='general'){
    oldRenderSettings(page);
    if(page==='general') Native.getAutostart().then(v=>{const el=$('#nativeAutostartToggle');if(el)el.checked=Boolean(v)}).catch(()=>{});
  };
  els.settingsContent.addEventListener('change',e=>{
    const dev=e.target.closest('[data-native-device]'); if(dev){settings[dev.dataset.nativeDevice==='output'?'nativeOutputDevice':'nativeInputDevice']=dev.value;saveState();toast('Native audio preference saved','success');return;}
    if(e.target.id==='nativeAutostartToggle'){Native.setAutostart(e.target.checked).then(()=>toast(e.target.checked?'Syro will start with Windows':'Windows startup disabled','success')).catch(err=>toast(String(err),'danger'));}
  });
  els.settingsContent.addEventListener('click',e=>{const open=e.target.closest('[data-native-open]');if(open)Native.openSettings(open.dataset.nativeOpen).catch(err=>toast(String(err),'danger'));});

  Native.refresh().then(()=>{ Native.syncHotkeys(); if(els.settingsContent)renderSettingsPage('general'); }).catch(error=>console.warn('Syro native bridge unavailable',error));
})();
