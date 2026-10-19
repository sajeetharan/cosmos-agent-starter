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
[![GitHub stars](https://img.shields.io/github/stars/sajeetharan/cosmos-agent-starter?logo=github)](https://github.com/sajeetharan/cosmos-agent-starter/stargazers)
[![License](https://img.shields.io/github/license/sajeetharan/cosmos-agent-starter)](LICENSE)

[npm package](https://www.npmjs.com/package/create-cosmos-agent) ·
[quickstart](#60-second-quickstart) ·
[report an issue](https://github.com/sajeetharan/cosmos-agent-starter/issues) ·
[contribute](#contributing)

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

## On this page

- [Quickstart](#60-second-quickstart)
- [Choose a starter](#working-starters)
- [Demos](#see-it-in-action) and [tutorials](#learn-by-building)
- [Guided setup](#guided-setup) and [bootstrap options](#one-command-bootstrap)
- [CLI commands](#essential-commands)
- [Move from local to Azure](#move-from-local-to-azure)
- [Contributing](#contributing) and [repository layout](#repository-layout)
- [Support and security](#support-and-security)
- [License](#license)

## See it in action

### End-to-end scenario

Follow the complete path from one-command bootstrap to a Cosmos DB emulator-backed agent, durable
memory recall, diagnostics, validation, and an Azure deployment preview. The cloud section shows the
commands and generated architecture without provisioning billable resources.

[![End-to-end Cosmos Agent scenario](docs/media/create-cosmos-agent-end-to-end-preview.gif)](https://raw.githubusercontent.com/sajeetharan/cosmos-agent-starter/main/docs/media/create-cosmos-agent-end-to-end.mp4)

[Watch the 2:44 end-to-end demo](https://raw.githubusercontent.com/sajeetharan/cosmos-agent-starter/main/docs/media/create-cosmos-agent-end-to-end.mp4) ·
[Download captions](docs/media/create-cosmos-agent-end-to-end.srt)

### Product overview

[![create-cosmos-agent overview preview](docs/media/create-cosmos-agent-preview.gif)](https://raw.githubusercontent.com/sajeetharan/cosmos-agent-starter/main/docs/media/create-cosmos-agent-overview.mp4)

[Watch the full overview video](https://raw.githubusercontent.com/sajeetharan/cosmos-agent-starter/main/docs/media/create-cosmos-agent-overview.mp4).

## 60-second quickstart

Requires Node.js 20 or later and npm. The examples below use PowerShell; the single-line
quickstart commands also work in Bash and Zsh.

```powershell
npx create-cosmos-agent@latest bootstrap my-agent --yes
cd my-agent
npm run dev
```

Open `http://localhost:5173` and send your first message. The `bootstrap` command scaffolds the
application, installs its dependencies, and initializes a local Git repository.

The generated project starts with safe local defaults:

- deterministic mock AI;
- local development authentication;
- in-memory storage.

No Azure subscription, model key, database, or Docker installation is required for the first run.

## Working starters

Every starter is a runnable application with local defaults. Replace `<project-name>` and run one
of these commands:

| Use case                                      | Command                                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Full-stack conversational agent               | `npx create-cosmos-agent@latest bootstrap <project-name> --template chat-agent-ts --yes`       |
| Document-grounded RAG with citations          | `npx create-cosmos-agent@latest bootstrap <project-name> --template rag-agent-ts --yes`        |
| Customer support copilot and ticket workflows | `npx create-cosmos-agent@latest bootstrap <project-name> --template customer-support-ts --yes` |
| Supervised multi-agent orchestration          | `npx create-cosmos-agent@latest bootstrap <project-name> --template multi-agent-ts --yes`      |
| Durable, tenant-safe agent memory             | `npx create-cosmos-agent@latest bootstrap <project-name> --template agent-memory-ts --yes`     |
| Event-driven Service Bus worker               | `npx create-cosmos-agent@latest bootstrap <project-name> --template event-agent-ts --yes`      |

Then enter the generated directory and run `npm run dev`. Use
`npx create-cosmos-agent@latest list` to inspect the available starters before generating one.

## Adoption and showcase

The badges at the top of this README report the live npm version, monthly npm downloads, and GitHub
stars. The package is available from
[npm](https://www.npmjs.com/package/create-cosmos-agent) and
[GitHub Packages](https://github.com/sajeetharan/cosmos-agent-starter/pkgs/npm/create-cosmos-agent).
The CLI does not collect telemetry; aggregate npm downloads are the project's only usage metric.

Built something public with `create-cosmos-agent`?
[Submit it to the project showcase](https://github.com/sajeetharan/cosmos-agent-starter/issues/new?template=showcase.yml)
so maintainers can feature verified community projects here.

## Learn by building

- [Run the complete local tutorial](docs/try-it-yourself.md): generate an application, start the
  Cosmos DB emulator, exercise durable tenant-safe memory, and run the quality gates.
- [Watch the 2:44 end-to-end demo](https://raw.githubusercontent.com/sajeetharan/cosmos-agent-starter/main/docs/media/create-cosmos-agent-end-to-end.mp4):
  follow the path from local bootstrap to an Azure deployment preview.
- [Move from local to Azure](#move-from-local-to-azure): configure identity, an existing model
  deployment, Cosmos DB capacity, and deployment readiness.

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

Before writing files, create/bootstrap check Node.js 20+, npm, destination access,
and Git when requested. Docker/Compose are required only for Cosmos emulator
storage; azd is required only for deployment. Checks never install, sign in, or
probe cloud services. Blocking findings stop generation; `--json` includes
structured `preflight` findings. `--dry-run` remains an unchecked plan.
See the [preflight PRD](docs/prd/23-scenario-preflight.md) for the output contract.

Use `bootstrap` for a Neon-style project setup that scaffolds the application, installs
dependencies, initializes Git, includes Copilot instructions and an on-demand
[`cosmosdb-best-practices`](https://github.com/AzureCosmosDB/cosmosdb-agent-kit) Agent Skill, and
links the directory to a local Cosmos Agent environment context:

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

## Scaffold without installing dependencies

The [starter table](#working-starters) uses `bootstrap` to install dependencies automatically.
Use the create command directly when you want to scaffold first and install later:

```powershell
npx create-cosmos-agent@latest knowledge-agent --template rag-agent-ts --yes
cd knowledge-agent
npm install
npm run dev
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

| Command                                       | Purpose                                                          |
| --------------------------------------------- | ---------------------------------------------------------------- |
| `create-cosmos-agent wizard <name>`           | Create a project with guided choices                             |
| `create-cosmos-agent bootstrap <name>`        | Scaffold, install, link, and optionally deploy                   |
| `create-cosmos-agent <name> --yes`            | Create with recommended defaults                                 |
| `create-cosmos-agent list`                    | List available templates                                         |
| `create-cosmos-agent doctor <project>`        | Inspect configuration and security patterns                      |
| `create-cosmos-agent prepare-azure <project>` | Check azd, Entra, provider, RBAC, region, and capacity readiness |
| `create-cosmos-agent validate <project>`      | Validate generated files, builds, tests, and Bicep               |
| `create-cosmos-agent completion <shell>`      | Enable PowerShell, Bash, Zsh, or Clink completion                |

Run `npx create-cosmos-agent@latest --help` for every option.

### Command Prompt Tab completion

[Clink](https://chrisant996.github.io/clink/) adds command and argument completion to Windows
Command Prompt. Install and configure it once:

```cmd
winget install --id chrisant996.Clink -e
```

Open a new Command Prompt, then run:

```cmd
mkdir "%LOCALAPPDATA%\create-cosmos-agent\clink"
create-cosmos-agent completion clink > "%LOCALAPPDATA%\create-cosmos-agent\clink\create-cosmos-agent.lua"
clink installscripts "%LOCALAPPDATA%\create-cosmos-agent\clink"
clink autorun install
```

Open a new Command Prompt. `Tab` now completes commands, options, templates, and option values;
`Ctrl+Space` opens Clink's interactive completion list.

## Validate a generated project

```powershell
npm run typecheck
npm test
npm run build
```

## Move from local to Azure

The generated application contracts stay the same when moving to Azure, but production intentionally
requires verified identity and a real model deployment. Guided bootstrap asks whether to use existing
Azure resources, provision supported application infrastructure with `azd`, or configure Azure later.
Existing-resource mode writes supplied Azure OpenAI and Cosmos DB endpoints into the generated `.env`.
Provisioning mode requires a second confirmation because it can create billable Cosmos DB, Container
Apps, managed identity, and monitoring resources.

Azure OpenAI model capacity remains bring-your-own: guided setup asks for an existing endpoint and
deployment name because regional model availability and quota cannot be inferred safely. For manual
setup, create an `azd` environment, configure it, and use the readiness check before provisioning:

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
[GitHub Releases](https://github.com/sajeetharan/cosmos-agent-starter/releases) and run:

```powershell
npx --yes --package .\create-cosmos-agent-0.5.4.tgz create-cosmos-agent my-agent --yes
```

## Contributing

Contributions are welcome: documentation fixes, bug reports, regression tests, and improvements to
the CLI or generated starters all help. You do not need an Azure subscription to start working on
the CLI or the default local application.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for composition rules and generated-output validation
requirements. For a substantial feature or behavior change, open an
[issue](https://github.com/sajeetharan/cosmos-agent-starter/issues) first to discuss the approach.

### Set up a development checkout

You need Git, Node.js 20 or later, and npm. Fork the repository on GitHub, then clone **your fork**
(replace `YOUR-USERNAME` below):

```powershell
git clone https://github.com/YOUR-USERNAME/cosmos-agent-starter.git
cd cosmos-agent-starter
git switch -c docs-or-feature-name
npm install
npm run validate
```

### Run your local CLI changes

From the repository root, use `npm run dev --` to run the checked-out source rather than the
published npm package:

```powershell
npm run dev -- --help
npm run dev -- list
npm run dev -- ../cosmos-agent-smoke --template chat-agent-ts --dry-run --json
```

The dry run previews generation without writing a project. To exercise the generated application,
use a new directory **outside this checkout**:

```powershell
npm run dev -- bootstrap ../cosmos-agent-smoke --template chat-agent-ts --yes
cd ../cosmos-agent-smoke
npm run dev
```

Stop the development server before running further checks. Follow the generated README for
scenario-specific setup, and return to the CLI checkout to continue developing.

### Repository layout

The generator composes a language base with the feature packs selected by a scenario.

| Location | What belongs here |
| --- | --- |
| [`src/cli/`](src/cli/) | Argument parsing, prompts, terminal output, and command dispatch |
| [`src/generator/`](src/generator/) | Template composition, bootstrap, diagnostics, and validation |
| [`src/bases/`](src/bases/) | Language/runtime fundamentals and base templates |
| [`src/features/`](src/features/) | Reusable feature packs; generated files live in each pack's `template/` directory |
| [`src/scenarios/`](src/scenarios/) | Declarative starter definitions that select a base and feature packs |
| [`tests/`](tests/) | CLI, generator, and release tests |
| [`docs/`](docs/) | Tutorials, demo material, and maintainer release guidance |

Edit the source templates, not only a generated project, so future scaffolds include your changes.

### Check and submit a pull request

Run checks from the CLI repository root:

| Command | Purpose |
| --- | --- |
| `npm run dev -- --help` | Run the CLI from source |
| `npm test -- tests/cli/arguments.test.ts` | Example focused test run; choose the test file relevant to your change |
| `npm run lint` | Run ESLint |
| `npm run validate` | Run type checking, the test suite, and the build |

`validate` does not include linting. For code changes, run both `npm run lint` and
`npm run validate` before submitting. If you change generated output, also generate a fresh project
and follow the additional checks in [CONTRIBUTING.md](CONTRIBUTING.md).

- Keep the change focused and add regression tests for behavior changes.
- Update documentation when commands, options, or generated behavior change.
- Push your branch to your fork and open a pull request against this repository's `main` branch.
- Explain the problem, link any related issue, and list the checks you ran. Include screenshots or
  terminal output when useful, with sensitive values removed.

For release history, see the [changelog](CHANGELOG.md). Maintainers must publish npm releases through
the guarded [GitHub release workflow](docs/releasing-npm.md).

## Support and security

- **Questions and bugs:** search [existing issues](https://github.com/sajeetharan/cosmos-agent-starter/issues)
  and follow the [support guide](SUPPORT.md) when opening a report.
- **Security vulnerabilities:** follow [SECURITY.md](SECURITY.md) and report privately, not in a
  public issue.
- **Share your work:** [submit a showcase](https://github.com/sajeetharan/cosmos-agent-starter/issues/new?template=showcase.yml)
  to help other contributors learn from your project.

Never include credentials, connection strings, customer data, or production identifiers in issues,
pull requests, or attached logs.

## License

[MIT](LICENSE)
