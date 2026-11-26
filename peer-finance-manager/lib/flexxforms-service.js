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
const FLEXXFORMS_PUBLIC_FORM_BASE = "https://flexxforms.netlify.app/p";
const ASSURANCE_FLEXXFORMS_ADMIN_EMAIL = "assuranceflex@eworkchop.com";

/** Public respondent URL: /p/{formId} (embed.js uses data-form-path="p"). */
function buildFlexxFormsEmbedUrl(formId) {
  if (!formId) return null;
  return `${FLEXXFORMS_PUBLIC_FORM_BASE}/${encodeURIComponent(formId)}`;
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
  add(`ADD COLUMN loan_docs_auto_issue INTEGER NOT NULL DEFAULT 0`);
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

    CREATE TABLE IF NOT EXISTS loan_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      application_id INTEGER,
      kind TEXT NOT NULL,
      guarantor_member_id INTEGER,
      guarantor_name TEXT,
      flexxforms_document_id TEXT,
      sign_url TEXT,
      embed_url TEXT,
      signers_json TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      UNIQUE(loan_id, kind, guarantor_member_id)
    );
    CREATE INDEX IF NOT EXISTS idx_loan_docs_loan ON loan_documents(loan_id);
    CREATE INDEX IF NOT EXISTS idx_loan_docs_doc ON loan_documents(flexxforms_document_id);
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
    autoIssueLoanDocs: Number(row.loan_docs_auto_issue) === 1,
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
              flexxforms_provision_error, flexxforms_provisioned_at, loan_docs_auto_issue
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
    autoIssueLoanDocs: "loan_docs_auto_issue",
  };

  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(allowed)) {
    if (fields[key] !== undefined) {
      sets.push(`${column} = ?`);
      values.push(column === "loan_docs_auto_issue" ? (fields[key] ? 1 : 0) : fields[key]);
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
    // Boolean only: the secret value itself never leaves the server.
    webhookSecured: Boolean(ff.webhookSecret),
    adminEmail: resolvedAdminEmail || ff.adminEmail || org.adminEmail || null,
    tempPassword,
    provisionError: ff.provisionError || null,
    provisionedAt: ff.provisionedAt || null,
    membershipFormId: ff.membershipFormId || null,
    loanFormId: ff.loanFormId || null,
    guarantorMasterDocId: ff.guarantorMasterDocId || null,
    borrowerMasterDocId: ff.borrowerMasterDocId || null,
    autoIssueLoanDocs: ff.autoIssueLoanDocs === true,
    loginUrl: FLEXXFORMS_LOGIN_URL,
    embedBaseUrl: FLEXXFORMS_EMBED_BASE,
    membershipEmbedUrl: buildFlexxFormsEmbedUrl(ff.membershipFormId),
    loanEmbedUrl: buildFlexxFormsEmbedUrl(ff.loanFormId),
    publicApplyUrl: ff.membershipFormId
      ? `/c/${encodeURIComponent(org.slug)}/apply`
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
  const view = getFlexxFormsAdminView(org.slug, { consumeTempPassword: false });
  // Fresh one-time sign-in link issued on every ensure call; surfaced in the
  // retry response only (never persisted), for admins who never saw the
  // initial temporary password.
  if (data?.magicLinkUrl) view.magicLinkUrl = data.magicLinkUrl;
  return view;
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
  const signers = Array.isArray(data?.signers)
    ? data.signers.map((s) => ({
        id: s?.id || null,
        label: s?.label || s?.role || s?.name || null,
        name: s?.name || null,
        email: s?.email || null,
        memberId: s?.memberId != null ? Number(s.memberId) : null,
        signingUrl: s?.signingUrl || s?.signing_url || null,
      }))
    : [];
  return { documentId, signUrl, embedUrl, signers, signingStatus: data?.signingStatus || null };
}

function memberSignerInfo(memberId) {
  const id = Number(memberId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT m.id AS memberId,
              COALESCE(NULLIF(TRIM(mp.display_name), ''), m.name) AS name,
              COALESCE(NULLIF(TRIM(mp.email), ''), NULLIF(TRIM(u.email), '')) AS email
       FROM members m
       LEFT JOIN member_profiles mp ON mp.member_id = m.id
       LEFT JOIN users u ON u.member_id = m.id AND u.active = 1
       WHERE m.id = ?`
    )
    .get(id);
  if (!row) return null;
  return { memberId: row.memberId, name: row.name || "Member", email: row.email || "" };
}

function excoSignerInfo(slug, sessionUser) {
  const org = getOrganization(slug);
  const email =
    resolveFlexxFormsAdminEmail(org, sessionUser) ||
    sessionUser?.email ||
    org?.adminEmail ||
    org?.admin_email ||
    "";
  const name =
    sessionUser?.displayName ||
    sessionUser?.display_name ||
    sessionUser?.username ||
    org?.name ||
    "Cooperative Representative";
  return { label: "Cooperative Representative", name, email: String(email || "").trim() };
}

function listLoanDocumentRows(loanId) {
  const db = getDb();
  ensureLoanDocumentSchema(db);
  try {
    return db
      .prepare(
        `SELECT id, loan_id, application_id, kind, guarantor_member_id, guarantor_name,
                flexxforms_document_id, sign_url, embed_url, signers_json, status,
                created_at, completed_at
         FROM loan_documents WHERE loan_id = ? ORDER BY id ASC`
      )
      .all(Number(loanId))
      .map((row) => ({
        id: row.id,
        loanId: row.loan_id,
        applicationId: row.application_id,
        kind: row.kind,
        guarantorMemberId: row.guarantor_member_id,
        guarantorName: row.guarantor_name,
        documentId: row.flexxforms_document_id,
        signUrl: row.sign_url,
        embedUrl: row.embed_url,
        signers: (() => {
          try {
            return JSON.parse(row.signers_json || "[]");
          } catch {
            return [];
          }
        })(),
        status: row.status,
        createdAt: row.created_at,
        completedAt: row.completed_at,
      }));
  } catch (_) {
    return [];
  }
}

function syncLoanDocumentLegacyColumns(db, loanId) {
  const docs = listLoanDocumentRows(loanId);
  const borrowerDoc = docs.find((d) => d.kind === "borrower");
  const guarantorDocs = docs.filter((d) => d.kind === "guarantor");
  const firstGuarantor = guarantorDocs[0];
  const allGuarantorComplete =
    guarantorDocs.length > 0 && guarantorDocs.every((d) => d.status === "completed");
  const guarantorStatus = firstGuarantor
    ? allGuarantorComplete
      ? "completed"
      : guarantorDocs.some((d) => d.status === "completed")
        ? "partially_signed"
        : "pending"
    : null;
  db.prepare(
    `UPDATE loans SET
       borrower_document_id = COALESCE(?, borrower_document_id),
       borrower_sign_url = COALESCE(?, borrower_sign_url),
       borrower_embed_url = COALESCE(?, borrower_embed_url),
       borrower_doc_status = COALESCE(?, borrower_doc_status),
       guarantor_document_id = COALESCE(?, guarantor_document_id),
       guarantor_sign_url = COALESCE(?, guarantor_sign_url),
       guarantor_embed_url = COALESCE(?, guarantor_embed_url),
       guarantor_doc_status = COALESCE(?, guarantor_doc_status)
     WHERE id = ?`
  ).run(
    borrowerDoc?.documentId || null,
    borrowerDoc?.signUrl || null,
    borrowerDoc?.embedUrl || null,
    borrowerDoc?.status || null,
    firstGuarantor?.documentId || null,
    firstGuarantor?.signUrl || null,
    firstGuarantor?.embedUrl || null,
    guarantorStatus,
    Number(loanId)
  );
}

function loanDocRequirements(slug, loan) {
  const ff = getOrganizationFlexxForms(slug) || {};
  const issued = loan ? listLoanDocumentRows(loan.id) : [];
  const required = [];
  if (ff.borrowerMasterDocId || issued.some((d) => d.kind === "borrower")) {
    required.push({ kind: "borrower", guarantorMemberId: null, label: "Personal Loan Agreement" });
  }
  const guarantorIds = [loan?.guarantor1Id, loan?.guarantor2Id]
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  const seen = new Set();
  for (const gid of guarantorIds) {
    if (seen.has(gid)) continue;
    seen.add(gid);
    const issuedRow = issued.find((d) => d.kind === "guarantor" && d.guarantorMemberId === gid);
    if (ff.guarantorMasterDocId || issuedRow) {
      const member = memberSignerInfo(gid);
      required.push({
        kind: "guarantor",
        guarantorMemberId: gid,
        guarantorName: member?.name || issuedRow?.guarantorName || null,
        label: "Personal Loan Guaranty",
      });
    }
  }
  return { required, issued };
}

function getLoanRowForDocs(loanId) {
  const db = getDb();
  ensureLoanDocumentSchema(db);
  const row = db
    .prepare(
      `SELECT id, borrower_id AS borrowerId, guarantor1_id AS guarantor1Id,
              guarantor2_id AS guarantor2Id
       FROM loans WHERE id = ?`
    )
    .get(Number(loanId));
  if (!row) return null;
  return { id: row.id, borrowerId: row.borrowerId, guarantor1Id: row.guarantor1Id, guarantor2Id: row.guarantor2Id };
}

function computeLoanSigningState(slug, loanId) {
  const loan = getLoanRowForDocs(loanId);
  if (!loan) return null;
  const { required, issued } = loanDocRequirements(slug, loan);
  const docFor = (req) =>
    required
      .filter((r) => r.kind === req.kind && (r.guarantorMemberId == null || r.guarantorMemberId === req.guarantorMemberId))
      .map((r) => ({
        ...r,
        document: issued.find(
          (d) => d.kind === r.kind && (r.kind === "borrower" || Number(d.guarantorMemberId) === Number(r.guarantorMemberId))
        ) || null,
      }));
  const checklist = required.map((req) => {
    const doc = issued.find(
      (d) => d.kind === req.kind && (req.kind === "borrower" || Number(d.guarantorMemberId) === Number(req.guarantorMemberId))
    );
    return { ...req, document: doc || null, done: doc?.status === "completed" };
  });
  const missing = checklist.filter((c) => !c.document);
  const unsigned = checklist.filter((c) => c.document && c.document.status !== "completed");
  const allSigned = checklist.length > 0 && checklist.every((c) => c.done);
  const stage =
    checklist.length === 0
      ? "documents_not_required"
      : missing.length > 0
        ? "awaiting_documents"
        : unsigned.length > 0
          ? "awaiting_signatures"
          : "ready_for_disbursement";
  return {
    loanId: Number(loanId),
    required: checklist,
    documents: issued,
    missingCount: missing.length,
    pendingSignatureCount: unsigned.length,
    allSigned,
    documentsRequired: checklist.length > 0,
    stage,
  };
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
  if (ids.autoIssueLoanDocs !== undefined) {
    fields.autoIssueLoanDocs = ids.autoIssueLoanDocs === true || ids.autoIssueLoanDocs === "true" || ids.autoIssueLoanDocs === 1;
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

function getLoanDocuments(loanId, slug = null) {
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
  const mapped = mapLoanDocRow(row);
  if (!mapped) return null;
  const orgSlug = slug || getOrgSlugOrNull();
  const signing = orgSlug ? computeLoanSigningState(orgSlug, loanId) : null;
  return { ...mapped, loanDocuments: listLoanDocumentRows(loanId), signing };
}

function buildDocSigners({ purpose, loan, slug, sessionUser, guarantorMemberId }) {
  const signers = [];
  if (purpose === "borrower") {
    const borrower = memberSignerInfo(loan.borrowerId);
    signers.push({
      role: "Borrower",
      name: borrower?.name || "Borrower",
      email: borrower?.email || "",
      memberId: borrower?.memberId ?? loan.borrowerId ?? null,
    });
  } else {
    const guarantor = memberSignerInfo(guarantorMemberId);
    signers.push({
      role: "Guarantor",
      name: guarantor?.name || "Guarantor",
      email: guarantor?.email || "",
      memberId: guarantor?.memberId ?? guarantorMemberId ?? null,
    });
  }
  const exco = excoSignerInfo(slug, sessionUser);
  signers.push({ role: exco.label, name: exco.name, email: exco.email });
  return signers;
}

async function issueLoanDocument(slug, loan, purpose, { sessionUser, guarantorMemberId = null, applicationId = null } = {}) {
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
  const db = getDb();
  ensureLoanDocumentSchema(db);
  if (applicationId == null) {
    try {
      const appRow = db
        .prepare(
          `SELECT id FROM flexxforms_applications
           WHERE loan_id = ? AND kind = 'loan' ORDER BY id DESC LIMIT 1`
        )
        .get(loan.id);
      if (appRow) applicationId = Number(appRow.id);
    } catch (_) {}
  }
  const signers = buildDocSigners({ purpose, loan, slug, sessionUser, guarantorMemberId });
  const guarantor = purpose === "guarantor" ? memberSignerInfo(guarantorMemberId) : null;
  const data = await flexxformsFetch("/integrations/documents", {
    method: "POST",
    apiKey: ff.apiKey,
    body: {
      sourceDocumentId: masterId,
      signers,
      metadata: {
        cooperativeId: slug,
        loanId: String(loan.id),
        applicationId: applicationId != null ? String(applicationId) : undefined,
        memberId: loan.borrowerId != null ? String(loan.borrowerId) : undefined,
        guarantorMemberId:
          guarantorMemberId != null ? String(guarantorMemberId) : undefined,
        purpose,
      },
    },
  });
  const { documentId, signUrl, embedUrl, signers: signerUrls } =
    parseFlexxFormsDocumentResponse(data);
  if (!documentId) throw new Error("FlexxForms did not return a document id");
  if (!embedUrl && !signUrl && !signerUrls.length) {
    throw new Error("FlexxForms did not return a signing URL for this document");
  }
  const storedSigners = signerUrls.map((s, i) => ({
    ...s,
    memberId: signers[i]?.memberId ?? s.memberId ?? null,
  }));
  const iframeUrl = embedUrl || signUrl || null;
  db.prepare(
    `INSERT INTO loan_documents
       (loan_id, application_id, kind, guarantor_member_id, guarantor_name,
        flexxforms_document_id, sign_url, embed_url, signers_json, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
     ON CONFLICT(loan_id, kind, guarantor_member_id) DO UPDATE SET
       application_id = excluded.application_id,
       guarantor_name = excluded.guarantor_name,
       flexxforms_document_id = excluded.flexxforms_document_id,
       sign_url = excluded.sign_url,
       embed_url = excluded.embed_url,
       signers_json = excluded.signers_json,
       status = 'pending',
       completed_at = NULL`
  ).run(
    loan.id,
    applicationId != null ? Number(applicationId) : null,
    purpose,
    purpose === "guarantor" ? Number(guarantorMemberId) : null,
    purpose === "guarantor" ? guarantor?.name || null : null,
    documentId,
    signUrl || signerUrls[0]?.signingUrl || null,
    iframeUrl,
    JSON.stringify(storedSigners)
  );
  syncLoanDocumentLegacyColumns(db, loan.id);
  return { documentId, signUrl: signUrl || signerUrls[0]?.signingUrl || null, embedUrl: iframeUrl, signers: signerUrls };
}

async function createLoanAgreementDocument(slug, loanId, purpose, { sessionUser = null, guarantorMemberId = null, applicationId = null } = {}) {
  if (!["guarantor", "borrower", "all"].includes(purpose)) {
    throw new Error("Purpose must be guarantor, borrower, or all");
  }
  const loan = getLoanRowForDocs(loanId);
  if (!loan) throw new Error("Loan not found");

  const results = [];
  if (purpose === "borrower" || purpose === "all") {
    results.push(await issueLoanDocument(slug, loan, "borrower", { sessionUser, applicationId }));
  }
  if (purpose === "guarantor") {
    if (guarantorMemberId != null) {
      results.push(
        await issueLoanDocument(slug, loan, "guarantor", { sessionUser, guarantorMemberId, applicationId })
      );
    } else {
      const ids = [...new Set(
        [loan.guarantor1Id, loan.guarantor2Id]
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0)
      )];
      if (!ids.length) throw new Error("This loan has no guarantors recorded");
      for (const gid of ids) {
        results.push(
          await issueLoanDocument(slug, loan, "guarantor", { sessionUser, guarantorMemberId: gid, applicationId })
        );
      }
    }
  }
  if (purpose === "all") {
    const ids = [...new Set(
      [loan.guarantor1Id, loan.guarantor2Id]
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )];
    const { issued } = loanDocRequirements(slug, loan);
    for (const gid of ids) {
      const existing = issued.find(
        (d) => d.kind === "guarantor" && Number(d.guarantorMemberId) === gid
      );
      if (existing?.status === "completed") continue;
      results.push(
        await issueLoanDocument(slug, loan, "guarantor", { sessionUser, guarantorMemberId: gid, applicationId })
      );
    }
  }
  return getLoanDocuments(loanId, slug);
}

function verifyWebhookSignature(rawBody, signatureHeader, timestampHeader, secret) {
  if (!secret || !signatureHeader || !timestampHeader) return false;
  // Reject stale timestamps: the signature covers `ts.body`, so without a
  // freshness window a captured payload could be replayed indefinitely.
  const tsValue = String(timestampHeader).trim();
  let tsMs = /^\d+$/.test(tsValue)
    ? Number(tsValue) * (tsValue.length <= 10 ? 1000 : 1)
    : Date.parse(tsValue);
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
    return false;
  }
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

/**
 * Enforces webhook authentication for a resolved organization.
 * Every webhook must carry a valid, fresh HMAC signature against the org's
 * webhookSecret. Orgs without a configured secret cannot verify senders, so
 * their webhooks are rejected outright — re-running FlexxForms provisioning
 * (Retry FlexxForms Setup) stores a fresh secret and restores ingestion.
 */
function assertWebhookAuthentic(org, headers, rawBody) {
  const ff = getOrganizationFlexxForms(org.slug);
  if (!ff?.webhookSecret) {
    console.warn(
      `[flexxforms-webhook] rejected webhook for ${org.slug}: no webhook secret configured`
    );
    throw new Error("FlexxForms webhook secret is not configured for this Cooperative");
  }
  const sig =
    headers["x-flexxforms-signature"] || headers["X-FlexxForms-Signature"];
  const ts =
    headers["x-flexxforms-timestamp"] || headers["X-FlexxForms-Timestamp"];
  if (!sig || !ts || !verifyWebhookSignature(rawBody, sig, ts, ff.webhookSecret)) {
    throw new Error("Invalid FlexxForms webhook signature");
  }
}

function resolveWebhookOrganization(payload, headers, rawBody) {
  const meta = payload?.metadata || payload?.data?.metadata || {};
  const cooperativeId = meta.cooperativeId || meta.cooperative_id || payload?.cooperativeId;
  if (cooperativeId) {
    const org = getOrganization(cooperativeId);
    if (org) {
      assertWebhookAuthentic(org, headers, rawBody);
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
    // Signed request matched no known secret: reject rather than fall through
    // to unauthenticated resolution paths.
    throw new Error("Invalid FlexxForms webhook signature");
  }

  const tenantId = payload?.tenantId || payload?.tenant_id || payload?.data?.tenantId;
  if (tenantId) {
    const org = findOrganizationByFlexxFormsTenantId(tenantId);
    if (org) {
      assertWebhookAuthentic(org, headers, rawBody);
      return org;
    }
  }

  return null;
}

async function fetchFlexxFormsSubmissionDetail(slug, submissionId, formId) {
  if (!submissionId) return null;
  const ff = getOrganizationFlexxForms(slug);
  if (!ff?.apiKey) return null;
  const resolvedFormId = formId || ff.membershipFormId;
  if (!resolvedFormId) return null;

  const detailPath = `/integrations/forms/${encodeURIComponent(resolvedFormId)}/submissions/${encodeURIComponent(submissionId)}`;
  try {
    const data = await flexxformsFetch(detailPath, { apiKey: ff.apiKey });
    if (data) return data;
  } catch (_) {}

  try {
    const list = await flexxformsFetch(
      `/integrations/forms/${encodeURIComponent(resolvedFormId)}/submissions?limit=50`,
      { apiKey: ff.apiKey }
    );
    const items = list?.submissions || list?.items || (Array.isArray(list) ? list : []);
    return (
      items.find(
        (row) => String(row.id || row.submissionId || row.submission_id) === String(submissionId)
      ) || null
    );
  } catch (_) {}
  return null;
}

async function enrichMembershipSubmissionPayload(slug, payload) {
  const {
    diagnoseMembershipPayload,
    mergeSubmissionPayload,
  } = require("./flexxforms-membership-service");
  const initial = diagnoseMembershipPayload(payload);
  if (initial.hasFlexxFormsAnswers) return { payload, fetched: false, diagnosis: initial };

  const data = payload?.data || payload;
  const submissionId =
    data?.id ||
    data?.submissionId ||
    data?.submission_id ||
    payload?.submissionId ||
    payload?.submission_id ||
    null;
  const formId =
    data?.formId ||
    data?.form_id ||
    payload?.formId ||
    getOrganizationFlexxForms(slug)?.membershipFormId ||
    null;
  const fetched = await fetchFlexxFormsSubmissionDetail(slug, submissionId, formId);
  if (!fetched) {
    return { payload, fetched: false, diagnosis: initial };
  }

  const merged = mergeSubmissionPayload(payload, fetched);
  const diagnosis = diagnoseMembershipPayload(merged);
  return { payload: merged, fetched: true, diagnosis };
}

async function reprocessMembershipApplicationWithFetch(slug, applicationId) {
  const { runWithOrg } = require("./org-context");
  return runWithOrg(slug, async () => {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT id, payload_json AS payloadJson, flexxforms_submission_id AS submissionId, form_id AS formId
         FROM flexxforms_applications WHERE id = ?`
      )
      .get(applicationId);
    if (!row) throw new Error("Application not found");

    let payload = row.payloadJson ? JSON.parse(row.payloadJson) : {};
    const enrich = await enrichMembershipSubmissionPayload(slug, payload);
    payload = enrich.payload;

    const { reprocessMembershipApplication, assertReliableSubmissionPayload, diagnoseMembershipPayload } =
      require("./flexxforms-membership-service");
    assertReliableSubmissionPayload(diagnoseMembershipPayload(payload), {
      fetchedFromApi: enrich.fetched,
    });

    const result = reprocessMembershipApplication(applicationId, payload);
    return {
      ...result,
      fetchedFromApi: enrich.fetched,
      diagnosis: result.diagnosis || enrich.diagnosis,
    };
  });
}

