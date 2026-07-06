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

  function viewportHeight() {
    if (window.visualViewport && window.visualViewport.height) {
      return window.visualViewport.height;
    }
    return window.innerHeight || document.documentElement.clientHeight || 480;
  }

  /** Tall enough that the full form + signature pad render without a clipped iframe box. */
  function defaultFullFormHeight() {
    const vw = window.innerWidth || 390;
    const vh = viewportHeight();
    const landscape = window.matchMedia("(orientation: landscape)").matches;
    if (landscape && vh < 520) {
      return Math.max(1600, Math.round(vh * 4));
    }
    if (vw < 768) return Math.max(2800, Math.round(vh * 3.5));
    return Math.max(2400, Math.round(vh * 2.6));
  }

  function bindFlexxFormsEmbedResize(iframe, opts) {
    if (!iframe || iframe.dataset.flexxformsBound === "1") return function () {};
    iframe.dataset.flexxformsBound = "1";

    const padding = (opts && opts.padding) || 24;
    const minHeight = (opts && opts.minHeight) || 480;
    let formHeight = (opts && opts.fullFormHeight) || defaultFullFormHeight();

    iframe.setAttribute("allow", "fullscreen");
    iframe.setAttribute("scrolling", "no");
    iframe.style.width = "100%";
    iframe.style.display = "block";

    function applyHeight(height) {
      formHeight = Math.max(minHeight, Math.ceil(height));
      iframe.style.height = `${formHeight}px`;
      iframe.style.minHeight = `${formHeight}px`;
    }

    function refreshHeight() {
      applyHeight(Math.max(formHeight, defaultFullFormHeight()));
      try {
        iframe.contentWindow?.dispatchEvent(new Event("resize"));
      } catch (_) {}
    }

    function onMessage(event) {
      if (!isFlexxFormsOrigin(event.origin)) return;
      if (iframe.contentWindow && event.source !== iframe.contentWindow) return;
      const data = event.data;
      if (!data || data.type !== "flexxforms:resize") return;
      if (typeof data.height !== "number" || data.height <= 0) return;
      applyHeight(data.height + padding);
    }

    let resizeTimer = null;
    function onViewportChange() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(refreshHeight, 150);
    }

    window.addEventListener("message", onMessage);
    window.addEventListener("orientationchange", onViewportChange);
    window.addEventListener("resize", onViewportChange);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", onViewportChange);
    }
    iframe.addEventListener("load", refreshHeight);

    applyHeight(formHeight);

    return function unbind() {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("orientationchange", onViewportChange);
      window.removeEventListener("resize", onViewportChange);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", onViewportChange);
      }
      clearTimeout(resizeTimer);
      delete iframe.dataset.flexxformsBound;
    };
  }

  global.bindFlexxFormsEmbedResize = bindFlexxFormsEmbedResize;
})(window);
