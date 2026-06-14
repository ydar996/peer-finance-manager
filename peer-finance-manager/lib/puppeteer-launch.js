const fs = require("fs");
const puppeteer = require("puppeteer");

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
];

function resolveExecutablePath() {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return undefined;
  }

  try {
    const bundled = puppeteer.executablePath();
    if (bundled && fs.existsSync(bundled)) return bundled;
  } catch (_) {}

  return undefined;
}

function getPuppeteerLaunchOptions(extra = {}) {
  const executablePath = resolveExecutablePath();
  return {
    headless: true,
    args: LAUNCH_ARGS,
    ...(executablePath ? { executablePath } : {}),
    ...extra,
  };
}

async function launchBrowser(extra = {}) {
  return puppeteer.launch(getPuppeteerLaunchOptions(extra));
}

module.exports = { launchBrowser, getPuppeteerLaunchOptions, resolveExecutablePath };
