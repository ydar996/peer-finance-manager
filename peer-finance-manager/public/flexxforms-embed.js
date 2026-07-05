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
    const minHeight = (opts && opts.minHeight) || 320;
    const padding = (opts && opts.padding) || 16;

    iframe.setAttribute("scrolling", "no");
    iframe.style.overflow = "hidden";
    iframe.style.display = "block";
    iframe.style.width = "100%";

    function applyHeight(height) {
      const next = Math.max(minHeight, Math.ceil(height) + padding);
      iframe.style.height = `${next}px`;
      iframe.style.minHeight = `${next}px`;
    }

    function onMessage(event) {
      if (event.source !== iframe.contentWindow) return;
      if (!isFlexxFormsOrigin(event.origin)) return;
      const data = event.data;
      if (!data || data.type !== "flexxforms:resize") return;
      if (typeof data.height !== "number" || data.height <= 0) return;
      applyHeight(data.height);
    }

    window.addEventListener("message", onMessage);
    applyHeight(minHeight);

    return function unbind() {
      window.removeEventListener("message", onMessage);
      delete iframe.dataset.flexxformsResizeBound;
    };
  }

  global.bindFlexxFormsEmbedResize = bindFlexxFormsEmbedResize;
})(window);
