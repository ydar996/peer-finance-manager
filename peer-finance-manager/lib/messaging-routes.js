const path = require("path");
const {
  listRecipientOptions,
  createAdminThread,
  createMemberThread,
  listInbox,
  getUnreadSummary,
  getThreadDetail,
  replyToThread,
  resolveAttachmentFile,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
} = require("./messaging-service");

function parseMemberIds(raw) {
  if (Array.isArray(raw)) return raw.map((v) => Number(v));
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((v) => Number(v));
    } catch {
      /* comma list */
    }
    return trimmed.split(",").map((v) => Number(v.trim()));
  }
  return [];
}

function sendAttachment(req, res, inline) {
  try {
    const file = resolveAttachmentFile(req.user, Number(req.params.attachmentId));
    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `${inline ? "inline" : "attachment"}; filename="${String(file.originalName).replace(/"/g, "")}"`
    );
    res.setHeader("Cache-Control", "private, max-age=60");
    res.sendFile(path.resolve(file.absPath));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

function registerMessagingRoutes(
  app,
  {
    requireAuth,
    requireAdmin,
    requireActiveMemberAccount,
    requireCooperativeView,
    restoreOrgContext,
    upload,
  }
) {
  const messageUpload = upload.array("attachments", MAX_ATTACHMENTS);

  app.get("/api/messages/recipients", requireAuth, requireAdmin, (req, res) => {
    try {
      res.json(listRecipientOptions());
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.get("/api/messages/unread", requireAuth, requireCooperativeView, (req, res) => {
    try {
      res.json(getUnreadSummary(req.user));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.get("/api/messages/inbox", requireAuth, requireCooperativeView, (req, res) => {
    try {
      res.json({ threads: listInbox(req.user), unread: getUnreadSummary(req.user) });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.get("/api/messages/threads/:id", requireAuth, requireCooperativeView, (req, res) => {
    try {
      const detail = getThreadDetail(req.user, Number(req.params.id));
      res.json({ thread: detail });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.post(
    "/api/messages/threads",
    requireAuth,
    requireAdmin,
    (req, res, next) => {
      messageUpload(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message || "Upload failed" });
        next();
      });
    },
    restoreOrgContext,
    (req, res) => {
      try {
        const thread = createAdminThread(req.user, {
          subject: req.body?.subject,
          body: req.body?.body,
          bodyFormat: req.body?.bodyFormat || "html",
          audience: req.body?.audience === "all" ? "all" : "selected",
          memberIds: parseMemberIds(req.body?.memberIds),
          files: req.files || [],
        });
        res.status(201).json({ thread, unread: getUnreadSummary(req.user) });
      } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
      }
    }
  );

  app.post(
    "/api/messages/threads/:id/reply",
    requireAuth,
    requireAdmin,
    (req, res, next) => {
      messageUpload(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message || "Upload failed" });
        next();
      });
    },
    restoreOrgContext,
    (req, res) => {
      try {
        const thread = replyToThread(req.user, Number(req.params.id), {
          body: req.body?.body,
          bodyFormat: req.body?.bodyFormat || "html",
          files: req.files || [],
        });
        res.json({ thread, unread: getUnreadSummary(req.user) });
      } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
      }
    }
  );

  app.get(
    "/api/messages/attachments/:attachmentId",
    requireAuth,
    requireCooperativeView,
    (req, res) => sendAttachment(req, res, true)
  );
  app.get(
    "/api/messages/attachments/:attachmentId/download",
    requireAuth,
    requireCooperativeView,
    (req, res) => sendAttachment(req, res, false)
  );

  app.get("/api/me/messages/unread", requireAuth, requireActiveMemberAccount, (req, res) => {
    try {
      res.json(getUnreadSummary(req.user));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.get("/api/me/messages/inbox", requireAuth, requireActiveMemberAccount, (req, res) => {
    try {
      res.json({ threads: listInbox(req.user), unread: getUnreadSummary(req.user) });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.get("/api/me/messages/threads/:id", requireAuth, requireActiveMemberAccount, (req, res) => {
    try {
      const detail = getThreadDetail(req.user, Number(req.params.id));
      res.json({ thread: detail });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.post("/api/me/messages/threads", requireAuth, requireActiveMemberAccount, (req, res) => {
    try {
      const thread = createMemberThread(req.user, {
        subject: req.body?.subject,
        body: req.body?.body,
      });
      res.status(201).json({ thread, unread: getUnreadSummary(req.user) });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.post(
    "/api/me/messages/threads/:id/reply",
    requireAuth,
    requireActiveMemberAccount,
    (req, res) => {
      try {
        const thread = replyToThread(req.user, Number(req.params.id), { body: req.body?.body });
        res.json({ thread, unread: getUnreadSummary(req.user) });
      } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
      }
    }
  );

  app.get(
    "/api/me/messages/attachments/:attachmentId",
    requireAuth,
    requireActiveMemberAccount,
    (req, res) => sendAttachment(req, res, true)
  );
  app.get(
    "/api/me/messages/attachments/:attachmentId/download",
    requireAuth,
    requireActiveMemberAccount,
    (req, res) => sendAttachment(req, res, false)
  );
}

module.exports = {
  registerMessagingRoutes,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
};
