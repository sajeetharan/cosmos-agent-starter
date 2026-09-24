# {{PROJECT_NAME}}

Tenant-safe TypeScript agent memory on Azure Cosmos DB.

See [the generated architecture guide](docs/architecture.md) for the component diagram,
customization points, portability boundaries, and invariants to preserve.

## Five-minute local path

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Development defaults to the in-memory adapter, so the API starts without Docker or Azure.
To use the emulator, set `MEMORY_BACKEND=cosmos` and the documented emulator credentials in `.env`,
then run:

```powershell
docker compose up -d
npm run emulator:init
npm run dev
```

The API expects trusted development headers `x-tenant-id` and `x-user-id` only in local mode.
Production rejects that adapter and validates Microsoft Entra signature, issuer, audience, tenant,
expiry, and user claims. Never accept identity fields from agent tools.

## Azure deployment

Run `azd auth login`, create and configure an `azd` environment, then run:

```powershell
npx create-cosmos-agent prepare-azure . --environment <environment-name>
azd up --environment <environment-name>
```

The readiness command checks required Entra and model values before provisioning. Set
`AZURE_PRINCIPAL_ID` to the deployment identity object ID only when it needs data-plane access.
Runtime uses a separate user-assigned Managed Identity and `DefaultAzureCredential`; local-auth is
disabled on the account. Serverless and autoscale are mutually exclusive infrastructure paths.
Azure OpenAI capacity is not provisioned by this starter, so confirm deployment quota and grant the
runtime identity `Cognitive Services OpenAI User` on the configured model resource.

## Data and memory lifecycle

`conversation-history` stores transient chat messages with the hierarchical key `/tenantId`,
`/userId`, `/threadId` and a 30-day default TTL. `agent-memory` stores curated durable memory with
the hierarchical key `/tenantId`, `/userId`; raw chat messages are not automatically promoted to
durable memory. Each memory records provenance, retention class, TTL, confidence, correlation,
embedding version, last validation time, agent/model/prompt versions, and an embedding. Users can
inspect and delete only their own memories.

Vector recall uses parameterized tenant/user filters, bounded `TOP N`, a partition-key prefix, cosine
distance, citations, a selected-record retrieval trace, and RU capture. The deterministic
eight-dimensional embedding provider is only a local/test adapter; replace it with your approved
embedding deployment without changing the store contract.

`action-requests` records the audit lifecycle from pending through completion. The affected user must
approve, an agent cannot self-approve, and execution requires an idempotency key.

## Diagnostics and tests

The diagnostics endpoint reports operation counts, request charge, duration, and errors while redacting
prompt and document bodies. Run:

```powershell
npm run typecheck
npm test
npm run test:scenario
npm run build
npm run test:integration
```

Set `RUN_COSMOS_INTEGRATION=true` only after a compatible emulator or Azure container is available.
The vNext Linux emulator is preview and vector/HPK parity can differ from Azure. Portable YAML evals
define the adapter boundary to the existing organizational evaluation framework; this project does not
invent a generic runner.

Adapt the sample by replacing the development identity adapter, embedding provider, and application-owned
agent SDK boundary while preserving context scoping, bounded queries, provenance, deletion, diagnostics,
approval evidence, and security tests.
