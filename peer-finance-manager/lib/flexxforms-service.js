/**
 * FlexxForms Plan B: each Cooperative owns its own FlexxForms workspace.
 * Credentials live on the registry organizations row (server-side only for secrets).
 */
const crypto = require("crypto");
const {
  getRegistryDb,
  getOrganization,
  normalizeSlug,
  listOrganizations,
  updateOrganizationAdminEmail,
  ASSURANCE_SLUG,
} = require("./organization-service");
const { getDb } = require("../db/database");
const { runWithOrg } = require("./org-context");

const FLEXXFORMS_LOGIN_URL = "https://flexxforms.netlify.app/login";
const FLEXXFORMS_EMBED_BASE = "https://flexxforms.netlify.app/embed";
const ASSURANCE_FLEXXFORMS_ADMIN_EMAIL = "assuranceflex@eworkchop.com";

/** FlexxForms only posts flexxforms:resize to the parent when ?embed=1 is set. */
function buildFlexxFormsEmbedUrl(formId) {
  if (!formId) return null;
  const params = new URLSearchParams({ embed: "1" });
  return `${FLEXXFORMS_EMBED_BASE}/${encodeURIComponent(formId)}?${params.toString()}`;
}

function getApiBase() {
  return String(process.env.FLEXXFORMS_API_BASE || "https://flexxforms.netlify.app/api").replace(
    /\/$/,
    ""
  );
}

function getProvisioningSecret() {
  return String(process.env.FLEXXFORMS_PROVISIONING_SECRET || "").trim();
}

function isProvisioningConfigured() {
  const secret = getProvisioningSecret();
  return Boolean(secret && secret.length >= 32);
}

function resolveFlexxFormsAdminEmail(organization, sessionUser) {
  const slug = normalizeSlug(organization?.slug || organization?.organizationSlug);
  if (slug === ASSURANCE_SLUG) {
    return ASSURANCE_FLEXXFORMS_ADMIN_EMAIL;
  }
  const fromOrg = organization?.admin_email || organization?.adminEmail || "";
  if (fromOrg && String(fromOrg).includes("@")) {
    return String(fromOrg).trim().toLowerCase();
  }
  if (sessionUser?.role === "admin" && sessionUser?.email?.includes("@")) {
    return String(sessionUser.email).trim().toLowerCase();
  }
  return null;
}

function ensureFlexxFormsSchema(db) {
  const columns = db.prepare(`PRAGMA table_info(organizations)`).all();
  const names = new Set(columns.map((c) => c.name));
  const add = (sql) => {
    const col = sql.match(/ADD COLUMN (\w+)/i)?.[1];
    if (!col || names.has(col)) return;
    try {
      db.exec(`ALTER TABLE organizations ${sql}`);
      names.add(col);
    } catch (_) {
      /* column may exist */
    }
  };
  add(`ADD COLUMN flexxforms_tenant_id TEXT`);
  add(`ADD COLUMN flexxforms_api_key TEXT`);
  add(`ADD COLUMN flexxforms_webhook_secret TEXT`);
  add(`ADD COLUMN flexxforms_admin_email TEXT`);
  add(`ADD COLUMN membership_form_id TEXT`);
  add(`ADD COLUMN loan_form_id TEXT`);
  add(`ADD COLUMN guarantor_master_doc_id TEXT`);
  add(`ADD COLUMN borrower_master_doc_id TEXT`);
  add(`ADD COLUMN flexxforms_temp_password TEXT`);
  add(`ADD COLUMN flexxforms_provision_error TEXT`);
  add(`ADD COLUMN flexxforms_provisioned_at TEXT`);
}

