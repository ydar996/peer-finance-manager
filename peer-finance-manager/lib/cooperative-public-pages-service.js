const fs = require("fs");
const path = require("path");
const { getAppRoot } = require("./paths");
const { getOrgDataDir, getOrganization } = require("./organization-service");
const { runWithOrg } = require("./org-context");
const {
  ensureSettingsTable,
  getCooperativeSetting,
  setCooperativeSetting,
} = require("./cooperative-settings");
const { getDb } = require("../db/database");

const SETTINGS = {
  ABOUT_HTML: "public_about_html",
  ABOUT_PUBLISHED: "public_about_published",
  BYLAWS_PUBLISHED: "public_bylaws_published",
  BYLAWS_FILENAME: "public_bylaws_filename",
  ABOUT_FILENAME: "public_about_filename",
  ABOUT_MODE: "public_about_mode",
};

const DEFAULT_BYLAWS_FILENAME = "bylaws.pdf";
const DEFAULT_ABOUT_FILENAME = "about.pdf";
const ABOUT_SEED_VERSION = "3";
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

const RESTRICTED_PATH_PREFIXES = ["/member", "/admin", "/staff", "/register", "/platform"];

function stripRestrictedLinks(html) {
  if (!html) return "";
  let result = String(html);
  for (const prefix of RESTRICTED_PATH_PREFIXES) {
    const re = new RegExp(
      `<a\\s+[^>]*href=(["'])${prefix.replace("/", "\\/")}[^"']*\\1[^>]*>([\\s\\S]*?)<\\/a>`,
      "gi"
    );
    result = result.replace(re, "$2");
  }
  return result;
}

function sanitizePublicAboutHtml(html, slug) {
  return stripRestrictedLinks(rewriteAboutLinks(rewriteAboutImageUrls(html, slug), slug));
}

function getOrgPublicDir(slug) {
  return path.join(getOrgDataDir(slug), "public");
}

function getAboutImagesDir(slug) {
  return path.join(getOrgPublicDir(slug), "about");
}

function ensureOrgPublicDirs(slug) {
  fs.mkdirSync(getAboutImagesDir(slug), { recursive: true });
}

function bundledSeedDir(slug) {
  return path.join(getAppRoot(), "seed", slug, "public");
}

function copySeedFileIfMissing(src, dest) {
  if (!fs.existsSync(src)) return false;
  if (fs.existsSync(dest)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

function copyDirFilesIfMissing(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, name);
    const dest = path.join(destDir, name);
    if (fs.statSync(src).isDirectory()) {
      copyDirFilesIfMissing(src, dest);
    } else if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
    }
  }
}

