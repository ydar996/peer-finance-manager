const {
  listRecipientOptions,
  createAdminThread,
  createMemberThread,
  listInbox,
  getUnreadSummary,
  getThreadDetail,
  replyToThread,
} = require("./messaging-service");

function registerMessagingRoutes(app, { requireAuth, requireAdmin, requireActiveMemberAccount, requireCooperativeView }) {
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

  app.post("/api/messages/threads", requireAuth, requireAdmin, (req, res) => {
    try {
      const thread = createAdminThread(req.user, {
        subject: req.body?.subject,
        body: req.body?.body,
        audience: req.body?.audience === "all" ? "all" : "selected",
        memberIds: req.body?.memberIds,
      });
      res.status(201).json({ thread, unread: getUnreadSummary(req.user) });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.post("/api/messages/threads/:id/reply", requireAuth, requireAdmin, (req, res) => {
    try {
      const thread = replyToThread(req.user, Number(req.params.id), { body: req.body?.body });
      res.json({ thread, unread: getUnreadSummary(req.user) });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

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

  app.post("/api/me/messages/threads/:id/reply", requireAuth, requireActiveMemberAccount, (req, res) => {
    try {
      const thread = replyToThread(req.user, Number(req.params.id), { body: req.body?.body });
      res.json({ thread, unread: getUnreadSummary(req.user) });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });
}

module.exports = { registerMessagingRoutes };
