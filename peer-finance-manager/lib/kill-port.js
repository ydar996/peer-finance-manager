const { execSync } = require("child_process");
const os = require("os");
const { trace } = require("./trace-log");

function killPort(port) {
  try {
    if (os.platform() === "win32") {
      const out = execSync("netstat -ano", { encoding: "utf8" });
      const lines = out.split("\n").filter((l) => l.includes(`:${port}`));
      const pids = new Set();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== "0" && /^\d+$/.test(pid)) pids.add(pid);
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: "pipe" });
          trace.info(`Freed port ${port}`, { pid });
        } catch (_) {}
      }
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, { stdio: "pipe" });
    }
  } catch (err) {
    trace.warn(`Could not free port ${port}`, { error: err.message });
  }
}

module.exports = { killPort };
