# PRD: Scenario-aware preflight

Issue: #23. Priority: first onboarding foundation.

## Problem and outcome

Missing tools and unwritable destinations should block generation before any
project files or setup subprocesses are created.

## Requirements

- Resolve the scenario and interactive options first; preserve side-effect-free
  dry-run behavior without requiring local tools.
- Check Node >=20, npm, destination safety and write/traverse access on the nearest
  existing directory. Check Git only when requested.
- Require Docker and Compose only for Cosmos emulator storage; require azd only
  for deployment, not for local context linking.
- The mock/in-memory default needs no Docker, Azure tools, cloud credentials,
  model credentials, or network access.
- Never install tools, authenticate, probe services, or provision during inspection.
  Report daemon/image compatibility and live Azure readiness as manual warnings.
- Bound executable checks to ten seconds and suppress potentially sensitive tool
  output. Offer platform-specific installation guidance.

## Output contract

Generation JSON adds `preflight: { ready, findings }`. Each finding contains a
stable `PREFLIGHT_*` code, severity, message, and remediation. Blockers return
exit 1 with `status: "blocked"` and do not write files. Human output reports the
same findings before generation. Existing successful fields remain unchanged.

## Verification

Unit tests cover Windows/macOS/Linux tool invocation and remediation, missing
tools, permission failures, conditional checks, warnings, and no-write blocking.
CLI tests verify existing local creation and bootstrap behavior.

## Boundaries

This is not a guarantee of live service availability or Docker image support.
Existing doctor and prepare-azure remain responsible for generated-project and
cloud configuration checks. Access checks cannot eliminate filesystem races;
normal filesystem errors still propagate from generation.
