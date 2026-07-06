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
    if (vw < 768) return Math.max(2800, Math.round(vh * 3.5));
    return Math.max(3000, Math.round(vh * 2.8));
  }

  function buildPublicFormUrl(formId) {
    return FLEXXFORMS_ORIGIN + "/p/" + encodeURIComponent(formId);
  }

  /**
   * FlexxForms July 2026: direct iframe /p/{formId} with no query params.
   * Parent listens for flexxforms:resize, flexxforms:completed, flexxforms:error.
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
    iframe.src = buildPublicFormUrl(formId);
    iframe.setAttribute("allow", "fullscreen");
    iframe.style.width = "100%";
    iframe.style.display = "block";
    iframe.style.border = "0";
    iframe.style.minHeight = "480px";
    iframe.style.height = Math.max(480, minHeight) + "px";
    container.appendChild(iframe);

    bindFlexxFormsEmbedResize(iframe, { minHeight: 480 });

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
      if (data.type === "flexxforms:submitting" && opts.onSubmitting) {
        opts.onSubmitting(data);
      }
    }

    window.addEventListener("message", onLifecycle);
    iframe.dataset.flexxformsFormId = formId;

    return Promise.resolve(iframe);
  }

  /** FlexxForms-recommended resize listener for /p/ iframes. */
  function bindFlexxFormsEmbedResize(iframe, opts) {
    if (!iframe || iframe.dataset.flexxformsBound === "1") return function () {};
    iframe.dataset.flexxformsBound = "1";
    var minHeight = (opts && opts.minHeight) || 480;
    var maxSeenHeight = Math.max(minHeight, parseInt(iframe.style.height, 10) || minHeight);

    function applyHeight(height) {
      maxSeenHeight = Math.max(maxSeenHeight, Math.ceil(height));
      iframe.style.height = maxSeenHeight + "px";
    }

    function onMessage(event) {
      if (!isFlexxFormsOrigin(event.origin)) return;
      if (iframe.contentWindow && event.source !== iframe.contentWindow) return;
      var data = event.data;
      if (!data || data.type !== "flexxforms:resize") return;
      if (typeof data.height !== "number" || data.height <= 0) return;
      applyHeight(Math.max(minHeight, data.height));
    }

    window.addEventListener("message", onMessage);
    iframe.style.width = "100%";
    iframe.style.display = "block";

    return function unbind() {
      window.removeEventListener("message", onMessage);
      delete iframe.dataset.flexxformsBound;
    };
  }

  global.mountFlexxFormsEmbed = mountFlexxFormsEmbed;
  global.bindFlexxFormsEmbedResize = bindFlexxFormsEmbedResize;
  global.defaultFlexxFormsFormHeight = defaultFormIframeHeight;
})(window);
