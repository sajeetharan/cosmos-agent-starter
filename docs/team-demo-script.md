# End-to-end team demo script

**Date:** Thursday, October 1, 2026  
**Length:** 20 minutes, plus questions  
**Outcome:** Generate a full-stack agent, connect it to existing Azure OpenAI and Azure Cosmos DB resources, prove a real model response and scoped memory retrieval, then validate the project.

## Core message

> `create-cosmos-agent` gives us one application contract from local development to Azure. We can generate a working application against existing Azure OpenAI and Cosmos DB resources without manually repairing its configuration after generation.

This run uses the real `gpt-4o` deployment and live Cosmos DB account. Local development authentication remains enabled because the demo does not yet have API and SPA app registrations for Microsoft Entra ID. Azure SDK access uses the signed-in developer identity through `DefaultAzureCredential`.

## Use case

**Say**

> We are building a customer-support agent that remembers customer preferences and uses them to provide better answers.

**Simple steps**

1. Open the running application.
2. Show the Azure OpenAI and Cosmos DB status.
3. Ask a question to prove Azure OpenAI works.
4. Save a customer preference in the UI.
5. Show the memory citation.
6. Switch users to demonstrate data isolation.
7. Show runtime diagnostics.
8. Run `create-cosmos-agent doctor` and `validate` quality gates.
9. Summarize the production features.

> This is more than a chatbot. It includes memory, security, diagnostics, and deployment support.

## Before the meeting

Complete this checklist at least one day before the demo:

- Use Node.js 20 or later, Azure CLI, Git, and PowerShell 7.
- Confirm ports `3000` and `5173` are free. Stop any earlier `npm run dev` process before the demo.
- Run `npm install` and `npm run validate` in this repository.
- Rebuild the `create-cosmos-agent` tarball, reinstall it globally, and confirm `create-cosmos-agent --version` works. Do this even if version `0.5.2` is already installed, because a previous tarball can contain an older template.
- If showing Command Prompt completion, install Clink and generate its script with `create-cosmos-agent completion clink`.
- Run `az login` and verify that the signed-in identity is the one granted access to both resources.
- Confirm the `gpt-4o` deployment is `Succeeded` and the `cosmos-agent` database exists.
- Close or hide terminals, notifications, browser tabs, and environment values that contain secrets.
- Increase terminal and browser zoom so the room can read them.
- Rehearse once using the exact network and machine used for the presentation.
- Keep the repository's end-to-end video open as a backup.

Create a clean parent folder before the meeting:

```powershell
New-Item -ItemType Directory -Force C:\Demos | Out-Null
if (Test-Path C:\Demos\team-agent\docker-compose.yml) {
  docker compose --project-directory C:\Demos\team-agent down
}
Remove-Item C:\Demos\team-agent -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item C:\Demos\create-cosmos-agent-*.tgz -Force -ErrorAction SilentlyContinue

npm run build
npm pack --pack-destination C:\Demos

Set-Location C:\Demos
$packageTarball = "create-cosmos-agent-0.5.2.tgz"
if (-not (Test-Path $packageTarball)) {
  throw "Expected $packageTarball in C:\Demos."
}

npm install --global ".\$packageTarball"
create-cosmos-agent --version

az login
az cognitiveservices account deployment show `
  --name devglobe-model `
  --resource-group devglobe-rg `
  --subscription 0caf9c40-8ea2-43b1-a54f-38c656a8e1f0 `
  --deployment-name gpt-4o `
  --query "{name:name,state:properties.provisioningState,model:properties.model.name,version:properties.model.version}" `
  --output table

az cosmosdb sql database show `
  --account-name devglobe-cosmos `
  --resource-group rg-devglobe `
  --subscription 5ba12f7d-8235-4c6a-857c-2dc8e4fcb50a `
  --name cosmos-agent `
  --query "{name:name}" `
  --output table
```

Keep this tarball for the meeting so every CLI command uses the exact package that was rehearsed. The generated `.env` is ignored by Git and contains endpoints but no API keys.

The **Save preference** control is part of the packaged generator template. Every new folder created from this refreshed tarball includes the same UI-only memory flow; no manual file edits are required after generation.

The signed-in identity must have these data-plane roles before the demo:

- `Cognitive Services OpenAI User` on `devglobe-model`.
- `Cosmos DB Built-in Data Contributor` on `devglobe-cosmos`.

The `gpt-4o` deployment is billable by token usage. Reuse it; do not create another deployment during the demo.

## Run of show

### 1. Open the application and introduce the use case

**Do:** Open `http://localhost:5173`.

**Say**

> We are building a customer-support agent that remembers customer preferences and uses them to provide better answers.

### 2. Tour the application

**Do:** Point to the application tabs: **Chat**, **Knowledge**, **Support**, **Agents**, and **Operations**.