function ensureLoanDocumentSchema(db) {
  const cols = db.prepare(`PRAGMA table_info(loans)`).all().map((c) => c.name);
  const add = (name, sql) => {
    if (cols.includes(name)) return;
    try {
      db.exec(`ALTER TABLE loans ${sql}`);
      cols.push(name);
    } catch (_) {}
  };
  add("guarantor_document_id", "ADD COLUMN guarantor_document_id TEXT");
  add("guarantor_sign_url", "ADD COLUMN guarantor_sign_url TEXT");
  add("guarantor_embed_url", "ADD COLUMN guarantor_embed_url TEXT");
  add("guarantor_doc_status", "ADD COLUMN guarantor_doc_status TEXT");
  add("borrower_document_id", "ADD COLUMN borrower_document_id TEXT");
  add("borrower_sign_url", "ADD COLUMN borrower_sign_url TEXT");
  add("borrower_embed_url", "ADD COLUMN borrower_embed_url TEXT");
  add("borrower_doc_status", "ADD COLUMN borrower_doc_status TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS flexxforms_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      flexxforms_submission_id TEXT,
      form_id TEXT,
      payload_json TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      member_id INTEGER,
      loan_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ff_apps_kind ON flexxforms_applications(kind, status);
  `);
}

function mapFlexxFormsRow(row) {
  if (!row) return null;
  return {
    tenantId: row.flexxforms_tenant_id || null,
    apiKey: row.flexxforms_api_key || null,
    webhookSecret: row.flexxforms_webhook_secret || null,
    adminEmail: row.flexxforms_admin_email || null,
    membershipFormId: row.membership_form_id || null,
    loanFormId: row.loan_form_id || null,
    guarantorMasterDocId: row.guarantor_master_doc_id || null,
    borrowerMasterDocId: row.borrower_master_doc_id || null,
    tempPassword: row.flexxforms_temp_password || null,
    provisionError: row.flexxforms_provision_error || null,
    provisionedAt: row.flexxforms_provisioned_at || null,
  };
}

function getOrganizationFlexxForms(slug) {
  const db = getRegistryDb();
  ensureFlexxFormsSchema(db);
  const normalized = normalizeSlug(slug);
  const row = db
    .prepare(
      `SELECT flexxforms_tenant_id, flexxforms_api_key, flexxforms_webhook_secret,
              flexxforms_admin_email, membership_form_id, loan_form_id,
              guarantor_master_doc_id, borrower_master_doc_id, flexxforms_temp_password,
              flexxforms_provision_error, flexxforms_provisioned_at
       FROM organizations WHERE slug = ?`
    )
    .get(normalized);
  return mapFlexxFormsRow(row);
}

function updateOrganizationFlexxForms(slug, fields) {
  const db = getRegistryDb();
  ensureFlexxFormsSchema(db);
  const normalized = normalizeSlug(slug);
  if (!getOrganization(normalized)) throw new Error("Organization not found");

  const allowed = {
    tenantId: "flexxforms_tenant_id",
    apiKey: "flexxforms_api_key",
    webhookSecret: "flexxforms_webhook_secret",
    adminEmail: "flexxforms_admin_email",
    membershipFormId: "membership_form_id",
    loanFormId: "loan_form_id",
    guarantorMasterDocId: "guarantor_master_doc_id",
    borrowerMasterDocId: "borrower_master_doc_id",
    tempPassword: "flexxforms_temp_password",
    provisionError: "flexxforms_provision_error",
    provisionedAt: "flexxforms_provisioned_at",
  };

  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(allowed)) {
    if (fields[key] !== undefined) {
      sets.push(`${column} = ?`);
      values.push(fields[key]);
    }
  }
  if (!sets.length) return getOrganizationFlexxForms(normalized);
  values.push(normalized);
  db.prepare(`UPDATE organizations SET ${sets.join(", ")} WHERE slug = ?`).run(...values);
  return getOrganizationFlexxForms(normalized);
}

function findOrganizationByWebhookSecret(secret) {
  if (!secret) return null;
  const db = getRegistryDb();
  ensureFlexxFormsSchema(db);
  const row = db
    .prepare(
      `SELECT slug FROM organizations WHERE flexxforms_webhook_secret = ? LIMIT 1`
    )
    .get(String(secret));
  return row ? getOrganization(row.slug) : null;
}

function findOrganizationByFlexxFormsTenantId(tenantId) {
  if (!tenantId) return null;
  const db = getRegistryDb();
  ensureFlexxFormsSchema(db);
  const row = db
    .prepare(`SELECT slug FROM organizations WHERE flexxforms_tenant_id = ? LIMIT 1`)
    .get(String(tenantId));
  return row ? getOrganization(row.slug) : null;
}

/** Safe for admin UI: never includes apiKey or webhookSecret. */
function getFlexxFormsAdminView(slug, { consumeTempPassword = false, sessionUser = null } = {}) {
  const org = getOrganization(slug);
  if (!org) return null;
  const ff = getOrganizationFlexxForms(slug) || {};
  let tempPassword = ff.tempPassword || null;
  if (consumeTempPassword && tempPassword) {
    updateOrganizationFlexxForms(slug, { tempPassword: null });
  }
  const resolvedAdminEmail = resolveFlexxFormsAdminEmail(org, sessionUser);
  return {
    organizationSlug: org.slug,
    organizationName: org.name,
    provisioned: Boolean(ff.tenantId && ff.apiKey),
    adminEmail: resolvedAdminEmail || ff.adminEmail || org.adminEmail || null,
    tempPassword,
    provisionError: ff.provisionError || null,
    provisionedAt: ff.provisionedAt || null,
    membershipFormId: ff.membershipFormId || null,
    loanFormId: ff.loanFormId || null,
    guarantorMasterDocId: ff.guarantorMasterDocId || null,
    borrowerMasterDocId: ff.borrowerMasterDocId || null,
    loginUrl: FLEXXFORMS_LOGIN_URL,
    embedBaseUrl: FLEXXFORMS_EMBED_BASE,
    membershipEmbedUrl: buildFlexxFormsEmbedUrl(ff.membershipFormId),
    loanEmbedUrl: buildFlexxFormsEmbedUrl(ff.loanFormId),
    publicApplyUrl: ff.membershipFormId
      ? `https://peer-finance-manager.netlify.app/c/${encodeURIComponent(org.slug)}/apply`
      : null,
    provisioningConfigured: isProvisioningConfigured(),
  };
}

