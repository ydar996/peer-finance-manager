#!/usr/bin/env node
const assert = require("assert");
const { repairOcrWordSplits, fillAssuranceBylawsCertificate } = require("../lib/ocr-text-repair");
const { plainTextToPublicHtml, parseArticleHeading } = require("../lib/public-plain-text-html");

const repaired = repairOcrWordSplits(
  "The executive s hall post the nam e of the prospective applicant. The Coop erative shall act. new Article s may be adopted. terminatio n and partn ers. 20 22"
);
assert.ok(!repaired.includes("s hall"));
assert.ok(repaired.includes("shall"));
assert.ok(repaired.includes("name"));
assert.ok(repaired.includes("Cooperative"));
assert.ok(repaired.includes("Articles"));
assert.ok(repaired.includes("termination"));
assert.ok(repaired.includes("partners"));
assert.ok(repaired.includes("2022"));
assert.ok(repaired.includes("in the") || !repaired.includes("inthe"));

const article = parseArticleHeading("Article 17 Indemnification");
assert.strictEqual(article.num, "17");
assert.ok(/Indemnification/i.test(article.title));

const html = plainTextToPublicHtml(
  "Bylaws\n\nArticle 17 Indemnification\nThe Cooperative shall have the power to indemnify its Board."
);
assert.ok(html.includes('cp-article-num'));
assert.ok(html.includes('cp-article-name'));
assert.ok(html.includes("<p>The Cooperative shall have the power"));

const cert = fillAssuranceBylawsCertificate(
  "adopted by the Members on __________________, 20 22 and Executed on ________________, 20 22 at ____________________, California, by _________________________________."
);
assert.ok(cert.includes("December 9, 2022"));
assert.ok(cert.includes("Assurance Cooperative Executive Committee"));

console.log("  ocr-text-repair / bylaws html: OK");
console.log("All OCR/bylaws formatter tests passed.");