**Say**

> This customer-support scenario combines chat, knowledge, support workflows, agents, and operations in one application.

### 3. Show the live configuration

**Do:** In **Chat**, point to the Azure OpenAI provider, Cosmos storage, tenant, and user values.

**Say**

> The application is running locally, while its AI responses and durable data come from Azure. We are using the `tenant-demo` and `user-demo` identity for this demonstration.

### 4. Prove Azure OpenAI works

**Do:** In **Chat**, ask, "In one sentence, explain why Saturn has rings."

**Say**

> This is a real response from our `gpt-4o` deployment, not a mock or repeated input.

### 5. Demonstrate memory

**Do:** In **Chat**, leave the Microsoft Teams preference in **Customer preference** and select **Save preference**. Wait for "Preference saved for user-demo." Then ask, "What notification channel does this customer prefer?"

**Say**

> We created the preference in the UI, saved it in Cosmos DB, and retrieved it for this user in the same demonstration.

> This preference control was generated with the application and works the same way in a newly created project folder.

### 6. Show the citation

**Do:** Expand the citation shown below the answer.

**Say**

> The citation makes the retrieved memory visible and inspectable instead of hiding it inside the model prompt.

### 7. Demonstrate isolation

**Do:** Change **User** to `user-other`, then ask the same preference question.

**Say**

> The second user cannot retrieve the first user's memory. Tenant and user isolation are part of the data model.

### 8. Show operations

**Do:** Open **Operations**, select **Load diagnostics**, and point out the operation and correlation data.

**Say**

> This starter provides more than chat. It includes durable memory, security boundaries, citations, diagnostics, tests, and an Azure deployment path.

### 9. Run quality and readiness gates

**Do:** In the terminal under the project folder, run:

```powershell
create-cosmos-agent doctor .
create-cosmos-agent validate .
```

**Say**

> The CLI includes built-in verification commands. `doctor` inspects the environment, security posture, configuration, and tenant boundaries. `validate` executes the full suite of typechecks, unit tests, security assertions, and Bicep infrastructure builds to ensure production readiness before deployment.

### 10. Summarize the production features and close

**Say**

> We bootstrapped once, connected to live Azure OpenAI and Azure Cosmos DB, verified memory and isolation, and validated the project through doctor and validation gates. We have one continuous path from local developer setup to cloud deployment.

## Setup and troubleshooting reference

The commands below are for preparation and recovery. Do not show them during the UI-only run of show.

### 0:00-1:30 - Frame the problem

**Say**

> Building the chat response is the easy part. A production-oriented agent also needs identity boundaries, durable memory, safe actions, diagnostics, tests, containers, and infrastructure. I am going to create that whole path, run it locally with real Cosmos storage, and finish at the Azure deployment gate.

> This run connects to existing Azure resources. It will consume a small amount of model capacity, but it will not provision or modify infrastructure.

### 1:30-3:00 - Show the available scenarios

**Run**

```powershell
create-cosmos-agent list
```

**Say**

> The CLI is scenario-driven. It supports conversational, RAG, customer support, event-driven, multi-agent, and lightweight memory starters. Today I will use the full-stack chat scenario.

**Point out**

- This is not a single sample application with renamed labels.
- Scenarios compose a common TypeScript base with only the capabilities they need.

### 3:00-5:30 - Bootstrap the project reproducibly

Optionally type `create-cosmos-agent b`, then press `Tab` to show Clink completing `bootstrap`.

**Run**

```powershell
create-cosmos-agent bootstrap C:\Demos\team-agent `
  --template customer-support-ts `
  --provider azure-openai `
  --auth local `
  --storage cosmos `
  --local azure `
  --capacity autoscale `
  --azure-setup existing `
  --azure-openai-endpoint "https://devglobe-model.openai.azure.com" `
  --azure-openai-deployment "gpt-4o" `
  --cosmos-endpoint "https://devglobe-cosmos.documents.azure.com" `
  --web `
  --git `
  --install `
  --link `
  --yes
