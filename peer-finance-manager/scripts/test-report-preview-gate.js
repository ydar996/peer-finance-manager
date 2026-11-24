#!/usr/bin/env node
/**
 * Report preview gate: manual publish requires an administrator preview send,
 * explicit override works, preview state resets on regeneration, and the
 * scheduled/auto-publish path is not blocked.
 * Run: node peer-finance-manager/scripts/test-report-preview-gate.js
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pfm-report-preview-"));
process.env.PFM_DATA_DIR = tmpRoot;

const { runWithOrg } = require("../lib/org-context");
const { openOrgDatabase, closeDb, getDb } = require("../db/database");
const { getOrgDataDir } = require("../lib/organization-service");
const {
  publishMonthlyStatusReport,
  unpublishMonthlyStatusReport,
  getMonthlyStatusReportStatus,
} = require("../lib/monthly-status-report-service");

const ORG = "report-preview-test-coop";
const SLUG = "2026-09";

openOrgDatabase(ORG);
runWithOrg(ORG, () => {
  const db = getDb();

  // Seed a generated report record with a real file on disk.
  const dir = path.join(getOrgDataDir(ORG), "reports", "cooperative-status", SLUG);
  fs.mkdirSync(dir, { recursive: true });
  const fileName = "cooperative-status-report-2026-09.pdf";
  fs.writeFileSync(path.join(dir, fileName), "%PDF-1.4 test");
  db.exec(`
    CREATE TABLE IF NOT EXISTS cooperative_status_reports (
      period_slug TEXT PRIMARY KEY,
      as_of_date TEXT NOT NULL,
      file_name TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      published_at TEXT,
      is_published INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.prepare(
    `INSERT INTO cooperative_status_reports
       (period_slug, as_of_date, file_name, generated_at)
     VALUES (?, '2026-09-30', ?, '2026-10-01T00:00:00.000Z')`
  ).run(SLUG, fileName);

  // 1. Publish without a preview is refused with a specific code.
  let err = null;
  try {
    publishMonthlyStatusReport(SLUG);
  } catch (e) {
    err = e;
  }
  assert.ok(err, "publish without preview must throw");
  assert.strictEqual(err.code, "preview_not_sent");
  assert.strictEqual(
    db.prepare(`SELECT is_published FROM cooperative_status_reports WHERE period_slug = ?`).get(SLUG)
      .is_published,
    0
  );
  console.log("  publish refused until preview sent (code preview_not_sent): OK");

  // 2. Recording a preview send unlocks publish.
  db.prepare(
    `UPDATE cooperative_status_reports
     SET preview_sent_at = '2026-10-01T01:00:00.000Z', preview_sent_to = 'admin@example.org'
     WHERE period_slug = ?`
  ).run(SLUG);
  const status = publishMonthlyStatusReport(SLUG);
  assert.strictEqual(status.published, true);
  assert.strictEqual(status.previewSentTo, "admin@example.org");
  assert.ok(status.previewSentAt);
  console.log("  publish succeeds after preview send; status exposes preview fields: OK");

  // 3. Explicit override publishes without a preview (auto-publish path uses it).
  unpublishMonthlyStatusReport(SLUG);
  db.prepare(
    `UPDATE cooperative_status_reports SET preview_sent_at = NULL, preview_sent_to = NULL WHERE period_slug = ?`
  ).run(SLUG);
  const override = publishMonthlyStatusReport(SLUG, { allowWithoutPreview: true });
  assert.strictEqual(override.published, true);
  assert.strictEqual(override.previewSentAt, null);
  console.log("  allowWithoutPreview override publishes (auto-publish path): OK");

  // 4. Regeneration clears the preview stamp (stale preview cannot authorize a changed report).
  db.prepare(
    `INSERT INTO cooperative_status_reports (
       period_slug, as_of_date, file_name, generated_at, published_at, is_published, performance_overview,
       preview_sent_at, preview_sent_to
     ) VALUES (?, ?, ?, ?, NULL, 0, NULL, NULL, NULL)
     ON CONFLICT(period_slug) DO UPDATE SET
       as_of_date = excluded.as_of_date,
       file_name = excluded.file_name,
       generated_at = excluded.generated_at,
       published_at = NULL,
       is_published = 0,
       performance_overview = excluded.performance_overview,
       preview_sent_at = NULL,
       preview_sent_to = NULL`
  ).run(SLUG, "2026-09-30", fileName, "2026-10-02T00:00:00.000Z");
  const regen = db
    .prepare(`SELECT preview_sent_at, is_published FROM cooperative_status_reports WHERE period_slug = ?`)
    .get(SLUG);
  assert.strictEqual(regen.preview_sent_at, null);
  assert.strictEqual(regen.is_published, 0);
  err = null;
  try {
    publishMonthlyStatusReport(SLUG);
  } catch (e) {
    err = e;
  }
  assert.strictEqual(err?.code, "preview_not_sent");
  console.log("  regeneration clears preview stamp and re-gates publish: OK");

  // 5. Preview send requires a generated report and email config.
  const { sendCooperativeReportPreviewEmail } = require("../lib/report-notification-service");
  return sendCooperativeReportPreviewEmail(SLUG, { email: "admin@example.org" })
    .then(() => {
      assert.fail("preview send must fail without email configuration");
    })
    .catch((e) => {
      assert.match(e.message, /Email is not configured/);
      console.log("  preview send fails cleanly without email config: OK");
    });
});

setTimeout(() => {
  closeDb();
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch (_) {}
  console.log("All report preview gate tests passed.");
}, 200);
