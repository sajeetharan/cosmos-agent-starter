# Try create-cosmos-agent

Use this guide to generate and run a full-stack agent locally with the published
`create-cosmos-agent` package and the Azure Cosmos DB Linux emulator. The model response is
deterministic, so no model credentials or Azure subscription are required.

## Prerequisites

- Node.js 20 or later
- Windows Command Prompt
- Git
- Docker Desktop using Linux containers
- Free local ports `3000`, `5173`, `8080`, `8081`, and `1234`

## 1. Install the CLI

Download the release package `create-cosmos-agent-0.6.0.tgz` from GitHub Releases:

```cmd
mkdir C:\Demos
cd /d C:\Demos
curl -LO https://github.com/sajeetharan/cosmos-agent-starter/releases/download/v0.6.0/create-cosmos-agent-0.6.0.tgz
npm install --global create-cosmos-agent-0.6.0.tgz
create-cosmos-agent --version
```

Alternatively, you can install the tarball from your local copy or internal share. The final command
should print `0.6.0`. npm extracts the tarball automatically during installation.

### Optional: Enable Tab completion

Install [Clink](https://chrisant996.github.io/clink/) once:

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

Open Command Prompt again. Press `Tab` to complete commands and parameters, or `Ctrl+Space` to see
the available choices.

## 2. Generate the project

```cmd
create-cosmos-agent bootstrap
```

The CLI explains each choice. Use these answers:

- **Project destination:** `team-agent`
- **Scenario template:** `chat-agent-ts` (customer-ready conversational agent)
- **Development storage:** `cosmos`
- **Cosmos connection:** `emulator`
- Accept the displayed defaults for the remaining choices.
- Confirm the final review. Use Edit to revise a choice or Cancel to exit without writing files.

Bootstrap creates the API and React app, installs dependencies, initializes Git, and adds the local
project context. The default local path does not create Azure resources. If Azure-backed AI or storage
is selected, guided setup offers existing live endpoints, explicit `azd` provisioning, or deferred
configuration. Provisioning requires a separate confirmation and can create billable resources;
Azure OpenAI still requires an existing model deployment and available quota.

After bootstrap finishes:

```cmd
cd team-agent
```

> Standard Command Prompt does not support custom parameter completion. Clink provides the optional
> Tab experience above, while guided setup works with or without Clink.

## 3. Run the application

```cmd
npm run dev
```

Because you selected Cosmos DB and the local emulator, this command automatically:

1. Starts the emulator and waits until it is healthy.
2. Creates the database and containers if needed.
3. Starts the API and web application.

Open `http://localhost:5173`. The page should show the mock provider, Cosmos storage, local tenant
`tenant-demo`, and local user `user-demo`.

Data Explorer is available at `http://localhost:1234` after the emulator is ready.

The Linux vNext emulator is a preview. Request-unit reporting, vector indexing, and hierarchical
partition-key behavior can differ from Azure.

## 4. Try durable memory

Keep the application running. In a second Command Prompt window, enter the generated project folder
and create a durable memory:

```cmd
cd /d C:\Demos\team-agent
curl.exe -X POST http://localhost:3000/api/memories ^
  -H "x-tenant-id: tenant-demo" ^
  -H "x-user-id: user-demo" ^
  -H "x-correlation-id: try-it-remember-001" ^
  -H "Content-Type: application/json" ^
  -d "{\"type\":\"preference\",\"content\":\"The customer prefers deployment notifications in Microsoft Teams.\",\"threadId\":\"web-session\",\"interactionId\":\"try-it-interaction-001\",\"retentionClass\":\"standard\"}"
```

In the web app, ask:

> What notification channel does this customer prefer?

Expand the response citation to inspect the retrieved memory. To check user isolation, switch the
local user to `user-other` and ask the same question; that user should not retrieve `user-demo`'s
memory.

## 5. Run the quality checks

From the second terminal:

```cmd
create-cosmos-agent doctor .
create-cosmos-agent validate .
```

`doctor` examines environment configuration, secret hygiene, and multi-tenant partitioning patterns. `validate` executes the full quality gate: type checking, unit tests, security assertions, build compilation, and Bicep template validation in one unified step.

## 6. Clean up

Stop `npm run dev` with `Ctrl+C`, then run:

```cmd
npm run emulator:stop
cd ..
rmdir /s /q team-agent
del /q create-cosmos-agent-0.6.0.tgz
```

The globally installed CLI remains available. Remove it with
`npm uninstall --global create-cosmos-agent` when it is no longer needed.
