/**
 * Small safe Markdown → HTML for Cooperative messages (all tenants).
 * Supports headings, bold/italic, lists, links, code, paragraphs.
 * No raw HTML passthrough.
 */

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInline(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^_])_([^_]+)_(?!_)/g, "$1<em>$2</em>");
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return s;
}

function renderMarkdownToSafeHtml(markdown) {
  const src = String(markdown || "").replace(/\r\n/g, "\n");
  if (!src.trim()) return "";

  const lines = src.split("\n");
  const out = [];
  let i = 0;
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let codeBuf = [];

  const closeLists = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      if (inCode) {
        out.push(`<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        closeLists();
        inCode = true;
      }
      i += 1;
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      i += 1;
      continue;
    }

    if (/^\s*$/.test(line)) {
      closeLists();
      i += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      closeLists();
      const level = heading[1].length;
      out.push(`<h${level}>${formatInline(heading[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      closeLists();
      out.push("<hr>");
      i += 1;
      continue;
    }

    const ul = /^\s*[-*+]\s+(.+)$/.exec(line);
    if (ul) {
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${formatInline(ul[1])}</li>`);
      i += 1;
      continue;
    }

    const ol = /^\s*\d+\.\s+(.+)$/.exec(line);
    if (ol) {
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        out.push("<ol>");
        inOl = true;
      }
      out.push(`<li>${formatInline(ol[1])}</li>`);
      i += 1;
      continue;
    }

    closeLists();
    const para = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6})\s+|^\s*[-*+]\s+|^\s*\d+\.\s+|^\s*```/.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    out.push(`<p>${formatInline(para.join(" "))}</p>`);
  }

  if (inCode) {
    out.push(`<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
  }
  closeLists();
  return out.join("\n");
}

function markdownPreviewPlain(markdown, max = 160) {
  const text = String(markdown || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_`>\-]+/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

module.exports = {
  escapeHtml,
  renderMarkdownToSafeHtml,
  markdownPreviewPlain,
};
