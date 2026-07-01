(function() {
  console.log('[UdemyTranslator:VTT-Interceptor] loaded');

  // 자막 텍스트를 페이지로 브로드캐스트하지 않도록 같은 출처로만 postMessage 한다.
  const TARGET_ORIGIN = window.location.origin;

  // === fetch 래핑 ===
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = (typeof args[0] === 'string') ? args[0] : args[0]?.url;
      if (url && /\.vtt(\?|$)/i.test(url) && url.includes('vtt-c.udemycdn.com')) {
        console.log('[UdemyTranslator:VTT-Interceptor] detected VTT fetch:', url.substring(0, 80));
        response.clone().text().then(vttText => {
          window.postMessage({ type: 'UDEMY_VTT_CAPTURED', vttText, url }, TARGET_ORIGIN);
        }).catch(() => {});
      }
    } catch (_) {}
    return response;
  };

  // === XMLHttpRequest 래핑 ===
  const XHROpen = XMLHttpRequest.prototype.open;
  const XHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._vttUrl = (typeof url === 'string' && /\.vtt(\?|$)/i.test(url) && url.includes('vtt-c.udemycdn.com')) ? url : null;
    return XHROpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    if (this._vttUrl) {
      const url = this._vttUrl;
      this.addEventListener('load', function() {
        if (this.status === 200 && this.responseText) {
          console.log('[UdemyTranslator:VTT-Interceptor] detected VTT XHR:', url.substring(0, 80));
          window.postMessage({ type: 'UDEMY_VTT_CAPTURED', vttText: this.responseText, url }, TARGET_ORIGIN);
        }
      });
    }
    return XHRSend.apply(this, args);
  };
})();