function rewriteAboutImageUrls(html, slug) {
  if (!html) return "";
  const base = `/api/public/organizations/${encodeURIComponent(slug)}/about/images/`;
  return String(html).replace(
    /src=(["'])about\/([^"']+)\1/gi,
    (_match, quote, filename) => `src=${quote}${base}${encodeURIComponent(filename)}${quote}`
  );
}

function rewriteAboutLinks(html, slug) {
  if (!html) return "";
  return String(html).replace(
    /href=(["'])\/c\/[^/]+\/bylaws\1/gi,
    `href=$1/c/${encodeURIComponent(slug)}/bylaws$1`
  );
}

function listAboutImageFiles(slug) {
  const dir = getAboutImagesDir(slug);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => IMAGE_EXT.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

function resolveAboutImagePath(slug, filename) {
  const safe = path.basename(String(filename || ""));
  if (!safe || safe !== filename) return null;
  const filePath = path.join(getAboutImagesDir(slug), safe);
  if (!fs.existsSync(filePath)) return null;
  const ext = path.extname(safe).toLowerCase();
  if (!IMAGE_EXT.has(ext)) return null;
  return filePath;
}

function resolveAboutDocumentPath(slug) {
  const mode =
    runWithOrg(slug, () => getCooperativeSetting(SETTINGS.ABOUT_MODE)) || "pdf";
  if (mode === "pdf") {
    const filename =
      runWithOrg(slug, () => getCooperativeSetting(SETTINGS.ABOUT_FILENAME)) ||
      DEFAULT_ABOUT_FILENAME;
    const safe = path.basename(filename);
    const filePath = path.join(getOrgPublicDir(slug), safe);
    if (fs.existsSync(filePath)) return { filePath, filename: safe, mode: "pdf" };
  }
  return null;
}

function resolveBylawsPath(slug) {
  const filename =
    runWithOrg(slug, () => getCooperativeSetting(SETTINGS.BYLAWS_FILENAME)) ||
    DEFAULT_BYLAWS_FILENAME;
  const safe = path.basename(filename);
  const filePath = path.join(getOrgPublicDir(slug), safe);
  if (!fs.existsSync(filePath)) return null;
  return { filePath, filename: safe };
}

function isAboutPublished(slug) {
  if (runWithOrg(slug, () => getCooperativeSetting(SETTINGS.ABOUT_PUBLISHED)) !== "1") {
    return false;
  }
  return !!(resolveAboutDocumentPath(slug) || runWithOrg(slug, () => getCooperativeSetting(SETTINGS.ABOUT_HTML)));
}

function isBylawsPublished(slug) {
  return (
    runWithOrg(slug, () => getCooperativeSetting(SETTINGS.BYLAWS_PUBLISHED)) === "1"
  );
}

function getPublicSummary(slug) {
  const org = getOrganization(slug);
  if (!org) return null;
  const aboutPublished = isAboutPublished(slug);
  const bylawsPublished = isBylawsPublished(slug) && !!resolveBylawsPath(slug);
  return {
    organization: { slug: org.slug, name: org.name },
    aboutAvailable: aboutPublished,
    bylawsAvailable: bylawsPublished,
  };
}

function getPublicAbout(slug) {
  const org = getOrganization(slug);
  if (!org || !isAboutPublished(slug)) return null;

  const pdfDoc = resolveAboutDocumentPath(slug);
  if (pdfDoc) {
    return {
      organization: { slug: org.slug, name: org.name },
      mode: "pdf",
      filename: pdfDoc.filename,
      documentUrl: `/api/public/organizations/${encodeURIComponent(slug)}/about/document`,
    };
  }

  const rawHtml = runWithOrg(slug, () => getCooperativeSetting(SETTINGS.ABOUT_HTML)) || "";
  const html = sanitizePublicAboutHtml(rawHtml, slug);
  const images = listAboutImageFiles(slug).map((filename) => ({
    filename,
    url: `/api/public/organizations/${encodeURIComponent(slug)}/about/images/${encodeURIComponent(filename)}`,
  }));
  return {
    organization: { slug: org.slug, name: org.name },
    mode: "html",
    html,
    images,
  };
}

function getPublicBylawsMeta(slug) {
  const org = getOrganization(slug);
  if (!org || !isBylawsPublished(slug)) return null;
  const doc = resolveBylawsPath(slug);
  if (!doc) return null;
  return {
    organization: { slug: org.slug, name: org.name },
    filename: doc.filename,
    downloadUrl: `/api/public/organizations/${encodeURIComponent(slug)}/bylaws/document`,
  };
}

function getAdminPublicPages(slug) {
  return runWithOrg(slug, () => {
    const db = getDb();
    ensureSettingsTable(db);
    const aboutHtml = getCooperativeSetting(SETTINGS.ABOUT_HTML) || "";
    const aboutPublished = getCooperativeSetting(SETTINGS.ABOUT_PUBLISHED) === "1";
    const bylawsPublished = getCooperativeSetting(SETTINGS.BYLAWS_PUBLISHED) === "1";
    const bylawsFilename =
      getCooperativeSetting(SETTINGS.BYLAWS_FILENAME) || DEFAULT_BYLAWS_FILENAME;
    const bylawsOnDisk = !!resolveBylawsPath(slug);
    const images = listAboutImageFiles(slug).map((filename) => ({
      filename,
      url: `/api/public/organizations/${encodeURIComponent(slug)}/about/images/${encodeURIComponent(filename)}`,
    }));
    return {
      aboutHtml,
      aboutPublished,
      bylawsPublished,
      bylawsFilename,
      bylawsOnDisk,
      images,
      publicAboutUrl: `/c/${encodeURIComponent(slug)}/about`,
      publicBylawsUrl: `/c/${encodeURIComponent(slug)}/bylaws`,
    };
  });
}

function saveAboutPage(slug, { html, published }) {
  return runWithOrg(slug, () => {
    const db = getDb();
    ensureSettingsTable(db);
    if (html !== undefined) {
      setCooperativeSetting(db, SETTINGS.ABOUT_HTML, String(html));
    }
    if (published !== undefined) {
      setCooperativeSetting(db, SETTINGS.ABOUT_PUBLISHED, published ? "1" : "0");
    }
    return getAdminPublicPages(slug);
  });
}

function saveBylawsUpload(slug, uploadedPath, originalName) {
  ensureOrgPublicDirs(slug);
  const ext = path.extname(originalName || "").toLowerCase() || ".pdf";
  const filename = ext === ".pdf" ? DEFAULT_BYLAWS_FILENAME : `bylaws${ext}`;
  const dest = path.join(getOrgPublicDir(slug), filename);
  fs.copyFileSync(uploadedPath, dest);
  try {
    fs.unlinkSync(uploadedPath);
  } catch (_) {}
  return runWithOrg(slug, () => {
    const db = getDb();
    ensureSettingsTable(db);
    setCooperativeSetting(db, SETTINGS.BYLAWS_FILENAME, filename);
    setCooperativeSetting(db, SETTINGS.BYLAWS_PUBLISHED, "1");
    return getAdminPublicPages(slug);
  });
}

function setBylawsPublished(slug, published) {
  return runWithOrg(slug, () => {
    const db = getDb();
    ensureSettingsTable(db);
    setCooperativeSetting(db, SETTINGS.BYLAWS_PUBLISHED, published ? "1" : "0");
    return getAdminPublicPages(slug);
  });
}

function saveAboutImageUpload(slug, uploadedPath, originalName) {
  ensureOrgPublicDirs(slug);
  const safe = path.basename(String(originalName || "image.png"));
  const dest = path.join(getAboutImagesDir(slug), safe);
  fs.copyFileSync(uploadedPath, dest);
  try {
    fs.unlinkSync(uploadedPath);
  } catch (_) {}
  return getAdminPublicPages(slug);
}

function removeAboutImage(slug, filename) {
  const filePath = resolveAboutImagePath(slug, filename);
  if (!filePath) return getAdminPublicPages(slug);
  fs.unlinkSync(filePath);
  return getAdminPublicPages(slug);
}

function seedOrgPublicPages(orgSlug) {
  const org = getOrganization(orgSlug);
  if (!org) return { seeded: false, reason: "organization-not-found" };

  const seedRoot = bundledSeedDir(orgSlug);
  if (!fs.existsSync(seedRoot)) return { seeded: false, reason: "no-bundled-seed" };

  ensureOrgPublicDirs(orgSlug);
  const destRoot = getOrgPublicDir(orgSlug);
  copyDirFilesIfMissing(path.join(seedRoot, "about"), getAboutImagesDir(orgSlug));
  copySeedFileIfMissing(
    path.join(seedRoot, DEFAULT_BYLAWS_FILENAME),
    path.join(destRoot, DEFAULT_BYLAWS_FILENAME)
  );

  return runWithOrg(orgSlug, () => {
    const db = getDb();
    ensureSettingsTable(db);
    let changed = false;

    const aboutSeed = path.join(seedRoot, "about.html");
    const seedVersionKey = "public_about_seed_version";
    if (fs.existsSync(aboutSeed)) {
      const seedHtml = fs.readFileSync(aboutSeed, "utf8");
      const currentVersion = getCooperativeSetting(seedVersionKey);
      if (!getCooperativeSetting(SETTINGS.ABOUT_HTML) || currentVersion !== ABOUT_SEED_VERSION) {
        setCooperativeSetting(db, SETTINGS.ABOUT_HTML, seedHtml);
        setCooperativeSetting(db, seedVersionKey, ABOUT_SEED_VERSION);
        const bylawsSeed = path.join(seedRoot, DEFAULT_BYLAWS_FILENAME);
        if (fs.existsSync(bylawsSeed)) {
          fs.copyFileSync(bylawsSeed, path.join(destRoot, DEFAULT_BYLAWS_FILENAME));
        }
        const aboutPdfSeed = path.join(seedRoot, DEFAULT_ABOUT_FILENAME);
        if (fs.existsSync(aboutPdfSeed)) {
          fs.copyFileSync(aboutPdfSeed, path.join(destRoot, DEFAULT_ABOUT_FILENAME));
          setCooperativeSetting(db, SETTINGS.ABOUT_FILENAME, DEFAULT_ABOUT_FILENAME);
          setCooperativeSetting(db, SETTINGS.ABOUT_MODE, "pdf");
        }
        changed = true;
      }
    }
    if (getCooperativeSetting(SETTINGS.ABOUT_PUBLISHED) !== "1") {
      if (getCooperativeSetting(SETTINGS.ABOUT_HTML)) {
        setCooperativeSetting(db, SETTINGS.ABOUT_PUBLISHED, "1");
        changed = true;
      }
    }
    if (!getCooperativeSetting(SETTINGS.BYLAWS_FILENAME)) {
      if (fs.existsSync(path.join(destRoot, DEFAULT_BYLAWS_FILENAME))) {
        setCooperativeSetting(db, SETTINGS.BYLAWS_FILENAME, DEFAULT_BYLAWS_FILENAME);
        changed = true;
      }
    }
    if (getCooperativeSetting(SETTINGS.BYLAWS_PUBLISHED) !== "1") {
      if (resolveBylawsPath(orgSlug)) {
        setCooperativeSetting(db, SETTINGS.BYLAWS_PUBLISHED, "1");
        changed = true;
      }
    }

    return { seeded: changed, slug: orgSlug };
  });
}

function seedAssurancePublicPages() {
  const { ASSURANCE_SLUG } = require("./organization-service");
  return seedOrgPublicPages(ASSURANCE_SLUG);
}

module.exports = {
  SETTINGS,
  DEFAULT_BYLAWS_FILENAME,
  DEFAULT_ABOUT_FILENAME,
  getOrgPublicDir,
  getPublicSummary,
  getPublicAbout,
  getPublicBylawsMeta,
  getAdminPublicPages,
  saveAboutPage,
  saveBylawsUpload,
  setBylawsPublished,
  saveAboutImageUpload,
  removeAboutImage,
  resolveAboutImagePath,
  resolveAboutDocumentPath,
  resolveBylawsPath,
  seedOrgPublicPages,
  seedAssurancePublicPages,
};
