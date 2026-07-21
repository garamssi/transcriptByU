(function() {
  console.log('[UdemyTranslator:VTT-Interceptor] loaded');

  // 자막 텍스트를 페이지로 브로드캐스트하지 않도록 같은 출처로만 postMessage 한다.
  const TARGET_ORIGIN = window.location.origin;

  // === 캡처 버퍼 (레이스 하드닝) ===
  // 인터셉터는 document_start(MAIN world)에 뜨지만, 메시지를 받는 content script의
  // 리스너는 document_idle + 비동기 초기화 이후에야 등록된다. 그 사이에 Udemy가
  // .vtt 를 가져오면 postMessage 는 리스너가 없어 유실된다(버퍼링 안 됨).
  // → 캡처한 VTT 를 버퍼에 쌓아두고, 브릿지가 'UDEMY_VTT_BRIDGE_READY' 를 보내오면
  //   버퍼 전체를 재전송(replay)하여 최초 로드 레이스에서도 자막이 유실되지 않게 한다.
  const MAX_BUFFER = 20;
  const captured = [];

  function broadcast(vttText, url) {
    // 같은 URL 중복 캡처 방지 (fetch/XHR 훅 양쪽에서 이중 캡처될 수 있음)
    if (captured.some(m => m.url === url)) return;
    captured.push({ vttText, url });
    if (captured.length > MAX_BUFFER) captured.shift();
    window.postMessage({ type: 'UDEMY_VTT_CAPTURED', vttText, url }, TARGET_ORIGIN);
  }

  // 브릿지 준비 신호 → 버퍼에 쌓인 VTT 를 모두 재전송한다.
  // (브릿지는 processedUrls 로 중복을 걸러내므로 이미 처리한 건 무시된다.)
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== 'UDEMY_VTT_BRIDGE_READY') return;
    if (captured.length === 0) return;
    console.log(`[UdemyTranslator:VTT-Interceptor] bridge ready — replaying ${captured.length} buffered VTT(s)`);
    for (const m of captured) {
      window.postMessage({ type: 'UDEMY_VTT_CAPTURED', vttText: m.vttText, url: m.url }, TARGET_ORIGIN);
    }
  });

  // Udemy 자막 VTT 판별. 자막은 CDN 서브도메인이 다양하다(vtt-c / mp4-cdnNN 등)므로
  // udemycdn.com 전반을 매칭하되, 스크럽 썸네일용 sprite VTT(thumb-sprites.vtt 등,
  // Content-Type 은 text/vtt 지만 내용은 이미지 좌표)는 제외한다. 내용 기반 최종 판별은
  // 브릿지(parseVtt 후)에서 한 번 더 한다.
  function isVttUrl(url) {
    return typeof url === 'string'
      && /\.vtt(\?|$)/i.test(url)
      && /udemycdn\.com/i.test(url)
      && !/sprite/i.test(url);
  }

  // === fetch 래핑 ===
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = (typeof args[0] === 'string') ? args[0] : args[0]?.url;
      if (isVttUrl(url)) {
        console.log('[UdemyTranslator:VTT-Interceptor] detected VTT fetch:', url.substring(0, 80));
        response.clone().text().then(vttText => broadcast(vttText, url)).catch(() => {});
      }
    } catch (_) {}
    return response;
  };

  // === XMLHttpRequest 래핑 ===
  const XHROpen = XMLHttpRequest.prototype.open;
  const XHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._vttUrl = isVttUrl(url) ? url : null;
    return XHROpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    if (this._vttUrl) {
      const url = this._vttUrl;
      this.addEventListener('load', function() {
        if (this.status === 200 && this.responseText) {
          console.log('[UdemyTranslator:VTT-Interceptor] detected VTT XHR:', url.substring(0, 80));
          broadcast(this.responseText, url);
        }
      });
    }
    return XHRSend.apply(this, args);
  };
})();