/** Public embed config (no secrets). */
function getFlexxFormsPublicConfig(slug) {
  const view = getFlexxFormsAdminView(slug, { consumeTempPassword: false });
  if (!view) return null;
  return {
    organizationSlug: view.organizationSlug,
    organizationName: view.organizationName,
    membershipFormId: view.membershipFormId,
    loanFormId: view.loanFormId,
    membershipEmbedUrl: view.membershipEmbedUrl,
    loanEmbedUrl: view.loanEmbedUrl,
    embedBaseUrl: view.embedBaseUrl,
    publicApplyUrl: view.publicApplyUrl,
  };
}

async function flexxformsFetch(path, { method = "GET", apiKey, body, provisioning = false } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (provisioning) {
    const secret = getProvisioningSecret();
    if (!secret) throw new Error("FlexxForms provisioning is not configured on the server");
    headers.Authorization = `Bearer ${secret}`;
  } else if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const res = await fetch(`${getApiBase()}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = { raw: text };
  }
  if (!res.ok) {
    const message =
      data?.error || data?.message || data?.raw || `FlexxForms request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function applyEnsureResponse(slug, data, adminEmailOverride) {
  const current = getOrganizationFlexxForms(slug) || {};
  const ready = data?.readyToUse || data?.ready_to_use || {};
  const resolvedAdminEmail =
    adminEmailOverride ||
    data.email ||
    data.adminEmail ||
    data.admin_email ||
    null;
  const fields = {
    tenantId: data.tenantId || data.tenant_id || null,
    apiKey: data.apiKey || data.api_key || null,
    webhookSecret: data.webhookSecret || data.webhook_secret || null,
    adminEmail: resolvedAdminEmail
      ? String(resolvedAdminEmail).trim().toLowerCase()
      : current.adminEmail || null,
    provisionError: null,
    provisionedAt: new Date().toISOString(),
  };

  const readyMembership =
    ready.membershipFormId || ready.membership_form_id || data.membershipFormId || null;
  const readyLoan = ready.loanFormId || ready.loan_form_id || data.loanFormId || null;
  const readyGuarantor =
    ready.guarantorMasterDocId ||
    ready.guarantor_master_doc_id ||
    data.guarantorMasterDocId ||
    null;
  const readyBorrower =
    ready.borrowerMasterDocId ||
    ready.borrower_master_doc_id ||
    data.borrowerMasterDocId ||
    null;

  if (readyMembership && !current.membershipFormId) fields.membershipFormId = readyMembership;
  if (readyLoan && !current.loanFormId) fields.loanFormId = readyLoan;
  if (readyGuarantor && !current.guarantorMasterDocId) {
    fields.guarantorMasterDocId = readyGuarantor;
  }
  if (readyBorrower && !current.borrowerMasterDocId) {
    fields.borrowerMasterDocId = readyBorrower;
  }

  const tempPassword = data.temporaryPassword || data.temporary_password || null;
  if (tempPassword) fields.tempPassword = tempPassword;

  if (fields.adminEmail) {
    updateOrganizationAdminEmail(slug, fields.adminEmail, { onlyIfEmpty: true });
  }

  return updateOrganizationFlexxForms(slug, fields);
}

async function provisionFlexxFormsForOrganization(org, adminEmail, { fullName, organizationName } = {}) {
  const secret = getProvisioningSecret();
  if (!secret || secret.length < 32) {
    throw new Error("FlexxForms provisioning not configured");
  }
  const email = String(adminEmail || "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("Administrator email is required for FlexxForms setup");
  }

  const data = await flexxformsFetch("/platform/workspaces/ensure", {
    method: "POST",
    provisioning: true,
    body: {
      email,
      organizationName: organizationName || org.name,
      fullName: fullName || undefined,
      hostApp: "peer-finance-manager",
      externalId: String(org.id || org.slug),
      plan: "pro",
    },
  });

  applyEnsureResponse(org.slug, data, email);
  return getFlexxFormsAdminView(org.slug, { consumeTempPassword: false });
}

async function provisionOrganization(slug, { email, fullName, organizationName, sessionUser } = {}) {
  const org = getOrganization(slug);
  if (!org) throw new Error("Organization not found");
  const adminEmail =
    resolveFlexxFormsAdminEmail(org, sessionUser) ||
    (email ? String(email).trim().toLowerCase() : null);
  if (!adminEmail) {
    throw new Error("Administrator email is required for FlexxForms setup");
  }

  updateOrganizationAdminEmail(org.slug, adminEmail);
  return provisionFlexxFormsForOrganization(org, adminEmail, { fullName, organizationName });
}

async function retryProvision(slug, sessionUser) {
  const org = getOrganization(slug);
  if (!org) throw new Error("Organization not found");
  const email = resolveFlexxFormsAdminEmail(org, sessionUser);
  if (!email) {
    throw new Error("No FlexxForms admin email on file. Re-register or contact support.");
  }
  updateOrganizationAdminEmail(org.slug, email);
  try {
    return await provisionFlexxFormsForOrganization(org, email);
  } catch (err) {
    updateOrganizationFlexxForms(slug, { provisionError: err.message });
    throw err;
  }
}

async function listIntegrationForms(slug) {
  const ff = getOrganizationFlexxForms(slug);
  if (!ff?.apiKey) {
    throw new Error(
      "FlexxForms workspace is not connected yet. Click Retry FlexxForms Setup and wait for the Ready badge before loading forms."
    );
  }
  const data = await flexxformsFetch("/integrations/forms", { apiKey: ff.apiKey });
  return data?.forms || data?.items || data || [];
}

async function listIntegrationDocumentTemplates(slug) {
  const ff = getOrganizationFlexxForms(slug);
  if (!ff?.apiKey) {
    throw new Error(
      "FlexxForms workspace is not connected yet. Click Retry FlexxForms Setup and wait for the Ready badge before loading forms."
    );
  }
  const data = await flexxformsFetch("/integrations/documents/templates", { apiKey: ff.apiKey });
  return data?.templates || data?.items || [];
}

function parseFlexxFormsDocumentResponse(data) {
  const documentId = data?.documentId || data?.id || data?.document_id || null;
  const signingUrl = data?.signingUrl || data?.signing_url || data?.signUrl || data?.sign_url || null;
  const sessions = data?.signingSessions || data?.signing_sessions || [];
  const sessionUrl =
    sessions.map((s) => s?.signingUrl || s?.signing_url).find(Boolean) || null;
  const signUrl = signingUrl || sessionUrl;
  const embedUrl = data?.embedUrl || data?.embed_url || signUrl || null;
  return { documentId, signUrl, embedUrl };
}

function saveFormDocumentIds(slug, ids = {}) {
  const fields = {};
  for (const key of [
    "membershipFormId",
    "loanFormId",
    "guarantorMasterDocId",
    "borrowerMasterDocId",
  ]) {
    if (ids[key] !== undefined) {
      const value = String(ids[key] || "").trim();
      fields[key] = value || null;
    }
  }
  updateOrganizationFlexxForms(slug, fields);
  return getFlexxFormsAdminView(slug, { consumeTempPassword: false });
}

function mapLoanDocRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    borrowerId: row.borrower_id,
    guarantorDocumentId: row.guarantor_document_id || null,
    guarantorSignUrl: row.guarantor_sign_url || null,
    guarantorEmbedUrl: row.guarantor_embed_url || null,
    guarantorDocStatus: row.guarantor_doc_status || null,
    borrowerDocumentId: row.borrower_document_id || null,
    borrowerSignUrl: row.borrower_sign_url || null,
    borrowerEmbedUrl: row.borrower_embed_url || null,
    borrowerDocStatus: row.borrower_doc_status || null,
  };
}

