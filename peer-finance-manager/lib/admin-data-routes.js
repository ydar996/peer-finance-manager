const fs = require("fs");
const {
  prepareDatabaseBackup,
  restoreDatabaseFromUpload,
  readDatabaseStats,
} = require("./admin-data-service");
const { normalizeAllProfiles } = require("./profile-normalize-service");
const { getDb } = require("../db/database");
const { getBankReconcileStatus } = require("./bank-reconcile-service");

function registerAdminDataRoutes(app, { requireAdmin, restoreOrgContext, upload }) {
  app.get("/api/admin/data-backup", requireAdmin, (req, res) => {
    try {
      const slug = req.user.organizationSlug;
      const { dbPath, filename } = prepareDatabaseBackup(slug);
      res.download(dbPath, filename, (err) => {
        if (err && !res.headersSent) {
          res.status(500).json({ error: err.message });
        }
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/admin/data-backup/encrypted", requireAdmin, (req, res) => {
    try {
      const passphrase = String(req.body?.passphrase || "");
      if (passphrase.length < 8) {
        return res.status(400).json({ error: "Encryption passphrase must be at least 8 characters." });
      }
      const slug = req.user.organizationSlug;
      const { dbPath, filename } = prepareDatabaseBackup(slug);
      const { encryptBackup } = require("./backup-crypto");
      const encrypted = encryptBackup(fs.readFileSync(dbPath), passphrase);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.enc"`);
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Length", String(encrypted.length));
      res.end(encrypted);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/admin/data-status", requireAdmin, (req, res) => {
    try {
      const slug = req.user.organizationSlug;
      const { getOrgDatabasePath } = require("./admin-data-service");
      const dbPath = getOrgDatabasePath(slug);
      const stats = readDatabaseStats(dbPath);
      let bankReconcile = null;
      try {
        bankReconcile = getBankReconcileStatus();
      } catch (_) {}
      res.json({ stats, bankReconcile });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(
    "/api/admin/data-restore",
    requireAdmin,
    upload.single("database"),
    restoreOrgContext,
    (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "Upload a peerfinance.db backup file." });
        }
        const confirm =
          req.body?.confirm === "true" ||
          req.body?.confirm === true ||
          req.body?.confirmRestore === "true";
        if (!confirm) {
          return res.status(400).json({
            error:
              "Restore is destructive. Set confirmRestore to true after reviewing the upload preview.",
          });
        }

        const slug = req.user.organizationSlug;
        const result = restoreDatabaseFromUpload(slug, req.file.path, {
          passphrase: req.body?.passphrase,
        });

        try {
          fs.unlinkSync(req.file.path);
        } catch (_) {}

        let bankReconcile = null;
        try {
          getDb(slug);
          bankReconcile = getBankReconcileStatus();
        } catch (_) {}

        res.json({
          success: true,
          message: "Database restored. Cooperative Books will reflect the uploaded file.",
          ...result,
          bankReconcile,
        });
      } catch (err) {
        if (req.file?.path) {
          try {
            fs.unlinkSync(req.file.path);
          } catch (_) {}
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.post(
    "/api/admin/data-restore/preview",
    requireAdmin,
    upload.single("database"),
    restoreOrgContext,
    (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "Upload a peerfinance.db backup file." });
        }
        const { resolveUploadForRestore } = require("./admin-data-service");
        let resolved;
        try {
          resolved = resolveUploadForRestore(req.file.path, req.body?.passphrase);
        } catch (err) {
          try {
            fs.unlinkSync(req.file.path);
          } catch (_) {}
          return res.status(400).json({ error: err.message });
        }
        const uploadStats = readDatabaseStats(resolved.dbPath);
        if (resolved.tempPath) {
          try {
            fs.unlinkSync(resolved.tempPath);
          } catch (_) {}
        }
        const slug = req.user.organizationSlug;
        const { getOrgDatabasePath } = require("./admin-data-service");
        const livePath = getOrgDatabasePath(slug);
        const liveStats = fs.existsSync(livePath) ? readDatabaseStats(livePath) : null;

        try {
          fs.unlinkSync(req.file.path);
        } catch (_) {}

        if (!uploadStats.integrityOk) {
          return res.status(400).json({
            error: "Uploaded database failed integrity check.",
            upload: uploadStats,
          });
        }

        res.json({
          upload: uploadStats,
          live: liveStats,
        });
      } catch (err) {
        if (req.file?.path) {
          try {
            fs.unlinkSync(req.file.path);
          } catch (_) {}
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.post("/api/admin/maintenance/normalize-profiles", requireAdmin, (req, res) => {
    try {
      const apply = req.body?.apply === true || req.body?.apply === "true";
      const db = getDb();
      const result = normalizeAllProfiles(db, { apply });
      res.json({
        success: true,
        message: apply
          ? `Updated ${result.profileUpdates} profile(s) and ${result.memberNameUpdates} ledger name(s).`
          : `Preview: ${result.wouldChange} profile(s) would change.`,
        ...result,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
}

module.exports = { registerAdminDataRoutes };
