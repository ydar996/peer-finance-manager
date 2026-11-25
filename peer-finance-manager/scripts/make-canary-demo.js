#!/usr/bin/env node
/**
 * Build a sanitized demo ("canary") Cooperative database from a real backup.
 *
 *   node scripts/make-canary-demo.js <source.db> <output.db>
 *
 * What it does:
 *  - Scales every money figure by SCALE_FACTOR (default 1.75)
 *  - Replaces member names, emails, phones, addresses, next-of-kin with
 *    fictitious Nigerian identities (fake names share NO word with real data)
 *  - Re-maps member ids to a shuffled range (original ids unrecoverable)
 *  - Rewrites member numbers as CAN-xxx
 *  - Regenerates all transaction narrations, expense/loan/meeting text,
 *    member notes, references and filenames synthetically - no real
 *    free-text survives (real text can name non-members and vendors)
 *  - Randomizes all bank account numbers
 *  - Word-level scrubs org names / settings JSON as a residual safety net
 *  - Wipes tables that carry irrecoverable PII (email bodies, delivery log,
 *    messages, sessions, photos/doc paths, signing URLs)
 *  - Seeds demo users: admin@canarycoop.ng + one member login
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const SRC = process.argv[2];
const OUT = process.argv[3];
const SCALE = Number(process.env.SCALE_FACTOR || 1.75);
const ORG_NAME = process.env.CANARY_NAME || "Canary Multipurpose Cooperative Society";
const ORG_SHORT = "CANARY";

if (!SRC || !OUT) {
  console.error("usage: node scripts/make-canary-demo.js <source.db> <output.db>");
  process.exit(1);
}
if (fs.existsSync(OUT)) fs.unlinkSync(OUT);
fs.copyFileSync(SRC, OUT);
const db = new Database(OUT);
db.pragma("foreign_keys = OFF");

// ---------- helpers ----------
const rnd = (arr) => arr[crypto.randomInt(arr.length)];
const rndDigits = (n) =>
  Array.from({ length: n }, () => crypto.randomInt(10)).join("");
const scale = (v) =>
  v == null ? v : Math.round(Number(v) * SCALE * 100) / 100;

function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64, {
    N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024,
  });
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

const FIRST_ALL = [
  "Adaeze","Chidi","Ngozi","Emeka","Funke","Tunde","Bisi","Kunle","Amara","Segun",
  "Yemi","Nkechi","Femi","Halima","Ibrahim","Chinwe","Dotun","Kelechi","Mariam","Sola",
  "Tobi","Uche","Wunmi","Zainab","Gbenga","Nneka","Rotimi","Simi","Tayo","Bode",
  "Chika","Damilola","Efe","Folake","Gbenro","Hauwa","Idris","Jumoke","Kazeem","Lola",
];
const LAST_ALL = [
  "Adebayo","Okafor","Nwosu","Balogun","Eze","Ogunleye","Abubakar","Olawale","Igbinedion","Chukwu",
  "Adesina","Ojo","Danjuma","Afolabi","Okonkwo","Salami","Umeh","Fashola","Ilori","Onyema",
  "Agboola","Babatunde","Chidubem","Durojaiye","Etim","Faleye","Gbadebo","Haruna","Ikechukwu","Jaiyeola",
  "Kolawole","Lawal","Makinde","Nwachukwu","Obasanjo","Popoola","Quadri","Raji","Sanni","Taiwo",
];
// pools are filtered below so a fake name can never reuse a real name token
let FIRST = FIRST_ALL.slice();
let LAST = LAST_ALL.slice();
const STREETS_ALL = [
  "Bode Thomas Street","Allen Avenue","Awolowo Road","Herbert Macaulay Way","Adeniyi Jones Avenue",
  "Opebi Road","Toyin Street","Mobolaji Bank Anthony Way","Adeola Odeku Street","Bourdillon Road",
];
const CITIES_ALL = ["Surulere, Lagos","Ikeja, Lagos","Victoria Island, Lagos","Lekki, Lagos","Yaba, Lagos","Ikoyi, Lagos","Apapa, Lagos","Festac, Lagos"];
const NG_BANKS_ALL = ["GTBank","Zenith Bank","Access Bank","UBA","First Bank","Providus Bank","Kuda","Sterling Bank"];
const NG_STATES_ALL = ["Lagos","Oyo","Delta","Ekiti","Ogun","Osun","Ondo","Anambra","Enugu","Rivers","Kano","Kaduna","Edo","Kwara"];
const COMPANIES_ALL = [
  "Greenfield Logistics Ltd","Sunrise Textiles","Harmony Foods Nigeria","Bluegate Engineering",
  "Primepath Consulting","Amberline Pharmaceuticals","Novatech Systems","Crestview Holdings",
  "Golden Gate Traders","Pacific Ridge Services","Silverline Manufacturing","Truepath Ventures",
];
const POSITIONS_ALL = [
  "Manager","Senior Officer","Director","Consultant","Analyst","Trader",
  "Engineer","Civil Servant","Accountant","Administrator","Executive","Coordinator",
];
// every template pool is filtered against real tokens in collectTokens()
let STREETS = STREETS_ALL.slice();
let CITIES = CITIES_ALL.slice();
let NG_BANKS = NG_BANKS_ALL.slice();
let NG_STATES = NG_STATES_ALL.slice();
let COMPANIES = COMPANIES_ALL.slice();
let POSITIONS = POSITIONS_ALL.slice();

const usedNames = new Set();
function fakeName() {
  let n;
  do { n = `${rnd(FIRST)} ${rnd(LAST)}`; } while (usedNames.has(n));
  usedNames.add(n);
  return n;
}
const fakePhone = () => `+234 80${crypto.randomInt(1, 9)} ${rndDigits(3)} ${rndDigits(4)}`;
const fakeAddress = () => `${crypto.randomInt(1, 200)} ${rnd(STREETS)}`;

// members.notes is structured "Key: Value; Key: Value" PII — rebuild each
// field with a fictitious value of the same shape (amounts scaled).
function fakeNotes(notes) {
  if (!notes) return notes;
  return String(notes)
    .split(";")
    .map((part) => {
      const i = part.indexOf(":");
      if (i < 0) return part;
      const key = part.slice(0, i).trim();
      const val = part.slice(i + 1).trim();
      const num = Number(val.replace(/,/g, ""));
      if (/savings|capital|balance|amount|deposit|contribution/i.test(key) && isFinite(num)) {
        return `${key}: ${Math.round(num * SCALE)}`;
      }
      if (/account|bvn|nin|phone/i.test(key)) return `${key}: ${rndDigits(10)}`;
      if (/state of origin/i.test(key)) return `${key}: ${rnd(NG_STATES)}`;
      if (/bank/i.test(key)) return `${key}: ${rnd(NG_BANKS)}`;
      if (/company|employer|business/i.test(key)) return `${key}: ${rnd(COMPANIES)}`;
      if (/position|role|occupation|job/i.test(key)) return `${key}: ${rnd(POSITIONS)}`;
      if (/title|employment|gender|marital/i.test(key)) return `${key}: ${val}`;
      if (/next of kin.*(name|address)|address/i.test(key)) return `${key}: ${fakeAddress()}, ${rnd(CITIES)}`;
      if (/name/i.test(key)) return `${key}: ${fakeName()}`;
      return `${key}: ${rnd(POSITIONS)}`;
    })
    .join("; ");
}

// ---------- 1. member id remap (shuffled, different range) ----------
const members = db.prepare("SELECT * FROM members ORDER BY id").all();
const idPool = members.map((_, i) => 1000 + i);
for (let i = idPool.length - 1; i > 0; i--) {
  const j = crypto.randomInt(i + 1);
  [idPool[i], idPool[j]] = [idPool[j], idPool[i]];
}
const idMap = new Map(members.map((m, i) => [m.id, idPool[i]]));

// ---------- 2. token dictionary: every real name-token -> one fake token ----------
// Narrations carry full-name variants ("SURNAME FIRSTNAME MIDDLENAME")
// that member-name replacement cannot catch, so scrub at word level.
const tokenMap = new Map();
const ORG_WORDS = new Map([
  ["twilight", "canary"],
  ["ttfc", "ctfc"],
  ["ttf", "ctf"],
]);
function nameTokens(s) {
  return String(s || "")
    .replace(/\\s\+/g, " ")
    .split(/[\s,|/()]+/)
    .map((t) => t.replace(/[^A-Za-z'-]/g, ""))
    .filter((t) => t.length >= 3 && !/^(the|and|ltd|ent|ventures|coop|cooperative|society|multi|multipurpose|funds|bank|account)$/i.test(t));
}
function collectTokens(srcDb) {
  const words = new Set();       // all real words -> pool filtering
  const identity = new Set();    // person-name words only -> scrub dictionary
  const add = (v, bucket = words) => nameTokens(v).forEach((w) => {
    words.add(w.toLowerCase());
    bucket.add(w.toLowerCase());
  });
  for (const r of srcDb.prepare("SELECT name FROM members").all()) add(r.name, identity);
  for (const r of srcDb.prepare(
    "SELECT first_name, middle_name, last_name, display_name, next_of_kin_first_name, next_of_kin_last_name, signature_name FROM member_profiles"
  ).all()) Object.values(r).forEach((v) => add(v, identity));
  for (const r of srcDb.prepare("SELECT bank_payment_names, alias_pattern, member_name FROM member_payment_aliases").all())
    Object.values(r).forEach((v) => add(v, identity));
  for (const r of srcDb.prepare("SELECT display_name FROM users").all()) add(r.display_name, identity);
  for (const r of srcDb.prepare("SELECT value FROM cooperative_settings").all()) add(r.value);
  for (const r of srcDb.prepare("SELECT notes FROM members WHERE notes IS NOT NULL").all()) add(r.notes);
  // exclude real tokens from every synthetic pool so nothing generated
  // can share a word with real data
  const clean = (all) => {
    const kept = all.filter((e) => !nameTokens(e).some((t) => words.has(t.toLowerCase())));
    return kept.length ? kept : all;
  };
  FIRST = clean(FIRST_ALL);
  LAST = clean(LAST_ALL);
  STREETS = clean(STREETS_ALL);
  CITIES = clean(CITIES_ALL);
  NG_BANKS = clean(NG_BANKS_ALL);
  NG_STATES = clean(NG_STATES_ALL);
  COMPANIES = clean(COMPANIES_ALL);
  POSITIONS = clean(POSITIONS_ALL);
  BANK_CODES.splice(0, BANK_CODES.length, ...clean(BANK_CODES));
  EXPENSE_ITEMS.splice(0, EXPENSE_ITEMS.length, ...clean(EXPENSE_ITEMS));
  MEETING_TITLES.splice(0, MEETING_TITLES.length, ...clean(MEETING_TITLES));
  MEETING_AGENDAS.splice(0, MEETING_AGENDAS.length, ...clean(MEETING_AGENDAS));
  LOAN_NOTES.splice(0, LOAN_NOTES.length, ...clean(LOAN_NOTES));
  // scrub dictionary covers identity words only - enum values like
  // "Africa/Lagos" or "annual" must not be name-swapped
  for (const w of identity) tokenMap.set(w, rnd([...FIRST, ...LAST]).toLowerCase());
}
// nameMap/nameByNewId are built AFTER collectTokens filters the name pools

// ---------- synthetic narration generators ----------
// Nothing in the output may contain real text: every description,
// note and free-text field is regenerated from these templates.
const BANK_CODES = ["GTB", "ZENITH", "ACCESS", "UBA", "FBN", "STERLING", "PROVIDUS", "KUDA"];
const EXPENSE_ITEMS = [
  "SMS ALERT CHARGE", "STAMP DUTY", "BANK TRANSFER CHARGE", "VAT ON CHARGES",
  "COMMISSION ON TURNOVER", "OFFICE SUPPLIES", "LEGAL DOCUMENTATION FEE",
  "PRINTING AND STATIONERY", "AUDIT FEE", "TRANSPORT AND LOGISTICS",
  "COT AND HANDLING", "ELECTRONIC LEVY", "CHEQUE BOOK CHARGE", "COURIER SERVICES",
];
const MEETING_TITLES = [
  "Monthly General Meeting", "Annual General Meeting", "Quarterly Review Meeting",
  "Emergency Executive Meeting", "Budget Planning Session", "Loan Committee Sitting",
];
const MEETING_AGENDAS = [
  "Opening Prayer; Minutes of Last Meeting; Financial Report; Loan Applications; AOB",
  "Attendance; Treasurer's Report; Membership Drive Update; Savings Review",
  "Opening Remarks; Account Reconciliation Status; New Member Induction; Closing",
  "Minutes Review; Investment Portfolio Update; Welfare Matters; Adjournment",
];
const LOAN_NOTES = [
  "Working capital request approved at general meeting",
  "Member business expansion loan",
  "Approved by loan committee after guarantor review",
  "Short term facility for equipment purchase",
];

function narrationFor(type, memberName) {
  const nm = (memberName || fakeName()).toUpperCase();
  const bank = rnd(BANK_CODES);
  switch (type) {
    case "deposit":
    case "share_capital":
      return rnd([
        `NIP CR/${bank}/${nm}/MONTHLY CONTRIBUTION`,
        `BY TRANSFER-NIP CR/${bank}/${nm}/CANARY COOP SAVINGS`,
        `INWARD TRANSFER FROM ${bank}/ ${nm}-Savings deposit`,
        `MOBILE TRF CR ${nm} ${bank}/MONTHLY SAVINGS`,
      ]);
    case "membership_fee":
      return rnd([
        `NIP CR/${bank}/${nm}/ENTRANCE FEE`,
        `INWARD TRANSFER FROM ${bank}/ ${nm}-Membership Fee`,
      ]);
    case "expense":
      return `Other: ${rnd(EXPENSE_ITEMS)} FROM ${bank} ACCOUNT`;
    case "investment":
      return rnd([
        `FIXED DEPOSIT PLACEMENT - ${bank}`,
        `TIME DEPOSIT ROLLOVER - ${bank}`,
        `TREASURY PLACEMENT - ${bank}`,
      ]);
    case "other_income":
      return rnd(["INTEREST CREDIT", "DIVIDEND INCOME", "BANK INTEREST RECEIVED", "MISCELLANEOUS INCOME"]);
    default:
      return `${rnd(["NIP CR", "NIP DR"])}/${bank}/${nm}/CANARY COOP TRANSACTION`;
  }
}

const fakeNameFor = new Map();
function nameOrFake(realName, memberId) {
  if (memberId != null && nameByNewId.has(memberId)) return nameByNewId.get(memberId);
  if (realName == null || realName === "") return fakeName();
  if (nameMap.has(realName)) return nameMap.get(realName);
  if (!fakeNameFor.has(realName)) fakeNameFor.set(realName, fakeName());
  return fakeNameFor.get(realName);
}

collectTokens(db);

const nameMap = new Map(members.map((m) => [m.name, fakeName()]));
const nameByNewId = new Map(members.map((m) => [idMap.get(m.id), nameMap.get(m.name)]));

const tokensByLen = [...tokenMap.keys()].sort((a, b) => b.length - a.length);
function applyCase(fake, realWord) {
  if (realWord === realWord.toUpperCase()) return fake.toUpperCase();
  if (realWord[0] === realWord[0].toUpperCase())
    return fake[0].toUpperCase() + fake.slice(1);
  return fake;
}
function scrub(text) {
  if (text == null) return text;
  let s = String(text);
  for (const [org, rep] of ORG_WORDS) {
    s = s.replace(new RegExp(`\\b${org}\\b`, "gi"), (m) =>
      m === m.toUpperCase() ? rep.toUpperCase() : rep
    );
  }
  for (const real of tokensByLen) {
    s = s.replace(new RegExp(`\\b${real.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"),
      (m) => applyCase(tokenMap.get(real), m));
  }
  s = s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "contact@canarycoop.ng");
  s = s.replace(/\d{5,}/g, (m) => rndDigits(m.length));
  return s;
}

// ---------- 3. apply everything in one transaction ----------
const tx = db.transaction(() => {
  // members: new id, fictitious name, new member number, scale fee
  const upMember = db.prepare(
    "UPDATE members SET id=?, name=?, member_number=?, membership_fee_paid=?, notes=? WHERE id=?"
  );
  members.forEach((m, i) => {
    upMember.run(
      idMap.get(m.id),
      nameMap.get(m.name),
      `CAN-${101 + i}`,
      scale(m.membership_fee_paid),
      fakeNotes(m.notes),
      m.id
    );
  });

  // FK references to members.id
  const fkCols = [
    ["member_profiles", "member_id"],
    ["member_payment_aliases", "member_id"],
    ["users", "member_id"],
    ["transactions", "member_id"],
    ["loans", "borrower_id"],
    ["loans", "guarantor1_id"],
    ["loans", "guarantor2_id"],
    ["coop_messages", "sender_member_id"],
    ["coop_message_participants", "member_id"],
    ["flexxforms_applications", "member_id"],
    ["member_email_delivery_log", "member_id"],
    ["deposit_credit_alert_log", "member_id"],
  ];
  for (const [table, col] of fkCols) {
    const stmt = db.prepare(`UPDATE ${table} SET ${col}=? WHERE ${col}=?`);
    for (const [oldId, newId] of idMap) stmt.run(newId, oldId);
  }

  // member_profiles: all PII
  const profiles = db.prepare("SELECT id, member_id FROM member_profiles").all();
  const upProfile = db.prepare(`UPDATE member_profiles SET
    photo_path=NULL, first_name=?, middle_name=NULL, last_name=?, display_name=?,
    gender=?, date_of_birth=?, email=?, phone=?, address_line1=?, address_line2=?,
    city=?, state=?, postal_code=?, country='Nigeria',
    next_of_kin_first_name=?, next_of_kin_last_name=?, next_of_kin_email=?,
    next_of_kin_phone=?, next_of_kin_relationship=?,
    signature_name=?, zelle_bank_name=?, notes=?,
    membership_status_document_path=NULL, membership_status_document_name=NULL,
    membership_status_document_mime=NULL
    WHERE id=?`);
  for (const p of profiles) {
    const full = nameByNewId.get(p.member_id) || fakeName();
    const [fn, ln] = full.split(" ");
    const email = `${fn}.${ln}${crypto.randomInt(100)}@canarycoop.ng`.toLowerCase();
    const nokFn = rnd(FIRST), nokLn = rnd(LAST);
    upProfile.run(
      fn, ln, full,
      rnd(["Male", "Female"]),
      `19${crypto.randomInt(60, 99)}-${String(crypto.randomInt(1, 13)).padStart(2, "0")}-${String(crypto.randomInt(1, 29)).padStart(2, "0")}`,
      email, fakePhone(), fakeAddress(), "", rnd(CITIES), "Lagos",
      rndDigits(6),
      nokFn, nokLn, `${nokFn}.${nokLn}@canarycoop.ng`.toLowerCase(), fakePhone(),
      rnd(["Spouse", "Sibling", "Parent", "Child"]),
      full, rnd(NG_BANKS), null,
      p.id
    );
  }

  // payment aliases: member name -> new name; bank payment name -> a
  // different-first-name variant like real data ("FIRSTNAME SURNAME");
  // alias_pattern rebuilt as \s+ regex alternation. Rows with NULL
  // member_id are matched by member_name instead.
  const aliasNameMap = new Map();
  for (const a of db.prepare("SELECT id, member_id, member_name FROM member_payment_aliases").all()) {
    let newName = a.member_id != null ? nameByNewId.get(a.member_id) : null;
    if (!newName) {
      if (!aliasNameMap.has(a.member_name)) {
        aliasNameMap.set(a.member_name, nameMap.get(a.member_name) || fakeName());
      }
      newName = aliasNameMap.get(a.member_name);
    }
    const last = newName.split(" ").pop().toUpperCase();
    const variants = [`${rnd(FIRST).toUpperCase()} ${last}`];
    if (crypto.randomInt(3) === 0) variants.push(`${rnd(FIRST).toUpperCase()} ${last}`);
    const pattern = variants.map((v) => v.replace(/\s+/g, "\\\\s+")).join("|");
    db.prepare("UPDATE member_payment_aliases SET member_name=?, bank_payment_names=?, alias_pattern=? WHERE id=?")
      .run(newName, variants.join(", "), pattern, a.id);
  }

  // money columns
  const money = [
    ["transactions", ["amount"]],
    ["loans", ["principal", "late_fee_amount"]],
    ["loan_installments", ["principal_due", "interest_due", "total_due", "paid_amount"]],
    ["expenses", ["amount"]],
    ["checking_balance_updates", ["balance"]],
    ["cd_balance_updates", ["balance"]],
    ["ledger_adjustments", ["original_amount"]],
    ["ledger_adjustment_lines", ["amount"]],
  ];
  for (const [t, cols] of money) {
    for (const c of cols) db.prepare(`UPDATE ${t} SET ${c}=ROUND(${c}*${SCALE},2)`).run();
  }

  // transactions: fully synthetic narrations + references. Real bank text
  // contains non-member names, vendor names and raw account digits that
  // token replacement cannot catch, so nothing original is kept.
  const txnStmt = db.prepare("UPDATE transactions SET description=?, reference=? WHERE id=?");
  for (const t of db.prepare("SELECT id, type, member_id, amount, transaction_date FROM transactions").all()) {
    const desc = narrationFor(t.type, nameOrFake(null, t.member_id));
    txnStmt.run(desc, `ref:${t.transaction_date}:${Math.round(scale(t.amount))}`, t.id);
  }

  // bank imports: drop real filenames (they carried org acronyms/account refs)
  for (const b of db.prepare("SELECT id FROM bank_imports").all()) {
    db.prepare("UPDATE bank_imports SET filename=?, notes=NULL WHERE id=?")
      .run(`canary-ledger-import-${b.id}.csv`, b.id);
  }

  // expenses: synthetic item text + generic category
  const EXP_CATEGORIES = ["Bank Charges", "Office", "Legal", "Operations", "Audit", "Logistics"];
  for (const e of db.prepare("SELECT id FROM expenses").all()) {
    db.prepare("UPDATE expenses SET description=?, category=? WHERE id=?")
      .run(rnd(EXPENSE_ITEMS), rnd(EXP_CATEGORIES), e.id);
  }

  // loans: generic notes (real notes may name non-member guarantors)
  for (const l of db.prepare("SELECT id FROM loans").all()) {
    db.prepare("UPDATE loans SET notes=? WHERE id=?").run(rnd(LOAN_NOTES), l.id);
  }

  // meetings: synthetic titles/agendas, drop real venues/links/notes
  let mtg = 0;
  for (const m of db.prepare("SELECT id FROM cooperative_meetings").all()) {
    db.prepare("UPDATE cooperative_meetings SET title=?, location=?, agenda=?, admin_notes=NULL, virtual_link=NULL WHERE id=?")
      .run(rnd(MEETING_TITLES), crypto.randomInt(2) ? "Lagos" : "Virtual - Zoom", rnd(MEETING_AGENDAS), m.id);
    mtg++;
  }

  // investment accounts: synthetic names, generic institutions, no notes
  for (const a of db.prepare("SELECT id FROM investment_accounts").all()) {
    db.prepare("UPDATE investment_accounts SET name=?, institution_name=?, notes='' WHERE id=?")
      .run(`${rnd(["Fixed Deposit", "Treasury Bill", "Money Market"])} - ${rnd(NG_BANKS)} ${a.id}`, rnd(NG_BANKS), a.id);
  }

  // ledger adjustments: generic wording; member_name -> consistent fake name.
  // ledger_key embeds the original narration + amount - rebuild it too.
  const ADJ_DESCS = ["Balance correction", "Import reconciliation adjustment", "Period-end reconciliation", "Posting correction"];
  for (const a of db.prepare("SELECT id, transaction_date, original_amount FROM ledger_adjustments").all()) {
    db.prepare("UPDATE ledger_adjustments SET description=?, notes=?, ledger_key=? WHERE id=?")
      .run(rnd(ADJ_DESCS), "System adjustment",
        `${a.transaction_date}|${Math.round(scale(a.original_amount))}|canary adjustment`, a.id);
  }
  for (const l of db.prepare("SELECT id, member_name FROM ledger_adjustment_lines").all()) {
    db.prepare("UPDATE ledger_adjustment_lines SET member_name=?, description_note=? WHERE id=?")
      .run(l.member_name == null ? null : nameOrFake(l.member_name, null), "Adjustment entry", l.id);
  }

  // balance-update notes + expense labels: generic wording
  db.prepare("UPDATE checking_balance_updates SET note='Import reconciliation' WHERE note IS NOT NULL").run();
  db.prepare("UPDATE cd_balance_updates SET note='Import reconciliation' WHERE note IS NOT NULL").run();
  {
    let i = 0;
    for (const r of db.prepare("SELECT id FROM expense_report_labels").all()) {
      db.prepare("UPDATE expense_report_labels SET label=? WHERE id=?")
        .run(`${EXPENSE_ITEMS[i++ % EXPENSE_ITEMS.length]} ${i}`, r.id);
    }
  }

  // bank accounts: new account numbers, synthetic institution + labels
  for (const b of db.prepare("SELECT id FROM bank_accounts").all()) {
    const bank = rnd(NG_BANKS);
    db.prepare("UPDATE bank_accounts SET account_number=?, institution_name=?, account_label=? WHERE id=?")
      .run(rndDigits(10), bank, `${bank} - ${rnd(["Current", "Savings", "Operations"])} Account`, b.id);
  }

  // settings: org identity + scale monetary keys + scrub name in JSON logs
  const moneyKeys = ["membership_fee_amount", "annual_dues_amount", "initial_contribution_amount"];
  for (const k of moneyKeys) {
    const r = db.prepare("SELECT value FROM cooperative_settings WHERE key=?").get(k);
    if (r && !isNaN(Number(r.value))) {
      db.prepare("UPDATE cooperative_settings SET value=? WHERE key=?").run(String(scale(Number(r.value))), k);
    }
  }

  // reconcile anchors: the live balance at an anchor date is the cumulative
  // sum of scaled ledger rows; scaling the stored value itself drifts by
  // per-row rounding (Out of Sync). Recompute every anchor from the scaled
  // ledger the same way getLedgerEndingBalance does.
  const RECONCILE_LEDGER_TYPES = ["deposit", "withdrawal", "distribution",
    "loan_disbursement", "loan_repayment", "expense", "cd_purchase",
    "cd_liquidation", "investment", "other_income", "share_capital",
    "share_capital_redemption"];
  const primaryAcctId =
    db.prepare("SELECT id FROM bank_accounts WHERE is_primary=1").get()?.id ?? null;
  const getSetting = db.prepare("SELECT value FROM cooperative_settings WHERE key=?");
  const balAtAnchor = db.prepare(
    `SELECT ROUND(COALESCE(SUM(amount),0),2) AS bal FROM transactions
     WHERE source IN ('bank_import','manual')
       AND type IN (${RECONCILE_LEDGER_TYPES.map(() => "?").join(",")})
       AND transaction_date <= ?
       AND (bank_account_id = ? OR (bank_account_id IS NULL AND ? = 1))`
  );
  const recomputedAnchorKeys = new Set();
  const setAnchor = db.prepare("UPDATE cooperative_settings SET value=? WHERE key=?");
  for (const { key } of db
    .prepare("SELECT key FROM cooperative_settings WHERE key LIKE 'bank_reconcile_balance%'")
    .all()) {
    const m = /^bank_reconcile_balance_acct_(\d+)$/.exec(key);
    const acctId = m ? Number(m[1]) : primaryAcctId;
    if (acctId == null) continue;
    const asOf = getSetting.get(
      m ? `bank_reconcile_as_of_acct_${m[1]}` : "bank_reconcile_as_of"
    )?.value;
    if (!asOf) continue;
    const isPrimary = primaryAcctId == null || acctId === primaryAcctId ? 1 : 0;
    const { bal } = balAtAnchor.get(...RECONCILE_LEDGER_TYPES, asOf, acctId, isPrimary);
    setAnchor.run(String(bal), key);
    recomputedAnchorKeys.add(key);
  }
  for (const k of ["annual_dues_schedule", "annual_dues_change_log"]) {
    const r = db.prepare("SELECT value FROM cooperative_settings WHERE key=?").get(k);
    if (!r) continue;
    let v = scrub(r.value);
    v = v.replace(/"amount":\s*(\d+(?:\.\d+)?)/g, (_, n) => `"amount":${scale(Number(n))}`);
    v = v.replace(/"(?:setBy|by|from|to)":\s*"[^"]*"/g, (m) =>
      m.replace(/"[^"]*"$/, '"Demo Admin"'));
    db.prepare("UPDATE cooperative_settings SET value=? WHERE key=?").run(v, k);
  }
  for (const k of ["cooperative_name", "org_name", "organization_name"]) {
    const r = db.prepare("SELECT value FROM cooperative_settings WHERE key=?").get(k);
    if (r) db.prepare("UPDATE cooperative_settings SET value=? WHERE key=?").run(ORG_NAME, k);
  }
  // scrub every remaining settings value (emails, names, phones in JSON/text)
  const handledKeys = new Set([...moneyKeys, ...recomputedAnchorKeys,
    "annual_dues_schedule", "annual_dues_change_log",
    "cooperative_name", "org_name", "organization_name"]);
  const upSetting = db.prepare("UPDATE cooperative_settings SET value=? WHERE key=?");
  for (const r of db.prepare("SELECT key, value FROM cooperative_settings").all()) {
    if (!handledKeys.has(r.key)) upSetting.run(scrub(r.value), r.key);
  }

  // wipe PII-bearing and external-reference tables/fields
  db.prepare("DELETE FROM member_email_delivery_log").run();
  db.prepare("DELETE FROM member_report_email_log").run();
  db.prepare("DELETE FROM deposit_credit_alert_log").run();
  db.prepare("DELETE FROM coop_messages").run();
  db.prepare("DELETE FROM coop_message_participants").run();
  db.prepare("DELETE FROM coop_message_threads").run();
  db.prepare("DELETE FROM coop_message_attachments").run();
  db.prepare("DELETE FROM sessions").run();
  db.prepare("DELETE FROM flexxforms_applications").run();
  db.prepare("DELETE FROM cooperative_status_reports").run();
  db.prepare("UPDATE loans SET guarantor_document_id=NULL, guarantor_sign_url=NULL, guarantor_embed_url=NULL, guarantor_doc_status=NULL, borrower_document_id=NULL, borrower_sign_url=NULL, borrower_embed_url=NULL, borrower_doc_status=NULL").run();

  // users: demo admin + one member portal login
  db.prepare("DELETE FROM users").run();
  const adminPass = "CanaryDemo2026!";
  db.prepare(
    `INSERT INTO users (email, username, password_hash, role, display_name, must_change_password, active)
     VALUES (?, NULL, ?, 'admin', 'Demo Admin', 0, 1)`
  ).run("admin@canarycoop.ng", hashPassword(adminPass));
  const firstMemberId = idPool[0];
  const memberPass = "CanaryMember2026!";
  db.prepare(
    `INSERT INTO users (email, username, password_hash, role, member_id, display_name, must_change_password, active)
     VALUES (?, 'demo.member', ?, 'member', ?, ?, 0, 1)`
  ).run("member@canarycoop.ng", hashPassword(memberPass), firstMemberId,
    nameByNewId.get(firstMemberId));

  console.log(JSON.stringify({
    members: members.length,
    scale: SCALE,
    adminLogin: "admin@canarycoop.ng",
    adminPassword: adminPass,
    memberLogin: "demo.member / member@canarycoop.ng",
    memberPassword: memberPass,
  }, null, 2));
});
tx();
db.prepare("VACUUM").run();
console.log("Wrote", OUT);
