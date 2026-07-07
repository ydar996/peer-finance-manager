const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { getOrgDataDir } = require("./organization-service");
const { runWithOrg } = require("./org-context");
const {
  getPublicSummary,
  getPublicAbout,
  getPublicBylaws,
  getPublicBylawsMeta,
  getAdminPublicPages,
  saveAboutPage,
  saveBylawsPage,
  saveBylawsUpload,
  setBylawsPublished,
  saveAboutImageUpload,
  removeAboutImage,
  resolveAboutImagePath,
  resolveAboutDocumentPath,
  resolveBylawsPath,
} = require("./cooperative-public-pages-service");

function publicUploadDir(slug) {
  const dir = path.join(getOrgDataDir(slug), "uploads", "public-pages");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function registerCooperativePublicRoutes(app, deps = {}) {
  const requireAdmin = deps.requireAdmin;
  const restoreOrgContext = deps.restoreOrgContext;

  const publicUpload = multer({
    dest: (req, file, cb) => {
      try {
        const slug = req.params.slug || req.user?.organizationSlug;
        if (!slug) return cb(new Error("Organization required"));
        cb(null, publicUploadDir(slug));
      } catch (err) {
        cb(err);
      }
    },
    limits: { fileSize: 15 * 1024 * 1024 },
  });

  app.get("/api/public/organizations/:slug", (req, res) => {
    try {
      const summary = getPublicSummary(req.params.slug);
      if (!summary) return res.status(404).json({ error: "Organization not found" });
      res.json(summary);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/public/organizations/:slug/about", (req, res) => {
    try {
      const about = getPublicAbout(req.params.slug);
      if (!about) return res.status(404).json({ error: "About page not available" });
      res.json(about);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/public/organizations/:slug/bylaws", (req, res) => {
    try {
      const bylaws = getPublicBylaws(req.params.slug);
      if (!bylaws) return res.status(404).json({ error: "Bylaws not available" });
      res.json(bylaws);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/public/organizations/:slug/about/document", (req, res) => {
    try {
      const slug = req.params.slug;
      const doc = resolveAboutDocumentPath(slug);
      if (!doc || !getPublicAbout(slug)) {
        return res.status(404).json({ error: "About document not available" });
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${doc.filename.replace(/"/g, "")}"`
      );
      res.sendFile(path.resolve(doc.filePath));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/public/organizations/:slug/bylaws/document", (req, res) => {
    try {
      const slug = req.params.slug;
      const doc = resolveBylawsPath(slug);
      if (!doc || !getPublicBylawsMeta(slug)) {
        return res.status(404).json({ error: "Bylaws not available" });
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${doc.filename.replace(/"/g, "")}"`
      );
      res.sendFile(path.resolve(doc.filePath));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/public/organizations/:slug/about/images/:filename", (req, res) => {
    try {
      const filePath = resolveAboutImagePath(req.params.slug, req.params.filename);
      if (!filePath || !getPublicAbout(req.params.slug)) {
        return res.status(404).json({ error: "Image not found" });
      }
      res.sendFile(path.resolve(filePath));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  if (!requireAdmin || !restoreOrgContext) return;

  app.get("/api/books/public-pages", requireAdmin, restoreOrgContext, (req, res) => {
    try {
      const slug = req.user.organizationSlug;
      res.json(getAdminPublicPages(slug));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/books/public-pages/about", requireAdmin, restoreOrgContext, (req, res) => {
    try {
      const slug = req.user.organizationSlug;
      const { plainText, externalUrl, published } = req.body || {};
      const result = saveAboutPage(slug, { plainText, externalUrl, published });
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/books/public-pages/bylaws", requireAdmin, restoreOrgContext, (req, res) => {
    try {
      const slug = req.user.organizationSlug;
      const { plainText, externalUrl, published } = req.body || {};
      const result = saveBylawsPage(slug, { plainText, externalUrl, published });
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post(
    "/api/books/public-pages/bylaws",
    requireAdmin,
    restoreOrgContext,
    publicUpload.single("file"),
    (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ error: "PDF file required" });
        const slug = req.user.organizationSlug;
        const result = saveBylawsUpload(slug, req.file.path, req.file.originalname);
        res.json({ success: true, ...result });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.post(
    "/api/books/public-pages/about/images",
    requireAdmin,
    restoreOrgContext,
    publicUpload.single("file"),
    (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ error: "Image file required" });
        const slug = req.user.organizationSlug;
        const result = saveAboutImageUpload(slug, req.file.path, req.file.originalname);
        res.json({ success: true, ...result });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.delete(
    "/api/books/public-pages/about/images/:filename",
    requireAdmin,
    restoreOrgContext,
    (req, res) => {
      try {
        const slug = req.user.organizationSlug;
        const result = removeAboutImage(slug, req.params.filename);
        res.json({ success: true, ...result });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );
}

module.exports = { registerCooperativePublicRoutes };
