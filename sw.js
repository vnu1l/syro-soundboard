const CACHE='syro-soundboard-shell-v2-20260820';
const ASSETS=[
  './','./index.html','./styles.css','./app.js','./manifest.webmanifest',
  './fragments/shell.html','./fragments/app-a.html','./fragments/app-b.html','./fragments/overlays-a.html','./fragments/overlays-b.html',
  './css/base.css','./css/layout.css','./css/pads.css','./css/effects.css','./css/chrome-a.css','./css/chrome-b.css','./css/v2-base.css','./css/onboarding.css','./css/library.css','./css/timeline.css','./css/settings-v2.css',
  './js/core-a.js','./js/core-b.js','./js/audio.js','./js/actions-a.js','./js/actions-b.js','./js/v2-core.js','./js/v2-library.js','./js/v2-timeline.js','./js/v2-onboarding.js','./js/v2-settings.js','./js/v2-actions.js','./js/events-a.js','./js/events-b.js','./js/v2-events.js'
];
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)))});
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()])));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin)return;
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}return response}).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html'))));
});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{for(const client of clients){if('focus'in client)return client.focus()}return self.clients.openWindow('./')}))});
