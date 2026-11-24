const Database = require("better-sqlite3");
const SRC = process.argv[2];
const OUT = process.argv[3];
const src = new Database(SRC, { readonly: true });
const db = new Database(OUT, { readonly: true });

const STOP = new Set([
  "com", "ng", "org", "gmail", "yahoo", "hotmail", "outlook", "www", "http", "https",
  "the", "and", "for", "from", "with", "this", "that", "mr", "mrs", "miss", "dr",
  "title", "monthly", "savings", "shared", "capital", "state", "origin", "bank",
  "name", "account", "number", "employment", "type", "company", "position", "next",
  "kin", "address", "employed", "self", "unemployed", "retired", "null", "true", "false",
  // generic Nigerian vocabulary legitimately reused in synthetic data
  "lagos", "oyo", "delta", "ekiti", "ogun", "osun", "ondo", "anambra", "enugu",
  "rivers", "kano", "kaduna", "edo", "kwara", "abuja", "ibadan", "surulere",
  "ikeja", "lekki", "yaba", "ikoyi", "apapa", "festac", "victoria", "island",
  "gtbank", "zenith", "access", "uba", "providus", "kuda", "sterling", "first",
  "road", "street", "avenue", "way", "close", "manager", "officer", "director",
  "chief", "marketing", "operations", "project", "insurance", "relationship",
  "agm", "merchant", "limited", "ltd", "plc", "nigeria", "nigerian",
  // schema constants / enum values - not PII
  "reclassify", "split", "setat", "setby", "default", "annual", "amount",
  "adjustment", "entry", "system", "import", "reconciliation",
  // generic vocab / JSON keys / enum values collected from source settings
  "africa", "dmy", "year", "scope",
]);

const needles = new Set(["twilight", "ttfc", "ttf", "eworkchop", "ydaramola", "workchop"]);
const addWords = (v) =>
  String(v || "")
    .split(/[\s,|/()\\;@.:'-]+/)
    .forEach((w) => {
      w = w.replace(/[^A-Za-z'-]/g, "").toLowerCase();
      if (w.length >= 3 && !STOP.has(w)) needles.add(w);
    });
// only person/org-bearing note fields become needles: company names and
// next-of-kin details. Generic vocab (states, banks, job titles) is skipped.
const noteValues = (v) =>
  String(v || "").split(";").forEach((p) => {
    const i = p.indexOf(":");
    if (i >= 0 && /company|next of kin/i.test(p.slice(0, i))) addWords(p.slice(i + 1));
  });

src.prepare("SELECT name FROM members").all().forEach((r) => addWords(r.name));
src.prepare("SELECT first_name,middle_name,last_name,display_name,next_of_kin_first_name,next_of_kin_last_name,signature_name FROM member_profiles").all().forEach((r) => Object.values(r).forEach(addWords));
src.prepare("SELECT member_name,bank_payment_names,alias_pattern FROM member_payment_aliases").all().forEach((r) => Object.values(r).forEach(addWords));
src.prepare("SELECT display_name,email FROM users").all().forEach((r) => Object.values(r).forEach(addWords));
src.prepare("SELECT email FROM member_email_delivery_log").all().forEach((r) => addWords(r.email));
src.prepare("SELECT notes FROM members WHERE notes IS NOT NULL").all().forEach((r) => noteValues(r.notes));
src.prepare("SELECT value FROM cooperative_settings").all().forEach((r) => addWords(r.value));

// word-level blacklist: a leak = an exact WORD match, not substring
console.log("scanning", needles.size, "identifier tokens (word-level)");
const toWords = (s) =>
  String(s).toLowerCase().split(/[^a-z']+/).filter((w) => w.length >= 3);
let leaks = 0;
const seen = new Set();
for (const t of db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((x) => x.name)) {
  for (const c of db.prepare("PRAGMA table_info(" + t + ")").all().map((c) => c.name)) {
    for (const r of db.prepare('SELECT CAST("' + c + '" AS TEXT) v FROM "' + t + '" WHERE "' + c + '" IS NOT NULL').all()) {
      for (const w of toWords(r.v)) {
        if (needles.has(w) && !seen.has(t + c + w)) {
          seen.add(t + c + w);
          leaks++;
          if (leaks <= 20) console.log("LEAK", t + "." + c, "[" + w + "]", "->", String(r.v).slice(0, 90));
        }
      }
    }
  }
}
console.log("word-level leaks:", leaks);

// whitelist check on narrations: every word in a transaction description must
// come from the synthetic vocabulary or a generated fake name
const allowed = new Set(
  ("nip cr dr by transfer inward mobile trf monthly contribution canary coop savings " +
    "entrance fee membership other fixed deposit placement time rollover treasury " +
    "interest credit dividend income received miscellaneous gtb zenith access uba fbn " +
    "sterling providus kuda sms alert charge stamp duty vat on charges commission " +
    "turnover office supplies legal documentation printing and stationery audit " +
    "transport logistics cot handling electronic levy cheque book courier services " +
    "ref transaction from account deposit bank").split(" ")
);
for (const r of db.prepare("SELECT name FROM members").all()) toWords(r.name).forEach((w) => allowed.add(w));
for (const r of db.prepare("SELECT member_name, bank_payment_names FROM member_payment_aliases").all())
  [r.member_name, r.bank_payment_names].forEach((v) => toWords(v || "").forEach((w) => allowed.add(w)));
let bad = 0;
for (const r of db.prepare("SELECT id, description FROM transactions WHERE description IS NOT NULL").all()) {
  const foreign = toWords(r.description).filter((w) => !allowed.has(w) && !/^\d+$/.test(w));
  if (foreign.length) {
    bad++;
    if (bad <= 15) console.log("FOREIGN-TEXT txn", r.id, foreign.join(","), "->", String(r.description).slice(0, 90));
  }
}
console.log("non-synthetic descriptions:", bad);

const s = src.prepare("SELECT SUM(amount) t FROM transactions").get().t;
const d = db.prepare("SELECT SUM(amount) t FROM transactions").get().t;
console.log("scale:", (d / s).toFixed(4), "| member ids:", JSON.stringify(db.prepare("SELECT MIN(id) a, MAX(id) b FROM members").get()),
  "| orphans:", db.prepare("SELECT COUNT(*) c FROM transactions WHERE member_id IS NOT NULL AND member_id NOT IN (SELECT id FROM members)").get().c,
  "| integrity:", db.prepare("PRAGMA integrity_check").get().integrity_check);
