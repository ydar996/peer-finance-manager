const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const XLSX = require("xlsx");
const { parseCooperativeDate } = require("./cooperative-date-format");
const {
  resolveLedgerMemberName,
  resolveMemberFromBankDescription,
} = require("./member-name-match");
const { resolveMemberFromPaymentAliases } = require("./member-payment-alias-service");

/**
 * Providus Bank business statement support (Nigerian Cooperatives).
 * Both export formats carry the same table:
 *   Post Date | Actual Transaction Date | Narration | Value Date |
 *   Debit | Credit | Current Balance | DR/CR | DOC-NUM
 * XLSX is read cell-wise; PDF is read by text extraction (Tm/Tj ops).
 */

function parseMoney(value) {
  if (value == null || value === "") return 0;
  const n = Number(String(value).replace(/[,₦$\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function normHeader(v) {
  return String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isProvidusWorkbook(filePath) {
  try {
    const wb = XLSX.readFile(filePath);
    for (const sheetName of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
        header: 1,
        defval: "",
      });
      let bankMarker = false;
      let header = false;
      for (const row of rows.slice(0, 25)) {
        const cells = (row || []).map(normHeader);
        if (cells.some((c) => c.includes("providus"))) bankMarker = true;
        if (cells.includes("post date") && cells.includes("narration")) {
          header = true;
        }
      }
      if (bankMarker && header) return true;
    }
    return false;
  } catch (_) {
    return false;
  }
}

/* ------------------------- narration classification ---------------------- */

const EXPENSE_RE =
  /STAMP DUTY|SMS ALERT|ACCOUNT MAINTENANCE|VALUE ADDED TAX|\bVAT\b|COMMISSION|\bCOT\b|\bWHT\b|WITHHOLDING|LEGAL SEARCH|\bMISC\.|MAINTENANCE FEE|CHARGE/i;
const REVERSAL_RE = /REVERSAL OF ENTRY|REVERSAL OF TRANSACTION|REVERSAL:/i;
// Stems are kept short: PDF narrations are truncated at the column edge.
const TD_PLACE_RE = /ADD A TIME DEP|TIME DEPOSIT BY PRODUCT/i;
const TD_SETTLE_RE = /PREMATURE SETTLE|SETTLE OF TIME DEP|TIME DEP.*SETTLE/i;
const OWN_ACCT_RE = /OWN ACCOUNT|LIQUIDATION/i;
const LOAN_RE = /LOAN REPAY|LOAN PAY|LOAN DISBURS/i;
const OUTWARD_RE = /OUTWARD TRANSF/i;
const BETWEEN_RE = /TRANSFER BETWEEN/i;
const INWARD_RE =
  /INWARD TRANSF|ACCOUNT TRANSF|CASH DEPOSIT|LODGEMENT|POS DEPOSIT|WEB PAYMENT|TRANSFER FROM/i;

function classifyProvidusNarration(narration, amount) {
  const d = String(narration || "").toUpperCase();
  if (!d.trim()) return null;
  if (EXPENSE_RE.test(d)) return "expense";
  if (REVERSAL_RE.test(d)) return "expense";
  if (TD_PLACE_RE.test(d) || TD_SETTLE_RE.test(d) || OWN_ACCT_RE.test(d)) {
    return "investment";
  }
  if (LOAN_RE.test(d)) {
    return amount >= 0 ? "loan_repayment" : "loan_disbursement";
  }
  if (/SHARE CAP/.test(d) && amount > 0) return "share_capital";
  if (OUTWARD_RE.test(d) || BETWEEN_RE.test(d)) {
    return amount > 0 ? "deposit" : "expense";
  }
  if (INWARD_RE.test(d)) return "deposit";
  if (amount > 0) return "deposit";
  return null;
}

/* ----------------------------- member match ------------------------------ */

function extractSenderName(narration) {
  const text = String(narration || "");
  let m =
    text.match(/FROM\s+[A-Z& .]+\/\s*([A-Z .'-]{3,}?)\s*[-\/_|]/i) ||
    text.match(/Trf\s+from\s+([A-Z ]+?)\s+\d{2}\*+/i) ||
    text.match(/TO\s+([A-Z ]{4,}?)\s*\|/i);
  if (!m) return null;
  const name = m[1].replace(/\s{2,}/g, " ").trim();
  return name.length >= 4 ? name : null;
}

function resolveProvidusMember(narration, memberNames) {
  const sender = extractSenderName(narration);
  if (sender) {
    const hit = resolveLedgerMemberName(sender, memberNames);
    if (hit) return hit;
    if (memberNames.includes(sender)) return sender;
  }
  return (
    resolveMemberFromBankDescription(narration, memberNames) ||
    resolveMemberFromPaymentAliases(narration, memberNames) ||
    null
  );
}

const MEMBER_TYPES = new Set([
  "deposit",
  "withdrawal",
  "loan_repayment",
  "loan_disbursement",
  "distribution",
  "share_capital",
  "share_capital_redemption",
]);

function buildRow({ dateIso, description, amount, reference }, memberNames) {
  const ledgerType = classifyProvidusNarration(description, amount);
  const member =
    ledgerType && MEMBER_TYPES.has(ledgerType)
      ? resolveProvidusMember(description, memberNames)
      : null;
  return {
    date: dateIso,
    description,
    amount,
    reference: reference || "",
    member,
    ledgerType,
    typeSource: "inferred",
    format: "statement",
  };
}

/* ------------------------------- XLSX path ------------------------------- */

function parseProvidusWorkbook(filePath, memberNames = []) {
  const wb = XLSX.readFile(filePath);
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: "",
    });
    let headerIndex = -1;
    let cols = [];
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const cells = (rows[i] || []).map(normHeader);
      if (cells.includes("post date") && cells.includes("narration")) {
        headerIndex = i;
        cols = cells;
        break;
      }
    }
    if (headerIndex < 0) continue;
    const idx = (name) => cols.indexOf(name);
    const cPost = idx("post date");
    const cNarr = idx("narration");
    const cDebit = idx("debit");
    const cCredit = idx("credit");
    const cDoc = idx("doc-num");

    const out = [];
    const summary = { beginning: null, ending: null, credits: null, debits: null };
    for (let i = 0; i < rows.length; i++) {
      const cells = (rows[i] || []).map((c) => String(c || "").trim());
      if (/period opening balance/i.test(cells[0] || "")) {
        summary.beginning = parseMoney(cells[1] || cells[2]);
      }
      if (/period closing balance/i.test(cells[0] || "")) {
        summary.ending = parseMoney(cells[1] || cells[2]);
      }
      if (/total debit amount/i.test(cells[1] || "")) {
        summary.debits = parseMoney(cells[2]);
        summary.credits = parseMoney(cells[4]);
      }
      if (i <= headerIndex) continue;
      const postDate = parseCooperativeDate(cells[cPost]);
      if (!postDate) continue;
      const description = String(cells[cNarr] || "").trim();
      const debit = parseMoney(cells[cDebit]);
      const credit = parseMoney(cells[cCredit]);
      if (!debit && !credit) continue;
      const amount = credit > 0 ? credit : -Math.abs(debit);
      out.push(
        buildRow(
          {
            dateIso: postDate.iso,
            description,
            amount,
            reference: cDoc >= 0 ? cells[cDoc] : "",
          },
          memberNames
        )
      );
    }
    if (out.length) return { rows: out, summary };
  }
  return { rows: [], summary: null };
}

/* -------------------------------- PDF path ------------------------------- */

function inflatePdfStreams(buf) {
  const raw = buf.toString("latin1");
  const streams = [];
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(raw))) {
    const end = raw.indexOf("endstream", m.index);
    if (end < 0) continue;
    try {
      streams.push(zlib.inflateSync(buf.slice(m.index + m[0].length, end)).toString("latin1"));
    } catch (_) {}
  }
  return streams;
}

