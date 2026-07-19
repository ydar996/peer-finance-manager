/**
 * Repair OCR mid-word spaces without gluing real words together.
 * Targets patterns like "s hall", "nam e", "Coop erative", "20 22".
 */

function repairOcrWordSplits(input) {
  let text = String(input || "");

  text = text.replace(/\b(19|20)\s+(\d{2})\b/g, "$1$2");
  text = text.replace(/(\w)\s+-\s*(\w)/g, "$1-$2");
  text = text.replace(/[^\S\n]+/g, " ");

  // High-confidence OCR phrase fixes (order matters for longer phrases first).
  const fixes = [
    [/\bs hall\b/gi, "shall"],
    [/\bsh all\b/gi, "shall"],
    [/\bsha ll\b/gi, "shall"],
    [/\bt he\b/g, "the"],
    [/\bT he\b/g, "The"],
    [/\bnam e\b/gi, "name"],
    [/\bb e\b/g, "be"],
    [/\bB e\b/g, "Be"],
    [/\ba nd\b/g, "and"],
    [/\bo f\b/g, "of"],
    [/\bo r\b/g, "or"],
    [/\bi n\b/g, "in"],
    [/\bt o\b/g, "to"],
    [/\ba s\b/g, "as"],
    [/\ba t\b/g, "at"],
    [/\bu p\b/g, "up"],
    [/\ban y\b/gi, "any"],
    [/\bh is\b/g, "his"],
    [/\bH is\b/g, "His"],
    [/\bb ank\b/gi, "bank"],
    [/\bma il\b/gi, "mail"],
    [/\bta x\b/gi, "tax"],
    [/\bq uorum\b/gi, "quorum"],
    [/\bv oting\b/gi, "voting"],
    [/\bvot e\b/gi, "vote"],
    [/\brig ht\b/gi, "right"],
    [/\bfo rth\b/gi, "forth"],
    [/\blea? st\b/gi, "least"],
    [/\bmeetin g\b/gi, "meeting"],
    [/\bMembe r\b/g, "Member"],
    [/\bM ember\b/g, "Member"],
    [/\bmember s\b/g, "members"],
    [/\bS urplus\b/g, "Surplus"],
    [/\bSe ction\b/gi, "Section"],
    [/\bAr ticle\b/gi, "Article"],
    [/\bLo sses\b/gi, "Losses"],
    [/\bE xpenses\b/gi, "Expenses"],
    [/\bW ritten\b/g, "Written"],
    [/\bw ritten\b/g, "written"],
    [/\bDirecto r\b/g, "Director"],
    [/\bd isbursed\b/gi, "disbursed"],
    [/\be stablish\b/gi, "establish"],
    [/\bi nterest\b/gi, "interest"],
    [/\binconve nient\b/gi, "inconvenient"],
    [/\bCoop erative\b/g, "Cooperative"],
    [/\bArticle s\b/g, "Articles"],
    [/\bB ylaws\b/gi, "Bylaws"],
    [/\bterminatio n\b/gi, "termination"],
    [/\bpartn ers\b/gi, "partners"],
    [/\bdissolut ion\b/gi, "dissolution"],
    [/\bcon tinue\b/gi, "continue"],
    [/\bat tempted\b/gi, "attempted"],
    [/\binten ded\b/gi, "intended"],
    [/\bperti nent\b/gi, "pertinent"],
    [/\bpr epared\b/gi, "prepared"],
    [/\bcircumst ances\b/gi, "circumstances"],
    [/\bf inancial\b/gi, "financial"],
    [/\bwit hdrawal\b/gi, "withdrawal"],
    [/\bals o\b/gi, "also"],
    [/\bf rom\b/gi, "from"],
    [/\bt han\b/gi, "than"],
    [/\bs ame\b/gi, "same"],
    [/\bto  the\b/g, "to the"],
    [/\bon the  date\b/gi, "on the date"],
    [/\bName purposes\b/gi, "Name and Purposes"],
    [/\bProfits and Loses\b/gi, "Profits and Losses"],
    [/\btwo\s*-\s*thirds?\b/gi, "two-thirds"],
  ];
  for (const [re, rep] of fixes) text = text.replace(re, rep);

  return text.replace(/[^\S\n]+/g, " ").replace(/ \n/g, "\n").replace(/\n /g, "\n").trim();
}

function fillAssuranceBylawsCertificate(text) {
  let t = String(text || "");
  t = t.replace(/_{3,}\s*_+\s*pages/gi, "______ pages");
  t = t.replace(
    /adopted by the Members on\s*[_\s,]{3,}\s*,?\s*20\s*22/gi,
    "adopted by the Members on December 9, 2022"
  );
  t = t.replace(
    /Executed on\s*[_\s,]{3,}\s*,?\s*20\s*22\s*at\s*[_\s,]{3,}\s*,?\s*California,\s*by\s*[_\s.]{3,}/gi,
    "Executed on December 9, 2022 at San Diego County, California, by Assurance Cooperative Executive Committee."
  );
  t = t.replace(/\b20\s+22\b/g, "2022");
  t = t.replace(/\bB\s*ylaws\b/gi, "Bylaws");
  return t;
}

module.exports = {
  repairOcrWordSplits,
  fillAssuranceBylawsCertificate,
};
