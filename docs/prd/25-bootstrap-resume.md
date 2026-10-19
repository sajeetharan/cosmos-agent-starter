# PRD: Safe bootstrap recovery

Issue: #25.

## Outcome

`resume-bootstrap [project] [--json]` resumes recorded setup without calling the
generator, modifying source/.env, or replacing Git history. Every new bootstrap
records a versioned `.cosmos-agent/bootstrap.json` journal before launching each
stage and atomically replaces that journal on completion/failure. A process killed
mid-stage leaves its active stage for the next invocation to inspect.

## Requirements

- Failures identify the stage, completed stages, and a shell-quoted recovery
  command. Human progress includes stage elapsed time, not guessed percentages.
- Validate generated files, the runtime manifest schema, recovery metadata, and
  scenario agreement before resuming. Recheck applicable prerequisites.
- Revalidate completed dependencies using npm ls; repair missing/stale installs.
  Verify existing Git metadata and skip init when valid. Reject invalid/conflicting
  context instead of overwriting it. Previously skipped options remain skipped.
- Keep the journal credential-free: store only stage names, safe setup booleans,
  template and environment name. Do not persist model/identity credentials,
  error text, process output, or Azure provisioning inputs.
- Resume defaults to local setup even if original deployment was requested.
  Explicit --deploy runs readiness again, but interrupted/completed deployment
  or incomplete provisioning configuration requires manual reconciliation;
  never automatically retry uncertain billable operations.
- No automatic source regeneration, destructive cleanup, authentication, or
  provisioning during recovery inspection. Dependency repair may run npm install,
  as requested in the original setup.

## Contract and limitations

Resume JSON includes command/status, the bootstrap result, and `recovery` with
rechecked/skipped stages, repair findings, and preflight details. Errors retain
the standard structured CLI contract. Unknown old projects without a recovery
journal are rejected rather than guessing setup intent.

Concurrent bootstrap/resume on the same directory is unsupported. Recovery
journals are local state, not portable presets or an Azure state database.
Manual azd inspection and readiness are required after uncertain deployment.

## Verification

Tests cover installation/Git failures, interrupted and stale journal states,
source/environment/Git preservation, repeated resume, invalid manifests and
context, prerequisite blockers, progress timing, JSON errors, and deployment
retry guards. Existing bootstrap order and CLI behavior remain regression gates.
