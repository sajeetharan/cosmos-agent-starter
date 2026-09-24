# create-cosmos-agent

Build production-oriented TypeScript AI agents with a guided CLI and an Azure Cosmos DB production path.

```text
       *       .       *
          .-"""-.
        .'  .-.  '.
       /   (   )   \
       \    `-'    /
        '._     _.'
           '---'
       COSMOS AGENT
   local first -> Azure ready
```

[![npm version](https://img.shields.io/npm/v/create-cosmos-agent?logo=npm&color=CB3837)](https://www.npmjs.com/package/create-cosmos-agent)
[![npm downloads](https://img.shields.io/npm/dm/create-cosmos-agent?logo=npm)](https://www.npmjs.com/package/create-cosmos-agent)
[![Node.js](https://img.shields.io/node/v/create-cosmos-agent?logo=node.js)](https://www.npmjs.com/package/create-cosmos-agent)
[![GitHub stars](https://img.shields.io/github/stars/AzureCosmosDB/azure-cosmos-agent-starter?logo=github)](https://github.com/AzureCosmosDB/azure-cosmos-agent-starter/stargazers)
[![License](https://img.shields.io/github/license/AzureCosmosDB/azure-cosmos-agent-starter)](LICENSE)

[npm package](https://www.npmjs.com/package/create-cosmos-agent) ·
[documentation](#quickstart) ·
[report an issue](https://github.com/AzureCosmosDB/azure-cosmos-agent-starter/issues) ·
[contribute](CONTRIBUTING.md)

`create-cosmos-agent` generates a complete API and React application with memory, vector retrieval,
tenant isolation, approval-gated actions, telemetry, tests, containers, and Azure infrastructure.
Start locally without cloud credentials, then move to Microsoft Entra ID, Azure OpenAI, and Azure
Cosmos DB without replacing the application contracts.

```text
 Local development                         Azure production
 -----------------                         ----------------
 Mock / Ollama --------.                    Entra ID
 In-memory / Emulator --+--> Agent API --> Managed Identity
 Local identity --------'         |        Cosmos DB + vector search
                                 +-------> Existing model deployment
                                 +-------> App Insights
                                 '-------> Approval-gated actions
```

## See it in action

### End-to-end scenario

Follow the complete path from one-command bootstrap to a Cosmos DB emulator-backed agent, durable
memory recall, diagnostics, validation, and an Azure deployment preview. The cloud section shows the
commands and generated architecture without provisioning billable resources.

[![End-to-end Cosmos Agent scenario](docs/media/create-cosmos-agent-end-to-end-preview.gif)](https://raw.githubusercontent.com/AzureCosmosDB/azure-cosmos-agent-starter/main/docs/media/create-cosmos-agent-end-to-end.mp4)

[Watch the 2:44 end-to-end demo](https://raw.githubusercontent.com/AzureCosmosDB/azure-cosmos-agent-starter/main/docs/media/create-cosmos-agent-end-to-end.mp4) ·
[Download captions](docs/media/create-cosmos-agent-end-to-end.srt)

### Product overview

[![create-cosmos-agent overview preview](docs/media/create-cosmos-agent-preview.gif)](https://raw.githubusercontent.com/AzureCosmosDB/azure-cosmos-agent-starter/main/docs/media/create-cosmos-agent-overview.mp4)

[Watch the full overview video](https://raw.githubusercontent.com/AzureCosmosDB/azure-cosmos-agent-starter/main/docs/media/create-cosmos-agent-overview.mp4).

## Quickstart

Requires Node.js 20 or later.

```powershell
npx create-cosmos-agent@latest my-agent --yes
cd my-agent
npm install
npm run dev
```

Open `http://localhost:5173`.

The generated project starts with safe local defaults:

- deterministic mock AI;
- local development authentication;
- in-memory storage.

No Azure subscription, model key, database, or Docker installation is required for the first run.

## Guided setup

Use the wizard to choose the scenario, model provider, authentication, storage, capacity, and web
experience:

```powershell
npx create-cosmos-agent@latest wizard my-agent
```

## Terminal experience

Interactive commands use a restrained, accessible palette inspired by modern developer CLIs:

- cyan for navigation, prompts, and local actions;
- green for completed work;
- yellow for warnings and decisions that need attention;
- red for blockers and errors;
- blue for the Azure path;
- dim text for supporting detail.

Color is automatically disabled when output is redirected, when the terminal is unsupported, or
when `NO_COLOR` is present. Set `FORCE_COLOR=1` to retain color in a compatible CI terminal.
Machine-readable `--json` output and shell-completion output never include decoration.

```text
       COSMOS AGENT
   local first -> Azure ready

[done] Bootstrap complete
  [done] Dependencies installed
  [done] Git initialized
  [done] Project context linked to my-agent-dev
  [info] Azure deployment not requested

Next step  npm run dev

When you are ready for Azure
  > npx create-cosmos-agent prepare-azure . --environment my-agent-dev
  > azd up --environment my-agent-dev
```

## One-command bootstrap

Use `bootstrap` for a Neon-style project setup that scaffolds the application, installs
dependencies, initializes Git, includes Copilot instructions, and links the directory to a local
Cosmos Agent environment context:

