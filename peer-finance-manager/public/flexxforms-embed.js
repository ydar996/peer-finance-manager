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

  function defaultFormIframeHeight() {
    var vw = window.innerWidth || 390;
    var vh = viewportHeight();
    if (vw < 768) return Math.max(3200, Math.round(vh * 4));
    return Math.max(3600, Math.round(vh * 3));
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

  function prepareIframe(iframe, minHeight) {
    if (!iframe) return;
    iframe.setAttribute("scrolling", "yes");
    iframe.setAttribute("allow", "fullscreen");
    iframe.style.width = "100%";
    iframe.style.display = "block";
    iframe.style.border = "0";
    iframe.style.minHeight = Math.max(480, minHeight) + "px";
    if (!iframe.style.height || parseInt(iframe.style.height, 10) < minHeight) {
      iframe.style.height = Math.max(480, minHeight) + "px";
    }
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

  function mountDirectIframe(container, opts, formId, formTitle, minHeight) {
    var iframe = document.createElement("iframe");
    iframe.className = "flexxforms-public-embed-frame";
    iframe.title = formTitle;
    iframe.src = buildPublicFormUrl(formId);
    prepareIframe(iframe, minHeight);
    container.appendChild(iframe);
    bindFlexxFormsEmbedResize(iframe, { minHeight: 480 });
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
    var minHeight = opts.minHeight || defaultFormIframeHeight();
    var usePublicSdk = opts.usePublicSdk !== false;

    container.innerHTML = "";
    container.classList.remove("hidden");
    container.dataset.flexxformsMounted = formId;

    if (!usePublicSdk) {
      return Promise.resolve(mountDirectIframe(container, opts, formId, formTitle, minHeight));
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
        host.setAttribute("data-min-height", String(minHeight));

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
            prepareIframe(iframe, minHeight);
            bindFlexxFormsEmbedResize(iframe, { minHeight: 480 });
          }
        }

        syncIframe();
        setTimeout(syncIframe, 400);
        setTimeout(syncIframe, 1200);

        return host;
      })
      .catch(function () {
        container.innerHTML = "";
        return mountDirectIframe(container, opts, formId, formTitle, minHeight);
      });
  }

  /** FlexxForms-recommended resize listener. */
  function bindFlexxFormsEmbedResize(iframe, opts) {
    if (!iframe || iframe.dataset.flexxformsBound === "1") return function () {};
    iframe.dataset.flexxformsBound = "1";
    var minHeight = (opts && opts.minHeight) || 480;
    var maxSeenHeight = Math.max(minHeight, parseInt(iframe.style.height, 10) || minHeight);

    function applyHeight(height) {
      maxSeenHeight = Math.max(maxSeenHeight, Math.ceil(height));
      iframe.style.height = maxSeenHeight + "px";
      iframe.style.minHeight = Math.max(minHeight, maxSeenHeight) + "px";
    }

    function onMessage(event) {
      if (!isFlexxFormsOrigin(event.origin)) return;
      var data = event.data;
      if (!data || data.type !== "flexxforms:resize") return;
      if (typeof data.height !== "number" || data.height <= 0) return;
      applyHeight(Math.max(minHeight, data.height + 48));
    }

    window.addEventListener("message", onMessage);
    prepareIframe(iframe, maxSeenHeight);

    return function unbind() {
      window.removeEventListener("message", onMessage);
      delete iframe.dataset.flexxformsBound;
    };
  }

  global.mountFlexxFormsEmbed = mountFlexxFormsEmbed;
  global.bindFlexxFormsEmbedResize = bindFlexxFormsEmbedResize;
  global.defaultFlexxFormsFormHeight = defaultFormIframeHeight;
  global.buildFlexxFormsPublicUrl = buildPublicFormUrl;
})(window);
