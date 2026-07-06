(function (global) {
  const FLEXXFORMS_ORIGIN = "https://flexxforms.netlify.app";
  /** FlexxForms resize height often omits the fixed submit bar; pad so it stays visible. */
  const SUBMIT_FOOTER_PADDING = 120;

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
    return Math.max(3000, Math.round(vh * 2.8));
  }

  function buildPublicFormUrl(formId) {
    var url = FLEXXFORMS_ORIGIN + "/p/" + encodeURIComponent(formId);
    /* ?embed=1 on /p/ enables flexxforms:resize; deal chrome came from /embed path, not /p/. */
    return url + "?embed=1";
  }

  /**
   * Public cooperative application form — iframe src is /p/{formId}?embed=1.
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
    var shell = container.closest(".cp-apply-shell, .flexxforms-apply-card");

    container.innerHTML = "";
    container.classList.remove("hidden");

    var iframe = document.createElement("iframe");
    iframe.className = "flexxforms-public-embed-frame";
    iframe.title = formTitle;
    iframe.src = buildPublicFormUrl(formId);
    iframe.setAttribute("allow", "fullscreen");
    iframe.style.width = "100%";
    iframe.style.display = "block";
    iframe.style.border = "0";
    iframe.style.minHeight = minHeight + "px";
    iframe.style.height = minHeight + "px";
    container.appendChild(iframe);

    bindFlexxFormsEmbedResize(iframe, {
      shell: shell,
      padding: 24,
      minHeight: minHeight,
      submitFooterPadding: SUBMIT_FOOTER_PADDING,
    });

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
    var submitFooterPadding = (opts && opts.submitFooterPadding) || SUBMIT_FOOTER_PADDING;
    var minHeight = (opts && opts.minHeight) || defaultFormIframeHeight();
    var shell = (opts && opts.shell) || iframe.closest(".cp-apply-shell, .flexxforms-apply-card");
    var maxSeenHeight = minHeight;
    var resizeReceived = false;
    var fallbackTimer = null;

    function setScrolling(enabled) {
      iframe.setAttribute("scrolling", enabled ? "auto" : "no");
    }

    function applyHeight(height) {
      maxSeenHeight = Math.max(maxSeenHeight, height);
      var h = Math.max(minHeight, Math.ceil(maxSeenHeight));
      iframe.style.height = h + "px";
      iframe.style.minHeight = minHeight + "px";
      if (resizeReceived && h >= minHeight + submitFooterPadding) {
        setScrolling(false);
      } else {
        setScrolling(true);
      }
    }

    function notifyIframeResize() {
      try {
        iframe.contentWindow?.dispatchEvent(new Event("resize"));
      } catch (_) {}
    }

    function scheduleFallback() {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      fallbackTimer = setTimeout(function () {
        if (!resizeReceived) {
          applyHeight(defaultFormIframeHeight());
          setScrolling(true);
        }
      }, 2500);
    }

    function onMessage(event) {
      if (!isFlexxFormsOrigin(event.origin)) return;
      if (iframe.contentWindow && event.source !== iframe.contentWindow) return;
      var data = event.data;
      if (!data || data.type !== "flexxforms:resize") return;
      if (typeof data.height !== "number" || data.height <= 0) return;
      resizeReceived = true;
      applyHeight(data.height + padding + submitFooterPadding);
    }

    var resizeTimer = null;
    function onViewportChange() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        applyHeight(Math.max(maxSeenHeight, defaultFormIframeHeight()));
        notifyIframeResize();
      }, 150);
    }

    setScrolling(true);
    applyHeight(minHeight);
    scheduleFallback();

    window.addEventListener("message", onMessage);
    window.addEventListener("orientationchange", onViewportChange);
    window.addEventListener("resize", onViewportChange);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", onViewportChange);
    }
    iframe.addEventListener("load", function () {
      applyHeight(minHeight);
      scheduleFallback();
      notifyIframeResize();
    });

    return function unbind() {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("orientationchange", onViewportChange);
      window.removeEventListener("resize", onViewportChange);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", onViewportChange);
      }
      clearTimeout(resizeTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (shell) shell.classList.remove("is-landscape-focus");
      delete iframe.dataset.flexxformsBound;
    };
  }

  global.mountFlexxFormsEmbed = mountFlexxFormsEmbed;
  global.bindFlexxFormsEmbedResize = bindFlexxFormsEmbedResize;
})(window);