```

```powershell
Set-Location C:\Demos\team-agent
```

**Say while it runs**

> I am using explicit flags so this rerun cannot drift to the mock provider, the embedding deployment, or incomplete Entra settings. Bootstrap scaffolds the API and React app, installs dependencies, initializes Git, and writes the existing resource endpoints to the ignored `.env`. It does not create Azure resources.

**Show briefly in VS Code**

```powershell
code .
```

Point to these generated surfaces without reading every file:

- `apps/api` and `apps/web`
- `packages/agent`, `packages/auth`, `packages/memory`, and `packages/tools`
- `tests/security` and `tests/scenarios`
- `Dockerfile`, `docker-compose.yml`, `azure.yaml`, and `infra`
- `.github/copilot-instructions.md`

**Transition**

> The useful distinction is that local adapters and production adapters implement the same contracts. We can change where identity, models, and storage come from without replacing the application design.

### 5:30-9:00 - Start and verify the live-backed app

**Run**

```powershell
npm run dev
```

**Say**

> Because we selected existing Azure resources, `npm run dev` starts only the API and React app. `DefaultAzureCredential` uses my Azure CLI sign-in for both services; no account keys are stored in the project.

> The existing database has separate containers for conversation history, durable agent memory, application data, and approval requests. The partition keys start with tenant and user identity, and durable memory has a vector policy for bounded similarity search.

In a second PowerShell terminal, run this smoke test:

```powershell
$config = Invoke-RestMethod http://localhost:3000/api/config
$headers = @{
  "x-tenant-id" = "tenant-demo"
  "x-user-id" = "user-demo"
  "x-correlation-id" = "demo-chat-001"
}
$chat = Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/api/chat `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    message = "In one sentence, explain why Saturn has rings."
    threadId = "demo-live-chat"
    useKnowledge = $false
  } | ConvertTo-Json)

[pscustomobject]@{
  ConfiguredProvider = $config.provider
  ResponseProvider = $chat.provider
  Model = $chat.model
  Answer = $chat.answer
} | Format-List
```

Confirm that both provider fields are `azure-openai`, the model is `gpt-4o-2024-11-20`, and the answer is not a copy of the question.

Open the Azure portal Data Explorer for `devglobe-cosmos` and show the `cosmos-agent` database.

**Point out**

- `conversation-history`: `/tenantId`, `/userId`, `/threadId`
- `agent-memory`: `/tenantId`, `/userId`
- `application-data`: `/tenantId`, `/userId`
- `action-requests`: `/tenantId`, `/affectedUserId`

> Tenant and user scope is part of the data model, not an instruction we hope the model follows.

Open `http://localhost:5173`.

**Point out**

- `azure-openai provider`
- `cosmos storage`
- local tenant `tenant-demo`
- local user `user-demo`

**Say**

> The model response is coming from the live Azure OpenAI deployment. Storage, vector retrieval, tenant filtering, citations, and diagnostics are going through the Cosmos SDK and Azure Cosmos DB.

### 9:00-12:30 - Prove durable memory and retrieval

Use a second PowerShell terminal in the generated project.

**Create a durable memory**

```powershell
$headers = @{
  "x-tenant-id" = "tenant-demo"
  "x-user-id" = "user-demo"
  "x-correlation-id" = "demo-remember-001"
}

$memory = Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/api/memories `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    type = "preference"
    content = "The customer prefers deployment notifications in Microsoft Teams."
    threadId = "web-session"
    interactionId = "demo-interaction-001"
    retentionClass = "standard"
  } | ConvertTo-Json)

