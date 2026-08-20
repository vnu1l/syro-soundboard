(async () => {
  const scripts = [
    './js/core-a.js', './js/core-b.js', './js/audio.js',
    './js/actions-a.js', './js/actions-b.js', './js/events-a.js', './js/events-b.js'
  ];
  for (const src of scripts) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }
})().catch(error => console.error('[Syro Soundboard]', error));
