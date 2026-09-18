/**
 * Sanitize pasted Word / rich HTML for Cooperative messages (all tenants).
 * Keeps basic structure; strips scripts, styles, and unsafe attributes.
 */

const { escapeHtml } = require("./markdown-lite");

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201d",
  ldquo: "\u201c",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
};

function codePointToChar(code) {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return null;
  try {
    return String.fromCodePoint(code);
  } catch (_) {
    return null;
  }
}

function decodeOneEntity(body) {
  const key = String(body || "").toLowerCase();
  if (key.startsWith("#x")) {
    return codePointToChar(parseInt(key.slice(2), 16));
  }
  if (key.startsWith("#")) {
    return codePointToChar(Number(key.slice(1)));
  }
  return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key) ? NAMED_ENTITIES[key] : null;
}

/**
 * Decode HTML entities, repeating so already double-encoded text
 * (`&amp;amp;`) becomes a real `&` before we escape once on output.
 */
function decodeHtmlEntities(value) {
  let prev = String(value || "");
  for (let i = 0; i < 8; i += 1) {
    const next = prev.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (match, body) => {
      const decoded = decodeOneEntity(body);
      return decoded == null ? match : decoded;
    });
    if (next === prev) break;
    prev = next;
  }
  return prev;
}

function escapeHtmlTextNode(value) {
  return escapeHtml(decodeHtmlEntities(value));
}

const ALLOWED = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "a",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "blockquote",
  "hr",
]);

const VOID = new Set(["br", "hr"]);
const UNWRAP = new Set([
  "span",
  "font",
  "div",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "o:p",
]);

function stripWordChrome(html) {
  let s = String(html || "");
  const frag = /<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/i.exec(s);
  if (frag) s = frag[1];
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<\/?(html|head|body|meta|link|xml|o:[a-z0-9]+)[^>]*>/gi, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<\/?o:p[^>]*>/gi, "");
  return s;
}

function sanitizeHref(raw) {
  const href = decodeHtmlEntities(String(raw || "")).trim();
  if (/^https?:\/\//i.test(href)) return href;
  if (/^mailto:/i.test(href)) return href;
  return null;
}

function parseAttributes(attrText, tagName) {
  const attrs = [];
  const re = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(attrText || ""))) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    if (tagName === "a" && name === "href") {
      const safe = sanitizeHref(value);
      if (safe) {
        attrs.push(`href="${escapeHtml(safe)}"`);
        attrs.push('target="_blank"');
        attrs.push('rel="noopener noreferrer"');
      }
    }
  }
  return attrs.join(" ");
}

/**
 * Very small HTML sanitizer suitable for Word paste cleanup.
 */
function sanitizeRichHtml(html) {
  const input = stripWordChrome(html);
  if (!input.trim()) return "";

  let out = "";
  let i = 0;
  const len = input.length;

  while (i < len) {
    const lt = input.indexOf("<", i);
    if (lt === -1) {
      out += escapeHtmlTextNode(input.slice(i));
      break;
    }
    if (lt > i) {
      out += escapeHtmlTextNode(input.slice(i, lt));
    }
    const gt = input.indexOf(">", lt + 1);
    if (gt === -1) {
      out += escapeHtmlTextNode(input.slice(lt));
      break;
    }
    const rawTag = input.slice(lt + 1, gt).trim();
    i = gt + 1;

    if (!rawTag || rawTag.startsWith("!") || rawTag.startsWith("?")) continue;

    const isClose = rawTag.startsWith("/");
    const body = isClose ? rawTag.slice(1).trim() : rawTag;
    const space = body.search(/\s/);
    const tagName = (space === -1 ? body : body.slice(0, space)).toLowerCase().replace(/\/$/, "");
    const selfClosing = !isClose && (VOID.has(tagName) || /\/$/.test(body));
    const attrText = space === -1 ? "" : body.slice(space + 1).replace(/\/$/, "");

    if (UNWRAP.has(tagName)) {
      if (tagName === "div" && !isClose) {
        // Treat block divs as paragraph breaks when empty open/close pairs appear.
        continue;
      }
      continue;
    }

    if (!ALLOWED.has(tagName)) {
      continue;
    }

    if (isClose) {
      if (!VOID.has(tagName)) out += `</${tagName}>`;
      continue;
    }

    if (tagName === "br" || tagName === "hr") {
      out += `<${tagName}>`;
      continue;
    }

    const attrs = parseAttributes(attrText, tagName);
    out += attrs ? `<${tagName} ${attrs}>` : `<${tagName}>`;
    if (selfClosing && !VOID.has(tagName)) out += `</${tagName}>`;
  }

  // Normalize empty paragraphs Word often creates.
  out = out
    .replace(/<p>\s*(?:&nbsp;|\u00a0|\s)*<\/p>/gi, "")
    .replace(/(?:<br>\s*){3,}/gi, "<br><br>")
    .trim();

  if (!out) return "";
  // If paste was plain runs with no block tags, wrap.
  if (!/<(p|ul|ol|h[1-3]|table|blockquote)\b/i.test(out)) {
    out = `<p>${out.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
  }
  return out;
}

function htmlToPlainPreview(html, max = 160) {
  const text = decodeHtmlEntities(
    String(html || "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/p>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function isProbablyHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ""));
}

module.exports = {
  sanitizeRichHtml,
  htmlToPlainPreview,
  isProbablyHtml,
  stripWordChrome,
  decodeHtmlEntities,
};
