(function (global) {
  const FLEXXFORMS_EMBED_SCRIPT = "https://flexxforms.netlify.app/embed.js";

  function ensureFlexxFormsEmbedScript() {
    if (global.__flexxformsEmbedScriptPromise) return global.__flexxformsEmbedScriptPromise;
    global.__flexxformsEmbedScriptPromise = new Promise(function (resolve, reject) {
      if (global.FlexxForms) {
        resolve();
        return;
      }
      var existing = document.querySelector('script[src="' + FLEXXFORMS_EMBED_SCRIPT + '"]');
      if (existing) {
        if (global.FlexxForms) {
          resolve();
          return;
        }
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

  /**
   * Mount a FlexxForms form via host embed.js.
   * Uses data-form-path="p" (public form) so deal/partner chrome ("Back to deal") is not shown.
   * Mounts once after embed.js loads (avoids duplicate iframes from mountAll + mount).
   */
  function mountFlexxFormsEmbed(container, opts) {
    opts = opts || {};
    var formId = opts.formId || parseFormIdFromEmbedUrl(opts.embedUrl);
    if (!container || !formId) {
      return Promise.reject(new Error("FlexxForms form id is required"));
    }

    var formTitle = opts.formTitle || "Application form";
    var formPath = opts.formPath || "p";
    var minHeight = opts.minHeight || 480;

    container.innerHTML = "";
    container.classList.remove("hidden");

    var host = document.createElement("div");
    host.className = "flexxforms-embed-mount";
    container.appendChild(host);

    var completedHandler = opts.onCompleted
      ? function (payload) {
          if (payload && payload.formId && payload.formId !== formId) return;
          opts.onCompleted(payload);
        }
      : null;
    var errorHandler = opts.onError
      ? function (payload) {
          if (payload && payload.formId && payload.formId !== formId) return;
          opts.onError(payload);
        }
      : null;

    return ensureFlexxFormsEmbedScript().then(function () {
      host.setAttribute("data-form-id", formId);
      host.setAttribute("data-form-title", formTitle);
      host.setAttribute("data-form-path", formPath);
      host.setAttribute("data-min-height", String(minHeight));

      if (!host.querySelector("iframe[data-flexxforms-form-id]")) {
        if (typeof global.FlexxForms?.mount === "function") {
          global.FlexxForms.mount(host);
        }
      }

      if (completedHandler && typeof global.FlexxForms?.on === "function") {
        global.FlexxForms.on("completed", completedHandler);
      }
      if (errorHandler && typeof global.FlexxForms?.on === "function") {
        global.FlexxForms.on("error", errorHandler);
      }
      return host;
    });
  }

  /** Raw iframe resize listener for signing URLs (not application forms). */
  function bindFlexxFormsEmbedResize(iframe, opts) {
    if (!iframe || iframe.dataset.flexxformsBound === "1") return function () {};
    iframe.dataset.flexxformsBound = "1";
    var padding = (opts && opts.padding) || 24;
    var minHeight = (opts && opts.minHeight) || 400;

    function onMessage(event) {
      if (event.origin !== "https://flexxforms.netlify.app") return;
      if (iframe.contentWindow && event.source !== iframe.contentWindow) return;
      var data = event.data;
      if (!data || data.type !== "flexxforms:resize") return;
      if (typeof data.height !== "number" || data.height <= 0) return;
      iframe.style.height = Math.max(minHeight, Math.ceil(data.height + padding)) + "px";
    }

    window.addEventListener("message", onMessage);
    iframe.style.width = "100%";
    iframe.style.display = "block";
    iframe.style.minHeight = minHeight + "px";

    return function unbind() {
      window.removeEventListener("message", onMessage);
      delete iframe.dataset.flexxformsBound;
    };
  }

  global.mountFlexxFormsEmbed = mountFlexxFormsEmbed;
  global.bindFlexxFormsEmbedResize = bindFlexxFormsEmbedResize;
})(window);
