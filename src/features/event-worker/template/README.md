# {{PROJECT_NAME}}

{{SCENARIO_DESCRIPTION}}

Generated from the `{{SCENARIO_ID}}` scenario by `create-cosmos-agent`.

## Start locally

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

The worker reads one validated JSON event per line from stdin. Local development uses deterministic
mock AI and in-memory state, so it needs no Azure subscription, credentials, or Docker.

```json
{
  "id": "event-00000001",
  "type": "mail.received",
  "source": "gmail",
  "tenantId": "tenant-a",
  "subjectId": "user-a",
  "occurredAt": "2026-09-23T12:00:00.000Z",
  "data": {
    "objective": "Summarize the new message.",
    "threadId": "mailbox"
  }
}
```

## Test with durable local memory

```powershell
docker compose up -d
npm run emulator:init
```

Set `MEMORY_BACKEND=cosmos` in `.env`, add the documented emulator key, and run `npm run dev`.

## Validate

```powershell
npm run typecheck
npm test
npm run build
npx create-cosmos-agent doctor .
npx create-cosmos-agent validate .
```

## Move to Azure

The Azure path provisions Cosmos DB, Service Bus, a Container Apps worker, managed identities,
data-plane RBAC, scaling, and monitoring. It uses an existing production model deployment.

```powershell
azd auth login
azd env new <environment-name>
azd env set AZURE_LOCATION "<region>"
azd env set AI_PROVIDER "azure-openai"
azd env set AZURE_OPENAI_ENDPOINT "<endpoint>"
azd env set AZURE_OPENAI_CHAT_DEPLOYMENT "<deployment>"
npx create-cosmos-agent prepare-azure . --environment <environment-name>
azd up --environment <environment-name>
```

The readiness check does not provision resources. Confirm model quota in the selected region and
grant the generated runtime identity `Cognitive Services OpenAI User` on the model resource.
`azd up` can create billable resources.
