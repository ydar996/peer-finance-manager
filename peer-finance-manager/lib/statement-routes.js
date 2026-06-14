const fs = require("fs");
const path = require("path");
const {
  getCoopRoot,
  getDataDir,
  getDistributionsDir,
} = require("./paths");

function loadStatementGenerator() {
  return require(path.join(getCoopRoot(), "lib", "statement-generator"));
}

const jobProgress = new Map();

function requireCooperativeView(req, res, next) {
  const { canViewCooperative } = require("./auth-service");
  if (canViewCooperative(req.user)) return next();
  res.status(403).json({ error: "Access denied" });
}

function registerStatementRoutes(app) {
  const distUpload = multerDiskStorage();

  app.get("/api/statements/files", requireCooperativeView, (req, res) => {
    try {
      const coopRoot = getCoopRoot();
      const files = fs
        .readdirSync(coopRoot)
        .filter((f) => f.endsWith(".xlsx") || f.endsWith(".xls"));

      let distributionFiles = [];
      const distributionsDir = getDistributionsDir();
      if (fs.existsSync(distributionsDir)) {
        distributionFiles = fs
          .readdirSync(distributionsDir)
          .filter((f) => f.endsWith(".xlsx") || f.endsWith(".xls"))
          .map((name) => path.join("Distributions", name));
      }

      res.json({ files, distributionFiles });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/statements/inspect", requireCooperativeView, (req, res) => {
    try {
      const { filename } = req.body;
      if (!filename) return res.status(400).json({ error: "filename required" });

      const filePath = path.join(getCoopRoot(), filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found" });
      }

      const { parseWorkbook } = loadStatementGenerator();
      const XLSX = require("xlsx");
      const workbook = XLSX.readFile(filePath);
      const sheetNames = workbook.SheetNames;
      const monthPattern =
        /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/;
      const statementSheet =
        sheetNames.find((name) => monthPattern.test(name)) || sheetNames[0];

      let memberCount = 0;
      try {
        const parsed = parseWorkbook(filePath, statementSheet);
        memberCount = parsed.members.length;
      } catch (_) {}

      res.json({
        sheets: sheetNames,
        suggestedSheet: statementSheet,
        statementMonth: statementSheet,
        memberCount,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/statements/upload-distribution", requireCooperativeView, (req, res) => {
    distUpload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed" });
      try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });
        const relPath = path.relative(getCoopRoot(), req.file.path);
        res.json({ path: relPath.split(path.sep).join("/"), name: req.file.originalname });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });
  });

  app.post("/api/statements/generate", requireCooperativeView, (req, res) => {
    const { filename, sheetName, distributionFilename } = req.body;
    if (!filename || !sheetName) {
      return res.status(400).json({ error: "filename and sheetName required" });
    }

    const coopRoot = getCoopRoot();
    const workbookPath = path.join(coopRoot, filename);
    if (!fs.existsSync(workbookPath)) {
      return res.status(404).json({ error: "File not found" });
    }

    const distFile =
      distributionFilename && distributionFilename !== ""
        ? path.join(coopRoot, distributionFilename)
        : null;
    if (distFile && !fs.existsSync(distFile)) {
      return res.status(404).json({ error: "Distribution file not found" });
    }

    const jobId = `stmt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    jobProgress.set(jobId, { current: 0, total: 0, member: "Starting...", done: false });

    res.json({ jobId });

    const { generateStatements, parseWorkbook } = loadStatementGenerator();
    let total = 0;
    try {
      total = parseWorkbook(workbookPath, sheetName).members.length;
    } catch (_) {}

    jobProgress.set(jobId, {
      current: 0,
      total,
      member: "Launching browser...",
      done: false,
    });

    generateStatements({
      workbookPath,
      sheetName,
      baseDir: coopRoot,
      distributionFilePath: distFile,
      onProgress: (memberName, current, totalCount) => {
        jobProgress.set(jobId, {
          current,
          total: totalCount,
          member: memberName,
          done: false,
        });
      },
    })
      .then((result) => {
        jobProgress.set(jobId, {
          done: true,
          success: true,
          count: result.count,
          outputDir: result.outputDir,
        });
      })
      .catch((err) => {
        jobProgress.set(jobId, {
          done: true,
          success: false,
          error: err.message,
        });
      });
  });

  app.get("/api/statements/generate/status/:jobId", requireCooperativeView, (req, res) => {
    const data = jobProgress.get(req.params.jobId);
    if (!data) return res.status(404).json({ error: "Job not found" });
    if (data.done) jobProgress.delete(req.params.jobId);
    res.json(data);
  });
}

function multerDiskStorage(baseUpload) {
  const multer = require("multer");
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const dir = path.join(getDataDir(), "uploads", "distributions");
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req, file, cb) => {
        cb(null, `distribution-${Date.now()}${path.extname(file.originalname) || ".xlsx"}`);
      },
    }),
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === ".xlsx" || ext === ".xls") cb(null, true);
      else cb(new Error("Only .xlsx or .xls files allowed"), false);
    },
  });
}

module.exports = { registerStatementRoutes };
