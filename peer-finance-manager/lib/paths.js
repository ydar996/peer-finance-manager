const fs = require("fs");
const path = require("path");

let appRoot = null;

function isPackaged() {
  return typeof process.pkg !== "undefined";
}

function initPaths(explicitRoot) {
  if (explicitRoot) {
    appRoot = explicitRoot;
  } else if (isPackaged()) {
    appRoot = path.dirname(process.execPath);
  } else {
    appRoot = path.join(__dirname, "..");
  }
  fs.mkdirSync(getDataDir(), { recursive: true });
  fs.mkdirSync(path.join(getDataDir(), "uploads"), { recursive: true });
}

function getAppRoot() {
  if (!appRoot) initPaths();
  return appRoot;
}

function getDataDir() {
  if (process.env.PFM_DATA_DIR) {
    return process.env.PFM_DATA_DIR;
  }
  const root = getAppRoot();
  if (isPackaged()) {
    return path.join(root, "data");
  }
  // Dev: peer-finance-manager server shares AssurCoop/data with imports and the .exe bundle.
  if (path.basename(root) === "peer-finance-manager") {
    return path.join(root, "..", "data");
  }
  return path.join(root, "data");
}

function getModuleRoot() {
  return isPackaged() ? path.join(__dirname, "..") : path.join(__dirname, "..");
}

function getPublicDir() {
  if (isPackaged()) {
    const external = path.join(getAppRoot(), "public");
    if (fs.existsSync(external)) return external;
  }
  return path.join(getModuleRoot(), "public");
}

function getSchemaPath() {
  if (isPackaged()) {
    const external = path.join(getAppRoot(), "db", "schema.sql");
    if (fs.existsSync(external)) return external;
  }
  return path.join(getModuleRoot(), "db", "schema.sql");
}

/** Project / cooperative root — workbooks, statements, Distributions folder */
function getCoopRoot() {
  if (process.env.PFM_COOP_ROOT) {
    return process.env.PFM_COOP_ROOT;
  }
  const root = getAppRoot();
  if (isPackaged()) return root;
  return path.join(root, "..");
}

function getStatementsDir() {
  if (process.env.PFM_DATA_DIR) {
    return path.join(process.env.PFM_DATA_DIR, "statements");
  }
  return path.join(getCoopRoot(), "statements");
}

function getDistributionsDir() {
  return path.join(getCoopRoot(), "Distributions");
}

module.exports = {
  isPackaged,
  initPaths,
  getAppRoot,
  getCoopRoot,
  getDataDir,
  getStatementsDir,
  getDistributionsDir,
  getModuleRoot,
  getPublicDir,
  getSchemaPath,
};
