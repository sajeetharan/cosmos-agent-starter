# PRD: Read-only local setup and runtime status

Issue: #27.

## Outcome

`local-status [project] [--json]` explains only the selected scenario's local
requirements. It validates the generated manifest, reads .env, and applies
process-environment overrides (matching dotenv precedence). It never loads
.env.example as actual configuration or executes project configuration.

## Requirements

- Inspect selected/effective provider, identity and storage without exposing
  values. Missing configuration reports variable names only. Non-default
  manifest selections must also be activated by their environment switches.
- Explain deterministic mock limitations and volatile in-memory data. Report
  missing dependencies with an explicit install command, never auto-install.
- Check Entra API/web configuration when relevant; skip user identity and
  API/web URLs for workers. Explain stdin or Service Bus requirements.
- Report API health and statically configured Vite addresses, edited-port
  uncertainty, proxy mismatch and common port-conflict remedies.
- Static configuration is not runtime verification. --check-connectivity
  explicitly permits API GET /health, web HEAD, and selected Cosmos/Ollama TCP
  connections. Probes send no credentials, model inference, or customer data.
- Each probe has a bounded timeout (100-10000ms, default 2000). HTTP redirects
  are rejected, health response size is bounded, and response bodies are never
  included in findings. TCP connectivity is not model/data-plane verification.
- Never mutate .env, start processes, initialize databases, authenticate,
  install tools or provision resources. Keep doctor and prepare-azure separate;
  reuse their finding shape and summary conventions.

## Output contract

JSON contains command/project, schemaVersion 1, configuration (enum selections,
scenario and worker/web flags), endpoints (service/address/check/status),
connectivityChecked, findings and severity summary. Overall status is configured,
reachable, or blocked. Exit 1 indicates blockers; configured does not claim a
running application and reachable does not prove inference/identity permissions.
External-provider credentials and Azure permission/capacity remain manual checks.

## Verification

Tests cover every scenario, mock/external providers, API-only and worker paths,
missing/malformed/overridden configuration, timeouts/unreachable services,
optional probe consent, real ephemeral health servers, redaction, file
preservation, command help/completion and parseable JSON.
