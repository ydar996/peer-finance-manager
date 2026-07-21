(function (global) {
  const FLEXXFORMS_ORIGIN = "https://flexxforms.netlify.app";
  const FLEXXFORMS_EMBED_SCRIPT = FLEXXFORMS_ORIGIN + "/embed.js";

  function isFlexxFormsOrigin(origin) {
    if (!origin) return false;
    try {
      var host = new URL(origin).hostname;
      return host === "flexxforms.netlify.app" || host.endsWith(".flexxforms.netlify.app");
    } catch (_) {
      return false;
    }
  }

  function ensureFlexxFormsEmbedScript() {
    if (global.__flexxformsEmbedScriptPromise) return global.__flexxformsEmbedScriptPromise;
    global.__flexxformsEmbedScriptPromise = new Promise(function (resolve, reject) {
      if (global.FlexxForms) {
        resolve();
        return;
      }
      var existing = document.querySelector('script[src="' + FLEXXFORMS_EMBED_SCRIPT + '"]');
      if (existing) {
        existing.addEventListener("load", function () {
          resolve();
        });
        existing.addEventListener("error", function () {
          reject(new Error("Failed to load FlexxForms embed.js"));
        });
        return;
      }
      var script = document.createElement("script");
      script.src = FLEXXFORMS_EMBED_SCRIPT;
      script.async = true;
      script.onload = function () {
        resolve();
      };
      script.onerror = function () {
        reject(new Error("Failed to load FlexxForms embed.js"));
      };
      document.head.appendChild(script);
    });
    return global.__flexxformsEmbedScriptPromise;
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

  function isLandscapeSigningViewport() {
    try {
      return window.matchMedia("(orientation: landscape) and (max-height: 520px)").matches;
    } catch (_) {
      return false;
    }
  }

  /**
   * Fit the visible page shell. The form scrolls inside the iframe.
   * Growing to FlexxForms document height caused endless gaps near the signature pad.
   */
  function defaultFormIframeHeight() {
    var vh = viewportHeight();
    var chrome = isLandscapeSigningViewport() ? 20 : 168;
    return Math.max(480, Math.round(vh - chrome));
  }

  function buildPublicFormUrl(formId) {
    return FLEXXFORMS_ORIGIN + "/p/" + encodeURIComponent(formId);
  }

  function findEmbedIframe(container) {
    if (!container) return null;
    return (
      container.querySelector("iframe[data-flexxforms-form-id]") ||
      container.querySelector("iframe.flexxforms-public-embed-frame") ||
      container.querySelector("iframe")
    );
  }

  function prepareIframe(iframe, heightPx) {
    if (!iframe) return;
    var h = Math.max(480, Math.round(heightPx));
    iframe.setAttribute("scrolling", "yes");
    iframe.setAttribute("allow", "fullscreen");
    iframe.style.width = "100%";
    iframe.style.display = "block";
    iframe.style.border = "0";
    iframe.style.height = h + "px";
    iframe.style.minHeight = h + "px";
    iframe.style.maxHeight = h + "px";
  }

  function dedupeFlexxFormsIframes(container) {
    if (!container) return;
    var frames = container.querySelectorAll("iframe[data-flexxforms-form-id], iframe.flexxforms-public-embed-frame");
    for (var i = 1; i < frames.length; i++) {
      frames[i].remove();
    }
    var mounts = container.querySelectorAll(".flexxforms-embed-mount");
    for (var j = 1; j < mounts.length; j++) {
      mounts[j].remove();
    }
  }

  function wireLifecycleListeners(formId, opts) {
    function handlePayload(data) {
      if (!data) return;
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

    function onMessage(event) {
      if (!isFlexxFormsOrigin(event.origin)) return;
      var data = event.data;
      if (!data || typeof data.type !== "string") return;
      handlePayload(data);
    }

    window.addEventListener("message", onMessage);

    if (global.FlexxForms && typeof global.FlexxForms.on === "function") {
      if (opts.onCompleted) {
        global.FlexxForms.on("completed", function (payload) {
          if (payload && payload.formId && payload.formId !== formId) return;
          opts.onCompleted(payload);
        });
      }
      if (opts.onError) {
        global.FlexxForms.on("error", function (payload) {
          if (payload && payload.formId && payload.formId !== formId) return;
          opts.onError(payload);
        });
      }
    }
  }

  function mountDirectIframe(container, opts, formId, formTitle, shellHeight) {
    var iframe = document.createElement("iframe");
    iframe.className = "flexxforms-public-embed-frame";
    iframe.title = formTitle;
    iframe.src = buildPublicFormUrl(formId);
    prepareIframe(iframe, shellHeight);
    container.appendChild(iframe);
    bindFlexxFormsEmbedResize(iframe, { minHeight: 480, mode: "shell" });
    wireLifecycleListeners(formId, opts);
    iframe.dataset.flexxformsFormId = formId;
    return iframe;
  }

  /**
   * FlexxForms July 2026: embed.js public mode (data-embed-mode="public") preferred;
   * falls back to direct /p/ iframe if embed.js fails to load.
   */
  function mountFlexxFormsEmbed(container, opts) {
    opts = opts || {};
    var formId = opts.formId || parseFormIdFromEmbedUrl(opts.embedUrl);
    if (!container || !formId) {
      return Promise.reject(new Error("FlexxForms form id is required"));
    }

    var formTitle = opts.formTitle || "Application form";
    var shellHeight = opts.minHeight || defaultFormIframeHeight();
    var usePublicSdk = opts.usePublicSdk !== false;

    container.innerHTML = "";
    container.classList.remove("hidden");
    container.dataset.flexxformsMounted = formId;

    if (!usePublicSdk) {
      return Promise.resolve(mountDirectIframe(container, opts, formId, formTitle, shellHeight));
    }

    var host = document.createElement("div");
    host.className = "flexxforms-embed-mount";
    container.appendChild(host);

    return ensureFlexxFormsEmbedScript()
      .then(function () {
        host.setAttribute("data-form-id", formId);
        host.setAttribute("data-form-path", "p");
        host.setAttribute("data-embed-mode", "public");
        host.setAttribute("data-form-title", formTitle);
        host.setAttribute("data-min-height", String(shellHeight));

        if (!host.querySelector("iframe[data-flexxforms-form-id]")) {
          if (typeof global.FlexxForms?.mount === "function") {
            global.FlexxForms.mount(host);
          }
        }

        wireLifecycleListeners(formId, opts);

        function syncIframe() {
          dedupeFlexxFormsIframes(container);
          var iframe = findEmbedIframe(container);
          if (iframe) {
            prepareIframe(iframe, defaultFormIframeHeight());
            bindFlexxFormsEmbedResize(iframe, { minHeight: 480, mode: "shell" });
          }
        }

        syncIframe();
        setTimeout(syncIframe, 400);
        setTimeout(syncIframe, 1200);

        return host;
      })
      .catch(function () {
        container.innerHTML = "";
        return mountDirectIframe(container, opts, formId, formTitle, shellHeight);
      });
  }

  /**
   * Shell mode (default): keep iframe at viewport shell height; scroll inside.
   * Content-based grow was abandoned: signature pads inflate document height and create
   * endless whitespace between the pad and Submit, plus scroll thrash.
   */
  function bindFlexxFormsEmbedResize(iframe, opts) {
    if (!iframe || iframe.dataset.flexxformsBound === "1") return function () {};
    iframe.dataset.flexxformsBound = "1";
    var minHeight = (opts && opts.minHeight) || 480;
    var mode = (opts && opts.mode) || "shell";
    var applying = false;

    function shellHeight() {
      return Math.max(minHeight, defaultFormIframeHeight());
    }

    function applyShell() {
      applying = true;
      prepareIframe(iframe, shellHeight());
      // Release on next frame so MutationObserver can ignore our own writes.
      requestAnimationFrame(function () {
        applying = false;
      });
    }

    function onMessage(event) {
      if (!isFlexxFormsOrigin(event.origin)) return;
      var data = event.data;
      if (!data || data.type !== "flexxforms:resize") return;
      if (mode === "shell") {
        applyShell();
        return;
      }
      if (typeof data.height !== "number" || data.height <= 0) return;
      var next = Math.max(minHeight, Math.ceil(data.height + 48));
      var cap = Math.max(shellHeight() * 1.25, 1200);
      prepareIframe(iframe, Math.min(next, cap));
    }

    function onViewportChange() {
      applyShell();
    }

    var observer = null;
    if (typeof MutationObserver === "function") {
      observer = new MutationObserver(function () {
        if (applying || mode !== "shell") return;
        var current = parseInt(iframe.style.height, 10) || 0;
        var target = shellHeight();
        if (Math.abs(current - target) > 24) {
          applyShell();
        }
      });
      observer.observe(iframe, { attributes: true, attributeFilter: ["style"] });
    }

    window.addEventListener("message", onMessage);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("orientationchange", onViewportChange);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", onViewportChange);
    }
    applyShell();

    return function unbind() {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("orientationchange", onViewportChange);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", onViewportChange);
      }
      if (observer) observer.disconnect();
      delete iframe.dataset.flexxformsBound;
    };
  }

  global.mountFlexxFormsEmbed = mountFlexxFormsEmbed;
  global.bindFlexxFormsEmbedResize = bindFlexxFormsEmbedResize;
  global.defaultFlexxFormsFormHeight = defaultFormIframeHeight;
  global.buildFlexxFormsPublicUrl = buildPublicFormUrl;
})(window);
