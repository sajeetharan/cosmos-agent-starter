# PRD: Detailed, actionable validation stages

Issue: #28. Priority: fourth onboarding foundation.
Depends on #26 for shared bounded/redacted CLI error handling.

## Outcome

Humans and CI can identify exactly which quality gate ran, why it failed or did
not run, and how to reproduce a failure from the generated project directory.

## Requirements

- Report generated-file inspection, package parsing, typecheck, build, unit,
  security, cost, scenario, integration, Azure CLI, Bicep availability, and Bicep
  build as separate stable stages.
- Run declared npm quality scripts in order; stop executing after failure but
  record subsequent stages as skipped. Missing scripts are explicitly not
  applicable. Scenario tests now run when declared. Live integration remains
  explicitly opt-in and is never silently executed.
- Report missing optional Azure/Bicep tooling as unavailable without failing
  otherwise successful local validation. A broken version command, denied file
  access, or failed Bicep build is a failure, never a successful skip.
- Include elapsed milliseconds and reproduction commands. Drain subprocess
  streams without unbounded memory growth, retaining at most 8,192 characters per stream.
  Failure summaries use shared redaction and are limited to 2,000 characters.
- Do not install tools, authenticate, provision, or invoke live model APIs.
  Human output reports stage results and bounded failure summaries rather than
  noisy subprocess chatter; JSON contains only one result document.

## JSON compatibility

Keep `command`, `project`, `status`, and `exitCode`. Add `schemaVersion: 1` and
`stages`. Every stage has `code`, `status` (passed/failed/skipped/unavailable),
`required`, and `durationMs`; `reason`, `command`, `summary`, and `exitCode` are
present where applicable. Codes are stable `VALIDATE_*` identifiers, not message
text. Missing optional tools can coexist with overall passed status: consumers
must inspect stages to determine infrastructure coverage. Any executed check
that fails returns nonzero, preserving its positive process exit code when known.
The existing programmatic numeric `validateProject` wrapper remains available.

## Verification

Tests cover fail-fast script results, absent scripts/tools, malformed projects,
infrastructure permission/build failures, scenario execution, redaction and
bounded output, process spawning, exact stage lists, and parseable JSON without
subprocess chatter. Existing CLI/argument tests remain regression gates.
