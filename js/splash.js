(function() {
  'use strict';

  let lastHiddenTime = 0;
  const SPLASH_THRESHOLD = 60000;

  function hideSplash() {
    document.getElementById('splashScreen')?.classList.add('hide');
  }

  function showSplash() {
    const splash = document.getElementById('splashScreen');
    if (!splash) return;

    splash.classList.remove('hide');
    const content = splash.querySelector('.splash-content');
    if (content) {
      const clone = content.cloneNode(true);
      content.parentNode.replaceChild(clone, content);
    }

    setTimeout(hideSplash, 3800);
  }

  setTimeout(hideSplash, 3800);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      lastHiddenTime = Date.now();
    } else if (document.visibilityState === 'visible') {
      if (lastHiddenTime && (Date.now() - lastHiddenTime) >= SPLASH_THRESHOLD) {
        showSplash();
      }
    }
  });

  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.addListener('appStateChange', (state) => {
      if (!state.isActive) {
        lastHiddenTime = Date.now();
      } else if (lastHiddenTime && (Date.now() - lastHiddenTime) >= SPLASH_THRESHOLD) {
        showSplash();
      }
    });
  }
})();
