# PRD: Truthful scenario-aware completion instructions

Issue: #29. Priority: third onboarding foundation. Stacked after #23/#26 to
integrate shared CLI dispatch and preserve their additive JSON contracts.

## Outcome

Every completion path gives an ordered local startup workflow and a separately
labeled optional Azure workflow, derived from the resolved scenario and actual
bootstrap result.

## Requirements

- Always enter the destination first. Windows output targets PowerShell using
  literal-path single quoting; macOS/Linux output targets Bash/Zsh single quoting.
  Embedded apostrophes, whitespace, dollar signs, and wildcard characters must
  remain literal. Command Prompt users should use PowerShell for these commands.
- Include npm install exactly when bootstrap did not install dependencies.
- Web projects show their development URL only when included. API-only projects
  show the health endpoint and configured-port caveat. Event workers explain
  newline-delimited stdin input and include a valid sample event.
- Explain non-mock configuration, emulator startup, mock limitations, and
  in-memory lifetime when relevant.
- Do not equate local context linking or existing resources with configured
  Azure infrastructure. Point to production setup and readiness first.
- Mark deployment as optional and billable; do not recommend redeployment after
  successful deployment or promise a deployed URL not returned by azd.

## Output contract

Create and bootstrap JSON retain the `nextSteps: string[]` field but correct its
contents. Add `nextStepPlan: { schemaVersion: 1, shell, local, azure }`. Both
sections contain `{ kind: "command" | "instruction", text, billable: boolean }`.
Human output renders these same sections. Consumers executing commands should
use the structured model and never execute instruction entries or billable
entries without explicit approval.

## Verification

Matrix tests cover every scenario, web inclusion, create/bootstrap,
dependencies installed/skipped, linked/unlinked context, existing resources,
completed deployment, shell quoting, and exact JSON shape. No generated source
or application behavior changes.
