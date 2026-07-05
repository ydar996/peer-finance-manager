(function (global) {
  function isFlexxFormsOrigin(origin) {
    if (!origin) return false;
    try {
      const host = new URL(origin).hostname;
      return host === "flexxforms.netlify.app" || host.endsWith(".flexxforms.netlify.app");
    } catch {
      return false;
    }
  }

  function bindFlexxFormsEmbedResize(iframe, opts) {
    if (!iframe || iframe.dataset.flexxformsResizeBound === "1") return function () {};
    iframe.dataset.flexxformsResizeBound = "1";

    const minHeight = (opts && opts.minHeight) || 480;
    const padding = (opts && opts.padding) || 20;
    const fallbackHeight = (opts && opts.fallbackHeight) || 1400;
    const fallbackDelayMs = (opts && opts.fallbackDelayMs) || 2500;
    const lockScrollMinHeight = (opts && opts.lockScrollMinHeight) || 640;

    iframe.style.display = "block";
    iframe.style.width = "100%";

    let maxSeenHeight = 0;
    let resizeReceived = false;
    let fallbackTimer = null;

    function setScrolling(enabled) {
      iframe.setAttribute("scrolling", enabled ? "auto" : "no");
    }

    function applyHeight(height) {
      maxSeenHeight = Math.max(maxSeenHeight, height);
      const next = Math.max(minHeight, Math.ceil(maxSeenHeight) + padding);
      iframe.style.height = `${next}px`;
      iframe.style.minHeight = `${next}px`;
      if (maxSeenHeight >= lockScrollMinHeight) {
        setScrolling(false);
      }
    }

    function scheduleFallback() {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      fallbackTimer = setTimeout(function () {
        if (!resizeReceived || maxSeenHeight < lockScrollMinHeight) {
          applyHeight(fallbackHeight);
          setScrolling(true);
        }
      }, fallbackDelayMs);
    }

    function onMessage(event) {
      if (!isFlexxFormsOrigin(event.origin)) return;
      if (iframe.contentWindow && event.source !== iframe.contentWindow) return;
      const data = event.data;
      if (!data || data.type !== "flexxforms:resize") return;
      if (typeof data.height !== "number" || data.height <= 0) return;
      resizeReceived = true;
      applyHeight(data.height);
    }

    window.addEventListener("message", onMessage);
    iframe.addEventListener("load", scheduleFallback);
    setScrolling(true);
    applyHeight(minHeight);

    return function unbind() {
      window.removeEventListener("message", onMessage);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      delete iframe.dataset.flexxformsResizeBound;
    };
  }

  global.bindFlexxFormsEmbedResize = bindFlexxFormsEmbedResize;
})(window);
