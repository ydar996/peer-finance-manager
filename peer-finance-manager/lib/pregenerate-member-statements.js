const { getDb } = require("../db/database");
const { runWithOrg } = require("./org-context");
const { ASSURANCE_SLUG } = require("./organization-service");
const { trace } = require("./trace-log");
const {
  listMemberDepositStatementMonths,
  generateMemberDepositStatementPdf,
} = require("./member-deposit-statement");

async function pregenerateMemberDepositStatements(options = {}) {
  const orgSlug = options.orgSlug || ASSURANCE_SLUG;
  const force = Boolean(options.force);

  return runWithOrg(orgSlug, async () => {
    const { listActiveDirectoryMembers } = require("./membership-status-service");
    const members = listActiveDirectoryMembers();
    let generated = 0;
    let skipped = 0;
    let errors = 0;

    for (const member of members) {
      const months = listMemberDepositStatementMonths(member.id);
      for (const month of months) {
        try {
          const result = await generateMemberDepositStatementPdf(member.id, {
            year: month.year,
            month: month.month,
            forceGenerate: force,
          });
          if (result.reused) skipped += 1;
          else generated += 1;
        } catch (err) {
          errors += 1;
          trace.warn("Monthly deposit statement generation failed", {
            memberId: member.id,
            memberName: member.name,
            month: month.slug,
            error: err.message,
          });
        }
      }
    }

    trace.info("Deposit statement pre-generation complete", {
      orgSlug,
      members: members.length,
      generated,
      skipped,
      errors,
    });

    return { members: members.length, generated, skipped, errors };
  });
}

module.exports = { pregenerateMemberDepositStatements };
