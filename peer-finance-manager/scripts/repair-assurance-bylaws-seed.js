#!/usr/bin/env node
/**
 * Repair Assurance seeded bylaws HTML:
 * - Conservative OCR mid-word spaces
 * - Article heading markup
 * - Articles 14–18 structure + certificate fill
 * Run: node peer-finance-manager/scripts/repair-assurance-bylaws-seed.js
 */
const fs = require("fs");
const path = require("path");
const { repairOcrWordSplits, fillAssuranceBylawsCertificate } = require("../lib/ocr-text-repair");

const seedPath = path.join(__dirname, "../seed/assurance/public/bylaws.html");

function repairText(value) {
  return fillAssuranceBylawsCertificate(repairOcrWordSplits(value));
}

function repairHtmlTextNodes(html) {
  return String(html).replace(/>([^<]+)</g, (full, text) => {
    if (!/[A-Za-z_]/.test(text)) return full;
    return `>${repairText(text)}<`;
  });
}

function normalizeArticleTitles(html) {
  return String(html).replace(
    /<h2 class="cp-section-title"><span class="cp-article-num">Article\s+(\d+)<\/span>\s*([^<]+)<\/h2>/gi,
    (_, num, title) => {
      const cleanTitle = repairText(String(title).replace(/^[\s.:]+/, "").trim());
      const pretty = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
      return `<h2 class="cp-section-title"><span class="cp-article-num">Article ${num}</span><span class="cp-article-name">${pretty}</span></h2>`;
    }
  );
}

function rebuildTailArticles(html) {
  const marker = '<section class="cp-section" id="article-14">';
  const idx = html.indexOf(marker);
  if (idx === -1) throw new Error("article-14 section not found");

  const head = html.slice(0, idx);
  const crossIdx = html.indexOf('<div class="cp-crosslink-card">');
  const crosslink =
    crossIdx >= 0
      ? html.slice(crossIdx).replace(/<\/div>\s*<\/div>\s*$/, "</div>\n</div>\n")
      : `<div class="cp-crosslink-card"><p>Learn more about our mission and membership.</p><a class="cp-crosslink-btn" href="/c/assurance/about">Back to About Us</a></div>\n</div>\n`;

  const tail = `<section class="cp-section" id="article-14">
<h2 class="cp-section-title"><span class="cp-article-num">Article 14</span><span class="cp-article-name">Dissolution</span></h2>
<p>The Cooperative may be dissolved and terminated upon:</p>
<ul class="cp-legal-list">
<li>a. The vote or agreement of three-fourths of the partners; or</li>
<li>b. Upon any such dissolution and termination, the partners shall promptly liquidate the affairs of the Cooperative by distributing all remaining assets, in cash or in kind or partly in cash and partly in kind, to the members or their representatives in the ratios of their respective capital accounts on the date of dissolution and termination.</li>
</ul>
</section>
<section class="cp-section" id="article-15">
<h2 class="cp-section-title"><span class="cp-article-num">Article 15</span><span class="cp-article-name">Amendment</span></h2>
<p>These Articles may be amended or revoked, or new Articles may be adopted, upon a vote of three-fourths (3/4) of all the members of AIC. All prior membership agreements are superseded and replaced by the provisions of this partnership agreement.</p>
</section>
<section class="cp-section" id="article-16">
<h2 class="cp-section-title"><span class="cp-article-num">Article 16</span><span class="cp-article-name">Arbitration</span></h2>
<p>Any dispute which cannot be settled among the members involved shall, upon request of any members involved, be settled by arbitration in accordance with the rules of the American Arbitration Association then in effect.</p>
</section>
<section class="cp-section" id="article-17">
<h2 class="cp-section-title"><span class="cp-article-num">Article 17</span><span class="cp-article-name">Indemnification</span></h2>
<p>The Cooperative shall have the power to indemnify its Board, Officers, Directors, Members, employees, and agents to the fullest extent permitted by law.</p>
</section>
<section class="cp-section" id="article-18">
<h2 class="cp-section-title"><span class="cp-article-num">Article 18</span><span class="cp-article-name">Bylaws Changes</span></h2>
<p>The Bylaws can be changed only by a vote of Members in the circumstances defined in Article 15.</p>
</section>
<section class="cp-section" id="certificate">
<h2 class="cp-section-title">Certificate of Secretary</h2>
<p>I certify that I am the duly elected and acting Secretary of AIC, Inc., that these Bylaws, consisting of ______ pages, are the Bylaws of this Cooperative as adopted by the Members on December 9, 2022 and Executed on December 9, 2022 at San Diego County, California, by Assurance Cooperative Executive Committee.</p>
</section>
${crosslink.startsWith("<div") ? crosslink : ""}`;

  let out = head + tail;
  if (!/<\/div>\s*$/.test(out.trimEnd())) out += "\n</div>\n";
  return out;
}

function main() {
  let html = fs.readFileSync(seedPath, "utf8");
  // If a previous broken run left glued words, prefer git-clean content.
  if (html.includes("ofthe") || html.includes("inthe") || html.includes("bechangedonly")) {
    throw new Error(
      "Seed looks over-repaired (glued words). Restore with: git checkout -- peer-finance-manager/seed/assurance/public/bylaws.html"
    );
  }
  html = repairHtmlTextNodes(html);
  html = normalizeArticleTitles(html);
  html = rebuildTailArticles(html);
  fs.writeFileSync(seedPath, html, "utf8");
  console.log("Repaired", seedPath);
  const bad =
    html.includes("s hall") ||
    html.includes("Coop erative") ||
    html.includes("nam e") ||
    html.includes("ofthe") ||
    html.includes("inthe");
  console.log(bad ? "WARNING: OCR checks failed" : "OCR sample checks clean");
  console.log("Has Article 15 section:", html.includes('id="article-15"'));
  console.log("Has certificate date:", html.includes("December 9, 2022"));
  console.log("Has Executive Committee:", html.includes("Assurance Cooperative Executive Committee"));
}

main();
