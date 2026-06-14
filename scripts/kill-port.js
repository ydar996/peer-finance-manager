#!/usr/bin/env node
/**
 * Kills any process using the given port.
 */
const port = parseInt(process.argv[2] || "3456", 10);
const { execSync } = require("child_process");
const os = require("os");

try {
  if (os.platform() === "win32") {
    const out = execSync(`netstat -ano`, { encoding: "utf8" });
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
      } catch (_) {}
    }
  } else {
    execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, { stdio: "pipe" });
  }
} catch (_) {}
