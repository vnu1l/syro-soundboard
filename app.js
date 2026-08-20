(async () => {
  const fragments = [
    ['#shellMount', './fragments/shell.html'],
    ['#app', './fragments/app-a.html'],
    ['#app', './fragments/app-b.html'],
    ['#overlayMount', './fragments/overlays-a.html'],
    ['#overlayMount', './fragments/overlays-b.html'],
  ];
  for (const [target, src] of fragments) {
    const response = await fetch(src, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Failed to load ${src}`);
    document.querySelector(target).insertAdjacentHTML('beforeend', await response.text());
  }
  const scripts = [
    './js/core-a.js', './js/core-b.js', './js/audio.js', './js/actions-a.js', './js/actions-b.js', './js/events-a.js', './js/events-b.js',
    './js/v2-core.js', './js/v2-onboarding.js', './js/v2-settings.js', './js/v2-library.js', './js/v2-timeline.js', './js/v2-actions.js', './js/v2-events.js'
  ];
  for (const src of scripts) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = src; script.async = false; script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${src}`)); document.head.appendChild(script);
    });
  }
})().catch(error => console.error('[Syro Soundboard]', error));
