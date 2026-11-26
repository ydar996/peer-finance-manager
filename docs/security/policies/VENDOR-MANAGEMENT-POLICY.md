# Vendor Management Policy

**Version:** 1.0 | **Effective:** 2026-11-26 | **Owner:** Platform Owner

## Register

All subprocessors are listed in SUBPROCESSORS.md with the data they touch
and DPA status.

## Onboarding A Vendor

1. Evaluate: what data will they process, where is it hosted, what are
   their security certifications (SOC 2, ISO 27001)?
2. Execute a DPA or accept their standard data-processing terms.
3. Add them to SUBPROCESSORS.md and DATA-INVENTORY.md.
4. Configure minimum necessary access and secrets.

## Annual Review

For each vendor: confirm their security posture (current SOC 2/ISO report
or public security page), confirm DPA still covers our use, and note the
review date in SUBPROCESSORS.md. Vendors that lose certification or suffer
a public breach trigger an immediate risk-register entry.

## Offboarding

On vendor removal: revoke API keys/secrets, export needed data, confirm
deletion per their retention terms, and update both registers.