async function handleFormSubmitted(slug, payload) {
  const enrich = await enrichMembershipSubmissionPayload(slug, payload);
  payload = enrich.payload;

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
          assertReliableSubmissionPayload,
          diagnoseMembershipPayload,
        } = require("./flexxforms-membership-service");
        assertReliableSubmissionPayload(diagnoseMembershipPayload(payload), {
          fetchedFromApi: enrich.fetched,
        });
        const parsed = parseFlexxFormsMembershipPayload(payload);
        db.prepare(
          `UPDATE flexxforms_applications SET applicant_name = ?, applicant_email = ? WHERE id = ?`
        ).run(parsed.displayName || null, parsed.email || null, applicationId);
        const result = processMembershipFormSubmission(applicationId, payload);
        try {
          const { notifyAdminsOfMembershipApplication } = require("./messaging-service");
          notifyAdminsOfMembershipApplication({
            applicationId,
            applicantName: parsed.displayName,
            applicantEmail: parsed.email,
            status: result?.status || "pending",
          });
        } catch (_) {
          /* notice is best-effort */
        }
        try {
          const { emailApplicantApplicationReceived } = require("./membership-application-notify");
          emailApplicantApplicationReceived({
            to: parsed.email,
            memberName: parsed.displayName,
          }).catch(() => {});
        } catch (_) {
          /* applicant email is best-effort */
        }
        return {
          ok: true,
          kind,
          applicationId,
          fetchedFromApi: enrich.fetched,
          ...result,
        };
      } catch (err) {
        db.prepare(
          `UPDATE flexxforms_applications SET status = 'error', processing_error = ? WHERE id = ?`
        ).run(err.message, applicationId);
        try {
          const { notifyAdminsOfMembershipApplication } = require("./messaging-service");
          const nameGuess =
            db
              .prepare(`SELECT applicant_name, applicant_email FROM flexxforms_applications WHERE id = ?`)
              .get(applicationId) || {};
          notifyAdminsOfMembershipApplication({
            applicationId,
            applicantName: nameGuess.applicant_name || "Applicant",
            applicantEmail: nameGuess.applicant_email || null,
            status: "error",
            processingError: err.message,
          });
        } catch (_) {
          /* notice is best-effort */
        }
        return { ok: false, kind, applicationId, error: err.message };
      }
    }

    if (kind === "loan") {
      try {
        const { processLoanFormSubmission, parseFlexxFormsLoanPayload } = require(
          "./flexxforms-loan-service"
        );
        const parsed = parseFlexxFormsLoanPayload(payload);
        db.prepare(
          `UPDATE flexxforms_applications SET applicant_name = ?, applicant_email = ? WHERE id = ?`
        ).run(parsed.applicantName || null, parsed.email || null, applicationId);
        const result = processLoanFormSubmission(applicationId, payload);
        return {
          ok: true,
          kind,
          applicationId,
          fetchedFromApi: enrich.fetched,
          ...result,
        };
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

    if (documentId) {
      const docRow = db
        .prepare(
          `SELECT id FROM loan_documents
           WHERE loan_id = ? AND flexxforms_document_id = ? LIMIT 1`
        )
        .get(loanId, String(documentId));
      if (docRow) {
        db.prepare(
          `UPDATE loan_documents
           SET status = 'completed', completed_at = datetime('now')
           WHERE id = ?`
        ).run(docRow.id);
        syncLoanDocumentLegacyColumns(db, loanId);
        return { ok: true, purpose, loanId, loanDocumentId: docRow.id };
      }
    }

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

async function refreshLoanDocumentStatuses(slug, loanId) {
  const ff = getOrganizationFlexxForms(slug);
  if (!ff?.apiKey) return { refreshed: 0 };
  const docs = listLoanDocumentRows(loanId).filter(
    (d) => d.documentId && d.status !== "completed"
  );
  if (!docs.length) return { refreshed: 0 };
  const db = getDb();
  ensureLoanDocumentSchema(db);
  let refreshed = 0;
  for (const doc of docs) {
    try {
      const data = await flexxformsFetch(
        `/integrations/documents/${encodeURIComponent(doc.documentId)}`,
        { apiKey: ff.apiKey }
      );
      const status = data?.signingStatus || data?.status || null;
      const signers = Array.isArray(data?.signers)
        ? data.signers.map((s) => ({
            id: s?.id || null,
            label: s?.label || s?.role || s?.name || null,
            name: s?.name || null,
            email: s?.email || null,
            signingUrl: s?.signingUrl || s?.signing_url || null,
          }))
        : null;
      const next = status === "completed" ? "completed" : status === "partially_signed" ? "partially_signed" : "pending";
      db.prepare(
        `UPDATE loan_documents
         SET status = ?, signers_json = COALESCE(?, signers_json),
             completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, datetime('now')) ELSE completed_at END
         WHERE id = ?`
      ).run(next, signers ? JSON.stringify(signers) : null, next, doc.id);
      refreshed += 1;
    } catch (_) {
      /* best-effort per document */
    }
  }
  if (refreshed > 0) syncLoanDocumentLegacyColumns(db, Number(loanId));
  return { refreshed };
}

async function issueAllLoanDocuments(slug, loanId, { sessionUser = null, applicationId = null } = {}) {
  const result = await createLoanAgreementDocument(slug, loanId, "all", {
    sessionUser,
    applicationId,
  });
  return { ok: true, documents: result };
}

async function maybeAutoIssueLoanDocuments(slug, loanId, { sessionUser = null, applicationId = null } = {}) {
  const ff = getOrganizationFlexxForms(slug);
  if (!ff?.autoIssueLoanDocs || !ff?.apiKey) return { issued: false };
  try {
    const out = await issueAllLoanDocuments(slug, loanId, { sessionUser, applicationId });
    return { issued: true, documents: out.documents };
  } catch (err) {
    return { issued: false, error: err.message };
  }
}

async function handleWebhook(rawBody, headers) {
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
    return { organizationSlug: org.slug, ...(await handleFormSubmitted(org.slug, payload)) };
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
    return { organizationSlug: org.slug, ...(await handleFormSubmitted(org.slug, payload)) };
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

function summarizePendingApplications(slug) {
  return runWithOrg(slug, () => {
    const { summarizeMembershipApplications } = require("./flexxforms-membership-service");
    return summarizeMembershipApplications();
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
  issueAllLoanDocuments,
  maybeAutoIssueLoanDocuments,
  refreshLoanDocumentStatuses,
  computeLoanSigningState,
  listLoanDocumentRows,
  handleWebhook,
  reprocessMembershipApplicationWithFetch,
  listPendingApplications,
  summarizePendingApplications,
  findOrganizationByWebhookSecret,
  approveMembershipApplication: async (slug, applicationId, userId) =>
    runWithOrg(slug, () => {
      const { approveMembershipApplication } = require("./flexxforms-membership-service");
      return approveMembershipApplication(applicationId, userId);
    }),
  verifyMembershipDeposits: async (slug, applicationId, options) =>
    runWithOrg(slug, () => {
      const { verifyMembershipDeposits } = require("./flexxforms-membership-service");
      return verifyMembershipDeposits(applicationId, options);
    }),
};