function getLoanDocuments(loanId) {
  const db = getDb();
  ensureLoanDocumentSchema(db);
  const row = db
    .prepare(
      `SELECT id, borrower_id, guarantor_document_id, guarantor_sign_url, guarantor_embed_url,
              guarantor_doc_status, borrower_document_id, borrower_sign_url, borrower_embed_url,
              borrower_doc_status
       FROM loans WHERE id = ?`
    )
    .get(Number(loanId));
  return mapLoanDocRow(row);
}

async function createLoanAgreementDocument(slug, loanId, purpose) {
  if (purpose !== "guarantor" && purpose !== "borrower") {
    throw new Error("Purpose must be guarantor or borrower");
  }
  const ff = getOrganizationFlexxForms(slug);
  if (!ff?.apiKey) throw new Error("FlexxForms is not set up for this Cooperative yet");
  const masterId =
    purpose === "guarantor" ? ff.guarantorMasterDocId : ff.borrowerMasterDocId;
  if (!masterId) {
    throw new Error(
      purpose === "guarantor"
        ? "Set Guarantor Master Document Id in Manage Forms & Documents"
        : "Set Borrower Master Document Id in Manage Forms & Documents"
    );
  }

  const loan = getLoanDocuments(loanId);
  if (!loan) throw new Error("Loan not found");

  const data = await flexxformsFetch("/integrations/documents", {
    method: "POST",
    apiKey: ff.apiKey,
    body: {
      sourceDocumentId: masterId,
      metadata: {
        cooperativeId: slug,
        loanId: String(loanId),
        memberId: loan.borrowerId != null ? String(loan.borrowerId) : undefined,
        purpose,
      },
    },
  });

  const { documentId, signUrl, embedUrl } = parseFlexxFormsDocumentResponse(data);
  if (!documentId) throw new Error("FlexxForms did not return a document id");
  if (!embedUrl && !signUrl) {
    throw new Error("FlexxForms did not return a signing URL for this document");
  }
  const iframeUrl = embedUrl || signUrl;

  const db = getDb();
  ensureLoanDocumentSchema(db);
  if (purpose === "guarantor") {
    db.prepare(
      `UPDATE loans SET guarantor_document_id = ?, guarantor_sign_url = ?,
       guarantor_embed_url = ?, guarantor_doc_status = ? WHERE id = ?`
    ).run(documentId, signUrl, iframeUrl, "pending", Number(loanId));
  } else {
    db.prepare(
      `UPDATE loans SET borrower_document_id = ?, borrower_sign_url = ?,
       borrower_embed_url = ?, borrower_doc_status = ? WHERE id = ?`
    ).run(documentId, signUrl, iframeUrl, "pending", Number(loanId));
  }
  return getLoanDocuments(loanId);
}

