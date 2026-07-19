const { repairOcrWordSplits } = require("./ocr-text-repair");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

function htmlToPlainText(html) {
  if (!html) return "";
  let text = String(html);
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<\/h[1-6]>/gi, "\n\n");
  text = text.replace(/<\/li>/gi, "\n");
  text = text.replace(/<li[^>]*>/gi, "- ");
  text = text.replace(/<[^>]+>/g, "");
  text = decodeHtmlEntities(text);
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function isLikelyHeading(line, nextLine) {
  if (!line || line.length > 90) return false;
  if (/[.!?]$/.test(line)) return false;
  if (/^[-•*\d]+[.)]\s/.test(line)) return false;
  if (!nextLine) return line.length <= 60;
  if (/^[-•*\d]+[.)]\s/.test(nextLine)) return true;
  return nextLine.length > 50 || line.length <= 48;
}

function parseArticleHeading(line) {
  const m = String(line || "").match(
    /^Article\s+(\d+)\s*[.:)]?\s*(.*)$/i
  );
  if (!m) return null;
  const num = m[1];
  let title = repairOcrWordSplits(m[2] || "").replace(/^[\s.:]+/, "").trim();
  // "Article 17Indemnification" style (no space after number)
  if (!title) {
    const glued = String(line || "").match(/^Article\s+(\d+)([A-Za-z].*)$/i);
    if (glued) {
      title = repairOcrWordSplits(glued[2]).trim();
    }
  }
  if (!title) return null;
  return { num, title };
}

function plainTextToPublicHtml(text) {
  const repaired = repairOcrWordSplits(String(text || "").replace(/\r\n/g, "\n"));
  const normalized = repaired.trim();
  if (!normalized) return "";

  const lines = normalized.split("\n");
  const out = ['<div class="cp-page-body">'];
  let inList = false;
  let usedTitle = false;

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      closeList();
      continue;
    }

    const bulletMatch = line.match(/^(?:[-•*]|\d+[.)]|[a-z][.)])\s+(.+)$/i);
    if (bulletMatch) {
      if (!inList) {
        closeList();
        out.push('<ul class="cp-legal-list">');
        inList = true;
      }
      out.push(`<li>${escapeHtml(bulletMatch[1])}</li>`);
      continue;
    }

    closeList();

    const nextLine = (() => {
      for (let j = i + 1; j < lines.length; j += 1) {
        const candidate = lines[j].trim();
        if (candidate) return candidate;
      }
      return "";
    })();

    if (!usedTitle) {
      out.push(`<h1>${escapeHtml(line)}</h1>`);
      usedTitle = true;
      continue;
    }

    const article = parseArticleHeading(line);
    if (article) {
      out.push(
        `<h2 class="cp-section-title"><span class="cp-article-num">Article ${escapeHtml(article.num)}</span><span class="cp-article-name">${escapeHtml(article.title)}</span></h2>`
      );
      continue;
    }

    if (/^Certificate of Secretary$/i.test(line)) {
      out.push(`<h2 class="cp-section-title">${escapeHtml(line)}</h2>`);
      continue;
    }

    if (isLikelyHeading(line, nextLine)) {
      out.push(`<h2 class="cp-section-title">${escapeHtml(line)}</h2>`);
      continue;
    }

    out.push(`<p>${escapeHtml(line)}</p>`);
  }

  closeList();
  out.push("</div>");
  return out.join("\n");
}

function normalizeExternalUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function isValidExternalUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

module.exports = {
  escapeHtml,
  htmlToPlainText,
  plainTextToPublicHtml,
  parseArticleHeading,
  normalizeExternalUrl,
  isValidExternalUrl,
};
