(function (global) {
  const FLEXXFORMS_ORIGIN = "https://flexxforms.netlify.app";

  function isFlexxFormsOrigin(origin) {
    if (!origin) return false;
    try {
      var host = new URL(origin).hostname;
      return host === "flexxforms.netlify.app" || host.endsWith(".flexxforms.netlify.app");
    } catch (_) {
      return false;
    }
  }

  function parseFormIdFromEmbedUrl(url) {
    if (!url) return null;
    try {
      var parts = new URL(url, window.location.origin).pathname.split("/").filter(Boolean);
      return parts[parts.length - 1] || null;
    } catch (_) {
      return null;
    }
  }

  function viewportHeight() {
    if (window.visualViewport && window.visualViewport.height) {
      return window.visualViewport.height;
    }
    return window.innerHeight || document.documentElement.clientHeight || 480;
  }

  function defaultFormIframeHeight() {
    var vw = window.innerWidth || 390;
    var vh = viewportHeight();
    var landscape = window.matchMedia("(orientation: landscape)").matches;
    if (landscape && vh < 520) {
      return Math.max(1600, Math.round(vh * 4));
    }
    if (vw < 768) return Math.max(2800, Math.round(vh * 3.5));
    return Math.max(2400, Math.round(vh * 2.6));
  }

  /**
   * Public cooperative application form — iframe src is /p/{formId} with NO ?embed=1.
   * Never uses embed.js or /embed (those show PlacementExpress / "Back to deal" chrome).
   */
  function mountFlexxFormsEmbed(container, opts) {
    opts = opts || {};
    var formId = opts.formId || parseFormIdFromEmbedUrl(opts.embedUrl);
    if (!container || !formId) {
      return Promise.reject(new Error("FlexxForms form id is required"));
    }

    var formTitle = opts.formTitle || "Application form";
    var minHeight = opts.minHeight || defaultFormIframeHeight();

    container.innerHTML = "";
    container.classList.remove("hidden");

    var iframe = document.createElement("iframe");
    iframe.className = "flexxforms-public-embed-frame";
    iframe.title = formTitle;
    iframe.src = FLEXXFORMS_ORIGIN + "/p/" + encodeURIComponent(formId);
    iframe.setAttribute("allow", "fullscreen");
    iframe.setAttribute("scrolling", "no");
    iframe.style.width = "100%";
    iframe.style.display = "block";
    iframe.style.border = "0";
    iframe.style.minHeight = minHeight + "px";
    iframe.style.height = minHeight + "px";
    container.appendChild(iframe);

    bindFlexxFormsEmbedResize(iframe, { padding: 24, minHeight: minHeight });

    function onLifecycle(event) {
      if (!isFlexxFormsOrigin(event.origin)) return;
      if (iframe.contentWindow && event.source !== iframe.contentWindow) return;
      var data = event.data;
      if (!data || typeof data.type !== "string") return;
      if (data.formId && data.formId !== formId) return;
      if (data.type === "flexxforms:completed" && opts.onCompleted) {
        opts.onCompleted(data);
      }
      if (data.type === "flexxforms:error" && opts.onError) {
        opts.onError(data);
      }
    }
    window.addEventListener("message", onLifecycle);
    iframe.dataset.flexxformsFormId = formId;

    return Promise.resolve(iframe);
  }

  /** Resize + orientation refresh for FlexxForms iframes. */
  function bindFlexxFormsEmbedResize(iframe, opts) {
    if (!iframe || iframe.dataset.flexxformsBound === "1") return function () {};
    iframe.dataset.flexxformsBound = "1";
    var padding = (opts && opts.padding) || 24;
    var minHeight = (opts && opts.minHeight) || 400;

    function applyHeight(height) {
      var h = Math.max(minHeight, Math.ceil(height));
      iframe.style.height = h + "px";
      iframe.style.minHeight = minHeight + "px";
    }

    function refreshHeight() {
      applyHeight(Math.max(minHeight, defaultFormIframeHeight()));
      try {
        iframe.contentWindow?.dispatchEvent(new Event("resize"));
      } catch (_) {}
    }

    function onMessage(event) {
      if (!isFlexxFormsOrigin(event.origin)) return;
      if (iframe.contentWindow && event.source !== iframe.contentWindow) return;
      var data = event.data;
      if (!data || data.type !== "flexxforms:resize") return;
      if (typeof data.height !== "number" || data.height <= 0) return;
      applyHeight(data.height + padding);
    }

    var resizeTimer = null;
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

  global.mountFlexxFormsEmbed = mountFlexxFormsEmbed;
  global.bindFlexxFormsEmbedResize = bindFlexxFormsEmbedResize;
})(window);