function readPdfString(src, start) {
  // src[start] === '(' — reads until an unescaped ')' and returns {text, next}
  let out = "";
  let i = start + 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") {
      const nx = src[i + 1];
      if (nx === "n") out += "\n";
      else if (nx === "t") out += "\t";
      else if (nx === "r") out += "\r";
      else if (nx != null) out += nx;
      i += 2;
      continue;
    }
    if (ch === ")") return { text: out, next: i + 1 };
    out += ch;
    i++;
  }
  return { text: out, next: i };
}

function extractPdfTokens(buf) {
  // Tokens: {stream, x, y, text} from every `Tm` + `Tj` text-show pair.
  // Continuation lines of a wrapped cell repeat Tm without Tf, so each
  // Tj is attributed to the most recent Tm position.
  const tokens = [];
  const streams = inflatePdfStreams(buf);
  const opRe =
    /(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+Tm|\(/g;
  streams.forEach((content, stream) => {
    let curX = 0;
    let curY = 0;
    let m;
    while ((m = opRe.exec(content))) {
      if (m[0] === "(") {
        const { text, next } = readPdfString(content, m.index);
        opRe.lastIndex = next;
        if (/^\s*Tj/.test(content.slice(next, next + 8)) && text.trim()) {
          tokens.push({ stream, x: curX, y: curY, text });
        }
        continue;
      }
      curX = +m[5];
      curY = +m[6];
    }
  });
  return tokens;
}

function groupTokensToLines(tokens) {
  const byKey = new Map();
  for (const t of tokens) {
    const key = `${t.stream}|${Math.round(t.y)}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(t);
  }
  return [...byKey.entries()].map(([key, cells]) => ({
    key,
    cells: cells.sort((a, b) => a.x - b.x),
  }));
}

const DEFAULT_COLS = { post: 70, narr: 161, value: 256, debit: 302, credit: 372, balance: 442 };

function findColumnAnchors(lines) {
  for (const line of lines) {
    const texts = line.cells.map((c) => normHeader(c.text));
    const dIdx = texts.findIndex((t) => t.startsWith("debit"));
    const cIdx = texts.findIndex((t) => t.startsWith("credit"));
    const bIdx = texts.findIndex((t) => t.startsWith("current balance"));
    if (dIdx >= 0 && cIdx >= 0) {
      const vIdx = texts.findIndex((t) => t.startsWith("value date"));
      return {
        debit: line.cells[dIdx].x,
        credit: line.cells[cIdx].x,
        balance: bIdx >= 0 ? line.cells[bIdx].x : line.cells[cIdx].x + 70,
        value: vIdx >= 0 ? line.cells[vIdx].x : DEFAULT_COLS.value,
      };
    }
  }
  return {
    debit: DEFAULT_COLS.debit,
    credit: DEFAULT_COLS.credit,
    balance: DEFAULT_COLS.balance,
    value: DEFAULT_COLS.value,
  };
}

function assignColumn(x, anchors) {
  if (x >= anchors.balance - 5) return "balance";
  if (x >= anchors.credit - 5) return "credit";
  if (x >= anchors.debit - 40) return "debit"; // right-aligned numbers shift left
  return null;
}

function parseProvidusPdfLines(tokens, memberNames) {
  const lines = groupTokensToLines(tokens)
    .sort((a, b) => {
      const [sa, ya] = a.key.split("|").map(Number);
      const [sb, yb] = b.key.split("|").map(Number);
      return sa - sb || yb - ya;
    });
  const anchors = findColumnAnchors(lines);
  const narrStart = DEFAULT_COLS.narr - 20; // past the actual-date column (~115)
  const narrEnd = anchors.value - 5; // stop before the value-date column (~256)

  // Row anchors: the Post Date cell (x~70) holds dd/mm/yyyy at each row's
  // top line. Narration wraps into continuation lines below it (same x
  // band, lower y), so a row owns every line between its anchor and the
  // next anchor.
  const anchors2 = lines
    .map((line) => {
      const post = line.cells.find(
        (c) => Math.abs(c.x - DEFAULT_COLS.post) < 15 && /^\d{2}\/\d{2}\/\d{4}$/.test(c.text.trim())
      );
      return post ? { key: line.key, y: +line.key.split("|")[1], line, post } : null;
    })
    .filter(Boolean);

  const out = [];
  let summary = null;
  for (let i = 0; i < anchors2.length; i++) {
    const row = anchors2[i];
    const nextAnchor = anchors2[i + 1];
    const samePage = nextAnchor && nextAnchor.key.split("|")[0] === row.key.split("|")[0];
    const nextY = samePage ? nextAnchor.y : -Infinity;
    const [stream] = row.key.split("|").map(Number);
    let debit = 0;
    let credit = 0;
    let balance = null;
    const narrParts = [];
    for (const line of lines) {
      const [s, y] = line.key.split("|").map(Number);
      if (s !== stream || y > row.y || y <= nextY) continue;
      for (const cell of line.cells) {
        const col = assignColumn(cell.x, anchors);
        if (cell.x >= narrStart && cell.x < narrEnd && col == null) {
          narrParts.push({ y, x: cell.x, text: cell.text });
          continue;
        }
        if (y !== row.y) continue; // amounts sit on the row's top line only
        const n = parseMoney(cell.text);
        if (col === "debit" && n) debit = n;
        else if (col === "credit" && n) credit = n;
        else if (col === "balance") balance = n;
      }
    }
    if (!debit && !credit) continue;
    const postDate = parseCooperativeDate(row.post.text.trim());
    if (!postDate) continue;
    const description = narrParts
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .map((p) => p.text)
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();
    const amount = credit > 0 ? credit : -Math.abs(debit);
    out.push(
      buildRow(
        { dateIso: postDate.iso, description, amount },
        memberNames
      )
    );
    summary = { ending: balance };
  }
  return { rows: out, summary };
}

function isProvidusPdf(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.slice(0, 5).toString("latin1") !== "%PDF-") return false;
    return inflatePdfStreams(buf).some((s) => s.includes("PROVIDUS"));
  } catch (_) {
    return false;
  }
}

function parseProvidusPdf(filePath, memberNames = []) {
  const buf = fs.readFileSync(filePath);
  const tokens = extractPdfTokens(buf);
  return parseProvidusPdfLines(tokens, memberNames);
}

module.exports = {
  isProvidusWorkbook,
  isProvidusPdf,
  parseProvidusWorkbook,
  parseProvidusPdf,
  classifyProvidusNarration,
  extractPdfTokens,
};
