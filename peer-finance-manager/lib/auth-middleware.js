const {
  getSession,
  canAccessMember,
  canWrite,
  canViewCooperative,
  ROLES,
} = require("./auth-service");
const { runWithOrg } = require("./org-context");

function getToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return req.headers["x-session-token"] || null;
}

function attachUser(req, res, next) {
  const token = getToken(req);
  const session = getSession(token);
  req.authToken = token;
  req.user = session?.user || null;
  req.organization = session
    ? { slug: session.organizationSlug, name: session.organizationName }
    : null;
  if (session?.organizationSlug) {
    return runWithOrg(session.organizationSlug, () => next());
  }
  next();
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  res.status(401).json({ error: "Login required" });
}

function requireAdmin(req, res, next) {
  if (req.user?.role === ROLES.ADMIN) return next();
  res.status(403).json({ error: "Administrator access required" });
}

function requireCooperativeView(req, res, next) {
  if (canViewCooperative(req.user)) return next();
  res.status(403).json({ error: "Access denied" });
}

function requireMemberSelf(paramName = "id") {
  return (req, res, next) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Login required" });
    if (user.role === ROLES.ADMIN || user.role === ROLES.STAFF) return next();
    const targetId = Number(req.params[paramName]);
    if (canAccessMember(user, targetId)) return next();
    res.status(403).json({ error: "You can only access your own account" });
  };
}

function blockWritesUnlessAdmin(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (canWrite(req.user)) return next();
  res.status(403).json({
    error:
      req.user?.role === ROLES.STAFF
        ? "Staff accounts are read-only"
        : "You do not have permission to make changes",
  });
}

/** Multer file uploads run outside AsyncLocalStorage; re-bind org before DB access. */
function restoreOrgContext(req, res, next) {
  const slug = req.organization?.slug || req.user?.organizationSlug;
  if (!slug) {
    return res.status(400).json({
      error: "Organization session not found. Sign out and sign in again at /admin.",
    });
  }
  return runWithOrg(slug, () => next());
}

module.exports = {
  attachUser,
  requireAuth,
  requireAdmin,
  requireCooperativeView,
  requireMemberSelf,
  blockWritesUnlessAdmin,
  restoreOrgContext,
  getToken,
};
