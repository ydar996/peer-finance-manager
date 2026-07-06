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

  /** Tall enough for membership form + signature on first paint (parent page scrolls, not a clipped iframe). */
  function defaultFullFormHeight() {
    const vw = window.innerWidth || 390;
    if (vw < 768) return Math.max(2800, Math.round(viewportHeight() * 3.5));
    return Math.max(2400, Math.round(viewportHeight() * 2.6));
  }

  function bindFlexxFormsEmbedResize(iframe, opts) {
    if (!iframe || iframe.dataset.flexxformsBound === "1") return function () {};
    iframe.dataset.flexxformsBound = "1";

    const shell = (opts && opts.shell) || iframe.closest(".cp-apply-shell, .flexxforms-apply-card");
    const padding = (opts && opts.padding) || 24;
    const minHeight = (opts && opts.minHeight) || 480;
    let portraitHeight = (opts && opts.fullFormHeight) || defaultFullFormHeight();

    iframe.setAttribute("allow", "fullscreen");
    iframe.style.width = "100%";
    iframe.style.display = "block";

    function isLandscape() {
      return window.matchMedia("(orientation: landscape)").matches;
    }

    function setIframeHeight(height, allowInternalScroll) {
      const next = Math.max(minHeight, Math.ceil(height));
      iframe.style.height = `${next}px`;
      iframe.style.minHeight = `${next}px`;
      iframe.setAttribute("scrolling", allowInternalScroll ? "auto" : "no");
    }

    function syncLayout() {
      const landscape = isLandscape();
      if (shell) shell.classList.toggle("is-landscape-focus", landscape);
      document.body.classList.toggle("cp-apply-landscape", landscape);

      if (landscape) {
        setIframeHeight(viewportHeight() - 8, true);
      } else {
        setIframeHeight(portraitHeight, false);
      }

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
      if (isLandscape()) return;
      portraitHeight = Math.max(portraitHeight, data.height + padding);
      setIframeHeight(portraitHeight, false);
    }

    const debouncedLayout = debounce(syncLayout, 100);

    window.addEventListener("message", onMessage);
    window.addEventListener("orientationchange", debouncedLayout);
    window.addEventListener("resize", debouncedLayout);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", debouncedLayout);
    }
    iframe.addEventListener("load", debouncedLayout);

    setIframeHeight(portraitHeight, false);
    syncLayout();

    return function unbind() {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("orientationchange", debouncedLayout);
      window.removeEventListener("resize", debouncedLayout);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", debouncedLayout);
      }
      if (shell) shell.classList.remove("is-landscape-focus");
      document.body.classList.remove("cp-apply-landscape");
      delete iframe.dataset.flexxformsBound;
    };
  }

  global.bindFlexxFormsEmbedResize = bindFlexxFormsEmbedResize;
})(window);
