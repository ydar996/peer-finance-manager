const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");

const app = express();
const ROOT_DIR = __dirname;
const jobProgress = {};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(ROOT_DIR, "temp");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const name = `distribution-${Date.now()}${path.extname(file.originalname) || ".xlsx"}`;
      cb(null, name);
    },
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".xlsx" || ext === ".xls") cb(null, true);
    else cb(new Error("Only .xlsx or .xls files allowed"), false);
  },
});

app.use(express.json());

// API routes (must be before static to avoid 404)
app.get("/api/files", (req, res) => {
  try {
    const files = fs.readdirSync(ROOT_DIR)
      .filter((f) => f.endsWith(".xlsx") || f.endsWith(".xls"))
      .map((name) => ({ name, path: path.join(ROOT_DIR, name) }));
    const distributionsDir = path.join(ROOT_DIR, "Distributions");
    let distributionFiles = [];
    if (fs.existsSync(distributionsDir)) {
      distributionFiles = fs.readdirSync(distributionsDir)
        .filter((f) => f.endsWith(".xlsx") || f.endsWith(".xls"))
        .map((name) => path.join("Distributions", name));
    }
    res.json({
      files: files.map((f) => f.name),
      distributionFiles,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Inspect a workbook and return sheets + suggested statement sheet
app.post("/api/inspect", (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ error: "filename required" });
    }

    const filePath = path.join(ROOT_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }

    const { parseWorkbook } = require("./lib/statement-generator");
    const workbook = XLSX.readFile(filePath);
    const sheetNames = workbook.SheetNames;

    const monthPattern = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/;
    const statementSheet = sheetNames.find((name) => monthPattern.test(name)) || sheetNames[0];

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

// Inspect a distribution file (optional upload for interest/dividends)
app.post("/api/inspect-distribution", (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ error: "filename required" });
    }

    const filePath = path.join(ROOT_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }

    const { parseDistributionFile } = require("./lib/statement-generator");
    const amounts = parseDistributionFile(filePath);
    const memberCount = Object.keys(amounts).length;
    const totalAmount = Object.values(amounts).reduce((a, b) => a + b, 0);
    const zeroCount = Object.values(amounts).filter((v) => !v || v === 0).length;

    res.json({
      memberCount,
      totalAmount,
      zeroCount,
      valid: memberCount > 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload a distribution file from anywhere on the user's machine
app.post("/api/upload-distribution", (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || "Upload failed" });
    }
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const relPath = path.join("temp", req.file.filename);
      res.json({ path: relPath, name: req.file.originalname });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

// Start generation (spawns worker process, returns jobId immediately)
app.post("/api/generate", (req, res) => {
  const { filename, sheetName, distributionFilename } = req.body;
  if (!filename || !sheetName) {
    return res.status(400).json({ error: "filename and sheetName required" });
  }

  const workbookPath = path.join(ROOT_DIR, filename);
  if (!fs.existsSync(workbookPath)) {
    return res.status(404).json({ error: "File not found" });
  }

  const distFile =
    distributionFilename && distributionFilename !== ""
      ? path.join(ROOT_DIR, distributionFilename)
      : null;
  if (distFile && !fs.existsSync(distFile)) {
    return res.status(404).json({ error: "Distribution file not found" });
  }

  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const progressFile = path.join(ROOT_DIR, "temp", `${jobId}.progress.json`);

  jobProgress[jobId] = { progressFile };

  const workerScript = path.join(ROOT_DIR, "scripts", "run-generation-worker.js");
  fs.mkdirSync(path.dirname(progressFile), { recursive: true });

  const workerArgs = [
    workerScript,
    progressFile,
    workbookPath,
    sheetName,
    ROOT_DIR,
    distFile ? distributionFilename : "-",
  ];

  const child = spawn(
    process.execPath,
    workerArgs,
    { cwd: ROOT_DIR, stdio: "ignore" }
  );

  child.on("error", (err) => {
    if (jobProgress[jobId]) {
      try {
        fs.writeFileSync(
          progressFile,
          JSON.stringify({ done: true, success: false, error: err.message }),
          "utf8"
        );
      } catch (_) {}
    }
  });

  child.on("exit", (code) => {
    if (code !== 0 && jobProgress[jobId]) {
      try {
        const data = JSON.parse(fs.readFileSync(progressFile, "utf8"));
        if (!data.done) {
          fs.writeFileSync(
            progressFile,
            JSON.stringify({
              done: true,
              success: false,
              error: data.error || "Generation failed",
            }),
            "utf8"
          );
        }
      } catch (_) {}
    }
  });

  res.json({ jobId });
});

// Poll for progress (reads from file written by worker)
app.get("/api/generate/status/:jobId", (req, res) => {
  const job = jobProgress[req.params.jobId];
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  try {
    const raw = fs.readFileSync(job.progressFile, "utf8");
    const data = JSON.parse(raw);
    if (data.done) {
      try {
        fs.unlinkSync(job.progressFile);
      } catch (_) {}
      delete jobProgress[req.params.jobId];
    }
    res.json(data);
  } catch (err) {
    res.json({
      current: 0,
      total: 0,
      member: "Starting...",
      done: false,
    });
  }
});

app.use(express.static(ROOT_DIR));

const PORT = 3456;
app.listen(PORT, () => {
  console.log(`Statement Generator running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT}/generator.html in your browser.`);
});
