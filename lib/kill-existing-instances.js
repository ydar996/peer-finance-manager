const { execSync } = require("child_process");
const os = require("os");
const { trace } = require("./trace-log");
const { isPackaged } = require("./paths");

const EXE_NAME = "PeerFinanceManager.exe";

function parseTasklistCsvLine(line) {
  const parts = line.match(/"([^"]*)"/g);
  if (!parts || parts.length < 2) return null;
  const image = parts[0].replace(/"/g, "");
  const pid = Number(parts[1].replace(/"/g, ""));
  if (!pid || !Number.isFinite(pid)) return null;
  return { image, pid };
}

function killProcess(pid, reason) {
  try {
    execSync(`taskkill /F /PID ${pid}`, { stdio: "pipe", windowsHide: true });
    trace.info("Stopped previous process", { pid, reason });
    return true;
  } catch (_) {
    return false;
  }
}

function killByImageName(imageName, currentPid) {
  if (os.platform() !== "win32") return 0;
  let killed = 0;
  try {
    const out = execSync(`tasklist /FI "IMAGENAME eq ${imageName}" /FO CSV /NH`, {
      encoding: "utf8",
      windowsHide: true,
    });
    for (const line of out.split(/\r?\n/)) {
      const row = parseTasklistCsvLine(line.trim());
      if (!row || row.pid === currentPid) continue;
      if (killProcess(row.pid, imageName)) killed += 1;
    }
  } catch (err) {
    trace.warn("Could not enumerate running app instances", { error: err.message });
  }
  return killed;
}

function killNodeServersOnPort(port, currentPid) {
  if (os.platform() !== "win32") return 0;
  let killed = 0;
  try {
    const out = execSync("netstat -ano", { encoding: "utf8", windowsHide: true });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes(`:${port}`) || !line.includes("LISTENING")) continue;
      const parts = line.trim().split(/\s+/);
      const pid = Number(parts[parts.length - 1]);
      if (pid && pid !== currentPid) pids.add(pid);
    }
    for (const pid of pids) {
      if (killProcess(pid, `port ${port}`)) killed += 1;
    }
  } catch (err) {
    trace.warn("Could not stop processes on port", { port, error: err.message });
  }
  return killed;
}

function sleepMs(ms) {
  if (ms <= 0) return;
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* allow OS to release port/handles */
  }
}

/**
 * Stop any other copy of this app before starting a new one.
 * Packaged exe: kills other PeerFinanceManager.exe processes.
 * Always frees the HTTP port so a restart can bind immediately.
 */
function ensureSingleInstance(port) {
  const currentPid = process.pid;
  let stopped = 0;

  if (isPackaged()) {
    stopped += killByImageName(EXE_NAME, currentPid);
  }

  stopped += killNodeServersOnPort(port, currentPid);

  if (stopped > 0) {
    trace.info("Closed existing app instance(s) before startup", { stopped, port });
    sleepMs(600);
  }
}

module.exports = { ensureSingleInstance, killByImageName };