```powershell
npx create-cosmos-agent@latest bootstrap my-agent --yes
```

Bootstrap does not create Azure resources by default. For automation with an already configured
`azd` environment, `--deploy` runs the readiness gate and deploys only when every required value is
present; this operation can create billable resources:

```powershell
npx create-cosmos-agent@latest bootstrap my-agent `
  --environment my-agent-dev `
  --deploy `
  --yes
```

For a new environment, bootstrap locally first, follow [Move from local to Azure](#move-from-local-to-azure),
then run `azd up`. This keeps interactive identity, RBAC, region, and quota decisions out of the
zero-cost local path.

Use `--no-install`, `--no-git`, or `--no-link` to skip individual setup steps. The local context is
stored in `.cosmos-agent/context.json` and excluded from Git.

## Templates

| Template | Use case |
|---|---|
| `chat-agent-ts` | Conversational assistants with memory and safe actions |
| `rag-agent-ts` | Grounded document Q&A with vector retrieval and citations |
| `customer-support-ts` | Customer context, ticket workflows, and approvals |
| `event-agent-ts` | Service Bus-triggered agents with idempotency, retries, and dead-lettering |
| `multi-agent-ts` | Planner, specialist, and reviewer workflows |
| `agent-memory-ts` | Lightweight tenant-safe memory and approval primitives |

Choose a template directly:

```powershell
npx create-cosmos-agent@latest knowledge-agent --template rag-agent-ts --yes
```

Create an event-driven worker:

```powershell
npx create-cosmos-agent@latest mail-agent --template event-agent-ts --yes
```

The event worker reads newline-delimited JSON from stdin locally and uses Azure Service Bus in
production. Its validated event envelope carries the tenant and subject scope, while stable event
IDs make memory and approval writes safe when Service Bus redelivers a message.

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

## Production choices

Generate an Azure-oriented configuration when you are ready:

```powershell
npx create-cosmos-agent@latest my-agent `
  --provider azure-openai `
  --auth entra `
  --storage cosmos `
  --capacity serverless `
  --yes
```

Generated production foundations include:

- Azure Cosmos DB for NoSQL with tenant-safe partitioning;
- Microsoft Entra ID authentication;
- Azure OpenAI, OpenAI-compatible, Ollama, and mock providers;
- approval evidence, idempotency, and optimistic concurrency;
- Docker, Bicep, Azure Container Apps, Application Insights, and `azd`.

## Essential commands

| Command | Purpose |
|---|---|
| `create-cosmos-agent wizard <name>` | Create a project with guided choices |
| `create-cosmos-agent bootstrap <name>` | Scaffold, install, link, and optionally deploy |
| `create-cosmos-agent <name> --yes` | Create with recommended defaults |
| `create-cosmos-agent list` | List available templates |
| `create-cosmos-agent doctor <project>` | Inspect configuration and security patterns |
| `create-cosmos-agent prepare-azure <project>` | Check azd, Entra, provider, RBAC, region, and capacity readiness |
| `create-cosmos-agent validate <project>` | Validate generated files, builds, tests, and Bicep |
| `create-cosmos-agent completion <shell>` | Enable PowerShell, Bash, or Zsh completion |

Run `npx create-cosmos-agent@latest --help` for every option.

## Validate a generated project

```powershell
npm run typecheck
npm test
npm run build
```

## Move from local to Azure

The generated application contracts stay the same when moving to Azure, but production intentionally
requires verified identity and a real model deployment. Create an `azd` environment, configure it,
and use the readiness check before provisioning:

```powershell
azd auth login
azd env new my-agent-dev
azd env set AZURE_LOCATION "eastus2"
azd env set ENTRA_TENANT_ID "<tenant-id>"
azd env set ENTRA_AUDIENCE "<api-audience>"
azd env set ENTRA_CLIENT_ID "<spa-client-id>"
azd env set ENTRA_SCOPE "<api-scope>"
azd env set AI_PROVIDER "azure-openai"
azd env set AZURE_OPENAI_ENDPOINT "<endpoint>"
azd env set AZURE_OPENAI_CHAT_DEPLOYMENT "<deployment>"
npx create-cosmos-agent@latest prepare-azure . --environment my-agent-dev
azd up
```

`prepare-azure` does not create resources. It checks Azure Developer CLI authentication, required
Entra values, production model settings, Cosmos DB capacity choice, and RBAC follow-up. Azure OpenAI
model capacity remains bring-your-own: confirm that the deployment and regional quota exist and grant
the generated runtime identity the `Cognitive Services OpenAI User` role. `azd up` can create billable
resources.

## Corporate npm proxy fallback

If your corporate npm proxy has not mirrored the latest release, download the `.tgz` package from
[GitHub Releases](https://github.com/AzureCosmosDB/azure-cosmos-agent-starter/releases) and run:

```powershell
npx --yes --package .\create-cosmos-agent-0.5.0.tgz create-cosmos-agent my-agent --yes
```

## Develop the CLI

```powershell
git clone https://github.com/AzureCosmosDB/azure-cosmos-agent-starter.git
cd cosmos-agent-starter
npm install
npm run validate
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance and
[SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

[MIT](LICENSE)