function verifyWebhookSignature(rawBody, signatureHeader, timestampHeader, secret) {
  if (!secret || !signatureHeader || !timestampHeader) return false;
  const payload = `${timestampHeader}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const provided = String(signatureHeader).replace(/^sha256=/i, "").trim();
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(provided, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (_) {
    return expected === provided;
  }
}

function resolveWebhookOrganization(payload, headers, rawBody) {
  const meta = payload?.metadata || payload?.data?.metadata || {};
  const cooperativeId = meta.cooperativeId || meta.cooperative_id || payload?.cooperativeId;
  if (cooperativeId) {
    const org = getOrganization(cooperativeId);
    if (org) {
      const ff = getOrganizationFlexxForms(org.slug);
      const sig =
        headers["x-flexxforms-signature"] || headers["X-FlexxForms-Signature"];
      const ts =
        headers["x-flexxforms-timestamp"] || headers["X-FlexxForms-Timestamp"];
      if (ff?.webhookSecret && sig && ts) {
        if (!verifyWebhookSignature(rawBody, sig, ts, ff.webhookSecret)) {
          throw new Error("Invalid FlexxForms webhook signature");
        }
      }
      return org;
    }
  }

  const sig = headers["x-flexxforms-signature"] || headers["X-FlexxForms-Signature"];
  const ts = headers["x-flexxforms-timestamp"] || headers["X-FlexxForms-Timestamp"];
  if (sig && ts) {
    for (const org of listOrganizations()) {
      const ff = getOrganizationFlexxForms(org.slug);
      if (!ff?.webhookSecret) continue;
      if (verifyWebhookSignature(rawBody, sig, ts, ff.webhookSecret)) return org;
    }
  }

  const tenantId = payload?.tenantId || payload?.tenant_id || payload?.data?.tenantId;
  if (tenantId) {
    const org = findOrganizationByFlexxFormsTenantId(tenantId);
    if (org) return org;
  }

  return null;
}

function handleFormSubmitted(slug, payload) {
  return runWithOrg(slug, () => {
    const db = getDb();
    ensureLoanDocumentSchema(db);
    const data = payload?.data || payload;
    const formId = data.formId || data.form_id || payload.formId;
    const submissionId = data.id || data.submissionId || data.submission_id || null;
    const ff = getOrganizationFlexxForms(slug);
    let kind = "other";
    if (formId && ff?.membershipFormId && formId === ff.membershipFormId) kind = "membership";
    if (formId && ff?.loanFormId && formId === ff.loanFormId) kind = "loan";
    if (payload?.purpose === "membership" || data?.purpose === "membership") kind = "membership";
    if (payload?.purpose === "loan" || data?.purpose === "loan") kind = "loan";

    const insert = db.prepare(
      `INSERT INTO flexxforms_applications (kind, flexxforms_submission_id, form_id, payload_json, status)
       VALUES (?, ?, ?, ?, 'pending')`
    ).run(kind, submissionId, formId || null, JSON.stringify(payload));
    const applicationId = insert.lastInsertRowid;

    if (kind === "membership") {
      try {
        const {
          processMembershipFormSubmission,
          parseFlexxFormsMembershipPayload,
        } = require("./flexxforms-membership-service");
        const parsed = parseFlexxFormsMembershipPayload(payload);
        db.prepare(
          `UPDATE flexxforms_applications SET applicant_name = ?, applicant_email = ? WHERE id = ?`
        ).run(parsed.displayName || null, parsed.email || null, applicationId);
        const result = processMembershipFormSubmission(applicationId, payload);
        return { ok: true, kind, applicationId, ...result };
      } catch (err) {
        db.prepare(
          `UPDATE flexxforms_applications SET status = 'error', processing_error = ? WHERE id = ?`
        ).run(err.message, applicationId);
        return { ok: false, kind, applicationId, error: err.message };
      }
    }

    return { ok: true, kind, applicationId };
  });
}

function handleDocumentCompleted(slug, payload) {
  return runWithOrg(slug, () => {
    const db = getDb();
    ensureLoanDocumentSchema(db);
    const data = payload?.data || payload;
    const meta = data.metadata || payload?.metadata || {};
    const loanId = Number(meta.loanId || meta.loan_id);
    const purpose = meta.purpose;
    const documentId = data.id || data.documentId || data.document_id;
    if (!loanId) return { ok: false, reason: "missing loanId" };

    if (purpose === "guarantor" || (!purpose && documentId)) {
      const loan = getLoanDocuments(loanId);
      if (loan?.guarantorDocumentId && documentId && loan.guarantorDocumentId === documentId) {
        db.prepare(`UPDATE loans SET guarantor_doc_status = 'completed' WHERE id = ?`).run(loanId);
        return { ok: true, purpose: "guarantor", loanId };
      }
    }
    if (purpose === "borrower" || (!purpose && documentId)) {
      const loan = getLoanDocuments(loanId);
      if (loan?.borrowerDocumentId && documentId && loan.borrowerDocumentId === documentId) {
        db.prepare(`UPDATE loans SET borrower_doc_status = 'completed' WHERE id = ?`).run(loanId);
        return { ok: true, purpose: "borrower", loanId };
      }
    }
    if (purpose === "guarantor") {
      db.prepare(`UPDATE loans SET guarantor_doc_status = 'completed' WHERE id = ?`).run(loanId);
      return { ok: true, purpose: "guarantor", loanId };
    }
    if (purpose === "borrower") {
      db.prepare(`UPDATE loans SET borrower_doc_status = 'completed' WHERE id = ?`).run(loanId);
      return { ok: true, purpose: "borrower", loanId };
    }
    return { ok: false, reason: "unmatched document" };
  });
}

function handleWebhook(rawBody, headers) {
  const bodyText = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "");
  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch (_) {
    throw new Error("Invalid JSON body");
  }

  const org = resolveWebhookOrganization(payload, headers, bodyText);
  if (!org) throw new Error("Unknown Cooperative for FlexxForms webhook");

  const eventType =
    payload.type || payload.event || payload.eventType || payload.name || "";
  const normalized = String(eventType).toLowerCase();

  if (normalized.includes("form") && normalized.includes("submit")) {
    return { organizationSlug: org.slug, ...handleFormSubmitted(org.slug, payload) };
  }
  if (
    normalized.includes("document") &&
    (normalized.includes("complete") ||
      normalized.includes("signed") ||
      (normalized.includes("updated") &&
        (payload?.data?.status === "completed" || payload?.status === "completed")))
  ) {
    return { organizationSlug: org.slug, ...handleDocumentCompleted(org.slug, payload) };
  }

  // Fallback by payload shape
  if (payload.formId || payload.data?.formId || payload.submission) {
    return { organizationSlug: org.slug, ...handleFormSubmitted(org.slug, payload) };
  }
  if (payload.documentId || payload.data?.documentId || payload.data?.status === "completed") {
    return { organizationSlug: org.slug, ...handleDocumentCompleted(org.slug, payload) };
  }

  return { organizationSlug: org.slug, ok: true, ignored: true, eventType };
}

function listPendingApplications(slug) {
  return runWithOrg(slug, () => {
    const { listMembershipApplications } = require("./flexxforms-membership-service");
    return listMembershipApplications();
  });
}

module.exports = {
  FLEXXFORMS_LOGIN_URL,
  FLEXXFORMS_EMBED_BASE,
  isProvisioningConfigured,
  ensureFlexxFormsSchema,
  ensureLoanDocumentSchema,
  getOrganizationFlexxForms,
  updateOrganizationFlexxForms,
  getFlexxFormsAdminView,
  getFlexxFormsPublicConfig,
  resolveFlexxFormsAdminEmail,
  provisionFlexxFormsForOrganization,
  provisionOrganization,
  retryProvision,
  listIntegrationForms,
  listIntegrationDocumentTemplates,
  saveFormDocumentIds,
  getLoanDocuments,
  createLoanAgreementDocument,
  handleWebhook,
  listPendingApplications,
  findOrganizationByWebhookSecret,
  approveMembershipApplication: (slug, applicationId, userId) =>
    runWithOrg(slug, () => {
      const { approveMembershipApplication } = require("./flexxforms-membership-service");
      return approveMembershipApplication(applicationId, userId);
    }),
};
