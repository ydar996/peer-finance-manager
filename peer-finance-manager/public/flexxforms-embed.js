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

  function debounce(fn, wait) {
    let timer = null;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, wait);
    };
  }

  function viewportHeight() {
    if (window.visualViewport && window.visualViewport.height) {
      return window.visualViewport.height;
    }
    return window.innerHeight || document.documentElement.clientHeight || 480;
  }

  function isMobileLandscape() {
    return window.matchMedia("(orientation: landscape)").matches && viewportHeight() < 520;
  }

  function bindFlexxFormsEmbedResize(iframe, opts) {
    if (!iframe || iframe.dataset.flexxformsResizeBound === "1") return function () {};
    iframe.dataset.flexxformsResizeBound = "1";

    const shell = (opts && opts.shell) || iframe.closest(".cp-apply-shell, .flexxforms-apply-card");
    const minHeight = (opts && opts.minHeight) || 480;
    const padding = (opts && opts.padding) || 20;
    const fallbackHeight = (opts && opts.fallbackHeight) || 1400;
    const fallbackDelayMs = (opts && opts.fallbackDelayMs) || 2500;
    const lockScrollMinHeight = (opts && opts.lockScrollMinHeight) || 640;

    iframe.setAttribute("allow", "fullscreen");
    iframe.style.display = "block";
    iframe.style.width = "100%";

    let maxSeenHeight = 0;
    let resizeReceived = false;
    let fallbackTimer = null;
    let landscapeActive = false;

    function setScrolling(enabled) {
      iframe.setAttribute("scrolling", enabled ? "auto" : "no");
    }

    function notifyIframeResize() {
      try {
        iframe.contentWindow?.dispatchEvent(new Event("resize"));
      } catch (_) {}
    }

    function applyHeight(height, force) {
      if (landscapeActive && !force) return;
      maxSeenHeight = Math.max(force ? 0 : maxSeenHeight, height);
      const next = Math.max(minHeight, Math.ceil(maxSeenHeight) + padding);
      iframe.style.height = `${next}px`;
      iframe.style.minHeight = `${next}px`;
      if (!landscapeActive && maxSeenHeight >= lockScrollMinHeight) {
        setScrolling(false);
      }
    }

    function applyLandscapeLayout() {
      const nextLandscape = isMobileLandscape();
      landscapeActive = nextLandscape;
      if (shell) shell.classList.toggle("is-landscape-focus", nextLandscape);
      document.body.classList.toggle("cp-apply-landscape", nextLandscape);

      if (nextLandscape) {
        const h = Math.max(280, Math.floor(viewportHeight() - 12));
        iframe.style.height = `${h}px`;
        iframe.style.minHeight = `${h}px`;
        setScrolling(true);
      } else {
        maxSeenHeight = 0;
        applyHeight(minHeight, true);
        setScrolling(true);
      }
      notifyIframeResize();
    }

    function scheduleFallback() {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      fallbackTimer = setTimeout(function () {
        if (landscapeActive) return;
        if (!resizeReceived || maxSeenHeight < lockScrollMinHeight) {
          applyHeight(fallbackHeight, true);
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
      if (landscapeActive) {
        const h = Math.max(data.height + padding, Math.floor(viewportHeight() - 12));
        iframe.style.height = `${h}px`;
        iframe.style.minHeight = `${h}px`;
        setScrolling(true);
        return;
      }
      applyHeight(data.height);
    }

    function onViewportChange() {
      applyLandscapeLayout();
      if (!landscapeActive) {
        maxSeenHeight = 0;
        resizeReceived = false;
        scheduleFallback();
      }
    }

    const debouncedViewportChange = debounce(onViewportChange, 120);

    window.addEventListener("message", onMessage);
    window.addEventListener("orientationchange", debouncedViewportChange);
    window.addEventListener("resize", debouncedViewportChange);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", debouncedViewportChange);
    }
    iframe.addEventListener("load", scheduleFallback);
    iframe.addEventListener("load", debouncedViewportChange);

    setScrolling(true);
    applyHeight(minHeight, true);
    applyLandscapeLayout();

    return function unbind() {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("orientationchange", debouncedViewportChange);
      window.removeEventListener("resize", debouncedViewportChange);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", debouncedViewportChange);
      }
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (shell) shell.classList.remove("is-landscape-focus");
      document.body.classList.remove("cp-apply-landscape");
      delete iframe.dataset.flexxformsResizeBound;
    };
  }

  global.bindFlexxFormsEmbedResize = bindFlexxFormsEmbedResize;
})(window);
