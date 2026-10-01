# {{PROJECT_NAME}}

{{SCENARIO_DESCRIPTION}}

Generated from the `{{SCENARIO_ID}}` scenario by `create-cosmos-agent`.

## Start locally

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`. The guided setup writes the selected local provider, authentication,
and storage adapters into the project.

When Cosmos DB and the local emulator are selected, `npm run dev` starts the emulator, waits for it
to become healthy, initializes its database and containers, and then starts the application. Stop
the emulator when finished:

```powershell
npm run emulator:stop
```

## Choose an AI provider

Set `AI_PROVIDER` in `.env` and configure the corresponding values:

| Provider | `AI_PROVIDER` | Required configuration |
|---|---|---|
| Azure OpenAI | `azure-openai` | `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_CHAT_DEPLOYMENT`; uses `DefaultAzureCredential` unless `AZURE_OPENAI_API_KEY` is set |
| OpenAI | `openai` | `OPENAI_API_KEY`; optional `OPENAI_MODEL` and `OPENAI_BASE_URL` |
| Ollama | `ollama` | Start Ollama; optional `OLLAMA_BASE_URL` and `OLLAMA_MODEL` |
| Local deterministic adapter | `mock` | Development only; blocked when `NODE_ENV=production` |

Provider errors are returned explicitly. The application does not silently replace a failed
configured provider with mock output.

## Authentication

`AUTH_MODE=local` is the development adapter and is blocked in production. Production defaults to
Microsoft Entra ID and validates signature, issuer, audience, tenant, expiry, and user claims.

Configure:

```dotenv
AUTH_MODE=entra
AUTH_ENTRA_TENANT_ID=<directory-tenant-id>
AUTH_ENTRA_AUDIENCE=<API-application-ID-or-URI>
AUTH_ENTRA_CLIENT_ID=<SPA-application-client-id>
AUTH_ENTRA_SCOPE=<exposed-API-scope>
```

Add the web origin as a Single-page application redirect URI in the Entra app registration.
Assign application roles when APIs require role-based authorization.

## Customer workflows

The generated runtime exposes:

| Route | Purpose |
|---|---|
| `POST /api/chat` | Context-aware model response with memory and optional knowledge citations |
| `GET/POST /api/memories` | Inspect or create tenant/user-scoped memories |
| `POST /api/knowledge/documents` | Chunk and ingest a document |
| `POST /api/knowledge/search` | Bounded vector retrieval with source citations |
| `GET/POST/PATCH /api/support/tickets` | Customer-support ticket workflow |
| `POST /api/agents/run` | Planner, specialist, and reviewer handoff trace |
| `POST /api/actions` | Create an approval-gated consequential action |
| `POST /api/actions/:id/:decision` | Approve or reject as the affected user |
| `POST /api/actions/:id/execute` | Execute only after recorded approval |
| `GET /api/diagnostics` | Redacted operation, latency, RU, and error telemetry |

The selected scenario determines the primary UI workflow, while shared platform APIs remain
available for extension.

## Cosmos DB

Projects generated with Cosmos DB and the local emulator include an ignored `.env` containing the
well-known local-only emulator key. `npm run dev` handles startup and idempotent initialization.
Projects generated with in-memory storage start directly and reset their data when the API restarts.

The emulator uses HTTP only for local development. Azure deployments use TLS and
`DefaultAzureCredential`.

Production uses `DefaultAzureCredential`, a singleton `CosmosClient`, hierarchical partition keys,
bounded parameterized vector queries, continuation-aware reads, and ETag concurrency for protected
state transitions.

## Validate

```powershell
npm run typecheck
npm test
npm run build
npx create-cosmos-agent doctor .
npx create-cosmos-agent validate .
```

The Cosmos integration test is opt-in:

```powershell
$env:RUN_COSMOS_INTEGRATION = "true"
npm run test:integration
```

## Deploy

Set the required `azd` environment values before provisioning:

```powershell
azd auth login
azd env set ENTRA_TENANT_ID "<tenant-id>"
azd env set ENTRA_AUDIENCE "<api-audience>"
azd env set ENTRA_CLIENT_ID "<spa-client-id>"
azd env set ENTRA_SCOPE "<api-scope>"
azd env set AI_PROVIDER "azure-openai"
azd env set AZURE_OPENAI_ENDPOINT "<endpoint>"
azd env set AZURE_OPENAI_CHAT_DEPLOYMENT "<deployment>"
npx create-cosmos-agent prepare-azure . --environment <environment-name>
azd up
```

The readiness check does not create resources. It verifies `azd` authentication, Entra settings,
the selected production provider, and the Cosmos DB capacity choice before deployment. Azure OpenAI
capacity is bring-your-own: confirm that the configured deployment has regional quota. Azure
deployment can create billable resources. The runtime uses a user-assigned Managed Identity for
Cosmos DB and Azure OpenAI access; grant it the `Cognitive Services OpenAI User` role on the selected
model resource.
