const fs = require("fs");
const path = require("path");

let logFilePath = null;
let initialized = false;

function timestamp() {
  return new Date().toISOString();
}

function initTraceLog(dataDir) {
  if (initialized) return;
  initialized = true;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    logFilePath = path.join(dataDir, "startup.log");
    fs.appendFileSync(
      logFilePath,
      `\n--- session ${timestamp()} ---\n`,
      "utf8"
    );
  } catch (_) {
    logFilePath = null;
  }
}

function write(level, message, detail) {
  const line = detail
    ? `[${timestamp()}] [${level}] ${message} ${JSON.stringify(detail)}`
    : `[${timestamp()}] [${level}] ${message}`;
  console.log(line);
  if (logFilePath) {
    try {
      fs.appendFileSync(logFilePath, line + "\n", "utf8");
    } catch (_) {}
  }
}

const trace = {
  init(dataDir) {
    initTraceLog(dataDir);
  },
  info(message, detail) {
    write("INFO", message, detail);
  },
  warn(message, detail) {
    write("WARN", message, detail);
  },
  error(message, detail) {
    write("ERROR", message, detail);
  },
  getLogPath() {
    return logFilePath;
  },
};

module.exports = { trace };
