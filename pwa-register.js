(() => {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  const script = document.currentScript;
  const workerUrl = new URL('./service-worker-v21.js', script?.src || document.baseURI);
  const scope = new URL('./', workerUrl);

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(workerUrl, { scope: scope.pathname, updateViaCache: 'none' }).catch((error) => {
      console.warn('ELLIOTT+ offline support could not start.', error);
    });
  }, { once: true });
})();