$memory | Select-Object id, type, content, correlationId | Format-List
```

**Say**

> Raw conversation is not silently promoted to long-term memory. Durable memory is an explicit write with provenance, confidence, retention, and correlation metadata.

In the web app, send:

> What notification channel does this customer prefer?

Expand the citation beneath the response.

**Say**

> The follow-up performs tenant- and user-filtered vector retrieval. The answer includes a citation back to the selected memory, so the retrieval is inspectable rather than hidden inside a prompt.

**Optional isolation proof, if time permits**

Change the local user in the UI to `user-other` and ask the same question.

> The other user does not retrieve `user-demo`'s memory. Identity comes from the trusted request context; the model cannot choose a tenant or user partition.

Change back to `user-demo` before continuing.

### 12:30-14:30 - Show operational evidence

Open **Operations**, then select **Load diagnostics**.

**Say**

> The diagnostics surface records operation counts, duration, request charge when the backend reports it, errors, and correlation identifiers. Prompt and document bodies are redacted by default.

> This run uses the live service, so request charge and service diagnostics are representative of Azure Cosmos DB. The shared-throughput database uses the configured vector embedding policy with scan-based vector queries rather than a vector index.

Open Data Explorer again and show the new item under `agent-memory`.

### 14:30-17:00 - Run the quality gates

Keep the application running and use the second terminal.

**Run**

```powershell
create-cosmos-agent doctor .
create-cosmos-agent validate .
```

**Say**

> These are the same verification contracts we run in CI and before production deployment: `doctor` checks configuration drift, secret hygiene, and tenant safety, while `validate` automatically executes full type safety checks, unit and security tests, build compilation, and Bicep infrastructure validation in a single command.

Call out security tests for tenant isolation and approval rules. Do not run destructive or load-oriented integration tests against the shared live account during the presentation.

### 17:00-19:00 - Preview the hosted production path

Show `docs/architecture.md`, `azure.yaml`, and `infra/main.bicep`.

**Say**

> The model and database are already live. The remaining production step is hosting the API and web app on Container Apps, replacing local development headers with Microsoft Entra tokens, and replacing my developer credential with a user-assigned managed identity. Application Insights receives hosted telemetry.

Show, but do not run with placeholders:

```powershell
azd auth login
azd env new team-agent-dev
azd env set AZURE_LOCATION "eastus2"
azd env set ENTRA_TENANT_ID "<tenant-id>"
azd env set ENTRA_AUDIENCE "<api-audience>"
azd env set ENTRA_CLIENT_ID "<spa-client-id>"
azd env set ENTRA_SCOPE "<api-scope>"
azd env set AI_PROVIDER "azure-openai"
azd env set AZURE_OPENAI_ENDPOINT "https://devglobe-model.openai.azure.com"
azd env set AZURE_OPENAI_CHAT_DEPLOYMENT "gpt-4o"
create-cosmos-agent prepare-azure . --environment team-agent-dev
azd up --environment team-agent-dev
```

**Say**

> `prepare-azure` is the non-provisioning gate. It checks authentication, Entra configuration, model settings, region, capacity, and role prerequisites. `azd up` is the deliberate billable step, so this demo stops before it.

Do not run `azd up` during the meeting unless a dedicated subscription, approved region, quota, RBAC, and cleanup plan were validated beforehand.

### 19:00-20:00 - Close

**Say**

> We bootstrapped once, received a real answer from Azure OpenAI, persisted and retrieved tenant-scoped memory in Azure Cosmos DB, inspected diagnostics, ran the safety gates, and reached a guarded hosting path. The value is not just faster scaffolding; it is a working application with production concerns carried into the first commit.

> The next team decision is which scenario to pilot and which existing Entra and Azure OpenAI resources it should use.

## Expected questions

**Is the AI response real?**  
Yes. The response comes from the `gpt-4o` deployment on `devglobe-model`. The smoke test prints both the configured provider and response model so this is visible rather than assumed.

**Is Cosmos DB real in this demo?**  
Yes. The application uses the Azure Cosmos DB JavaScript SDK against `devglobe-cosmos` and stores data in the `cosmos-agent` database.

**How is tenant isolation enforced?**  
Production identity comes from validated Entra claims. Repository methods receive trusted request context, partition keys begin with tenant and user scope, and vector queries include parameterized scope filters. Security tests cover cross-tenant retrieval and deletion.

**Does it deploy Azure OpenAI?**  
No. This rerun uses the existing billable `gpt-4o` deployment. Model capacity remains bring-your-own because quota and availability are organization- and region-specific.

**Does local development match production exactly?**  
The model and database services are the same live services used by a hosted deployment. Development still uses local trusted identity headers and the developer's Azure CLI credential; production must use Entra bearer tokens and managed identity.

**What can create cost?**  
Each chat request consumes tokens on the existing `gpt-4o` deployment, and Cosmos DB is an existing billable account. The bootstrap command creates no cloud resources. `azd up` can provision additional billable Container Apps, Cosmos DB, monitoring, and related resources, so it is not run during this demo.

## Recovery plan

If npm or the network is slow, use a project generated during rehearsal and begin at **Start and verify the live-backed app**.

If Cosmos DB access fails but Azure OpenAI is healthy, set `MEMORY_BACKEND=in-memory` in `.env`, run `npm run dev`, and clearly state that the fallback keeps the real model response but does not demonstrate durable Cosmos persistence.

If Azure OpenAI returns `403`, verify `az login` is using the expected identity and confirm its `Cognitive Services OpenAI User` assignment on `devglobe-model`. If it returns `404` or a model error, confirm `.env` contains `AZURE_OPENAI_CHAT_DEPLOYMENT=gpt-4o`, not the embedding deployment.

If Data Explorer is slow, show the API-created memory object and diagnostics instead. Do not spend live time troubleshooting the explorer.

If the UI fails, demonstrate with the API:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/api/memories/recall `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{ query = "preferred notification channel"; limit = 3 } | ConvertTo-Json) |
  ConvertTo-Json -Depth 8
```

If any live step becomes uncertain, switch to the repository's recorded end-to-end demo, then return for questions. A clean fallback is better than debugging infrastructure in front of the team.

## Cleanup

After the demo:

```powershell
# Stop npm run dev with Ctrl+C first.
Set-Location C:\Demos
Remove-Item C:\Demos\team-agent -Recurse -Force
Remove-Item C:\Demos\create-cosmos-agent-*.tgz -Force -ErrorAction SilentlyContinue
```

Do not delete `devglobe-model`, its `gpt-4o` deployment, `devglobe-cosmos`, or the shared role assignments. This demo reuses those team resources and does not provision them.