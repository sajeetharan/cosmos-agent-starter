import { createInterface, type Interface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type {
  AIProvider,
  AuthMode,
  AzureSetup,
  Capacity,
  CliOptions,
  LocalMode,
  StorageBackend,
} from "./arguments.js";
import { listScenarios } from "../generator/compose.js";
import { resolveEnvironmentName } from "../generator/bootstrap.js";
import {
  badge,
  box,
  brandBanner,
  style,
  symbols,
  type BadgeType,
} from "./style.js";

interface Choice<T extends string> {
  value: T;
  label: string;
  description: string;
  badge?: BadgeType | undefined;
}

interface StepMeta {
  step?: string | undefined;
  category?: string | undefined;
}

async function choose<T extends string>(
  readline: Interface,
  question: string,
  choices: readonly Choice<T>[],
  fallback: T,
  meta?: StepMeta,
): Promise<T> {
  if (meta?.step) {
    console.log(`\n${style.cyan(symbols.step)} ${style.bold(meta.step)}${meta.category ? ` ${style.dim(`· ${meta.category}`)}` : ""}`);
  }
  console.log(`  ${style.bold(question)}`);
  for (const [index, choice] of choices.entries()) {
    const isDefault = choice.value === fallback;
    const defaultBadge = isDefault ? ` ${badge("default", "default")}` : "";
    const extraBadge = choice.badge ? ` ${badge(choice.badge, choice.badge)}` : "";
    const prefix = isDefault ? style.cyan("❯") : " ";
    const num = isDefault ? style.cyan(String(index + 1)) : style.dim(String(index + 1));
    const label = isDefault ? style.bold(choice.label) : choice.label;
    console.log(`  ${prefix} ${num}. ${label}${defaultBadge}${extraBadge}`);
    console.log(`       ${style.dim(choice.description)}`);
  }
  const fallbackIndex = choices.findIndex((choice) => choice.value === fallback) + 1;
  while (true) {
    const answer = (await readline.question(
      `  ${style.cyan(symbols.pointer)} Select an option [${fallbackIndex}]: `,
    ))
      .trim()
      .toLowerCase();
    if (!answer) {
      const selected = choices.find((choice) => choice.value === fallback) ?? choices[fallbackIndex - 1]!;
      console.log(`  ${style.green(symbols.check)} ${meta?.category ?? question} ${style.dim("›")} ${style.cyan(style.bold(selected.label))}\n`);
      return fallback;
    }
    const selectedIndex = Number.parseInt(answer, 10);
    if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= choices.length) {
      const selected = choices[selectedIndex - 1]!;
      console.log(`  ${style.green(symbols.check)} ${meta?.category ?? question} ${style.dim("›")} ${style.cyan(style.bold(selected.label))}\n`);
      return selected.value;
    }
    const selected = choices.find((choice) => choice.value.toLowerCase() === answer);
    if (selected) {
      console.log(`  ${style.green(symbols.check)} ${meta?.category ?? question} ${style.dim("›")} ${style.cyan(style.bold(selected.label))}\n`);
      return selected.value;
    }
    console.log(`  ${style.yellow(symbols.warn)} Choose a number from 1 to ${choices.length} or enter an option value.`);
  }
}

async function askValue(
  readline: Interface,
  question: string,
  configured?: string,
  fallback?: string,
  meta?: StepMeta,
): Promise<string> {
  if (configured?.trim()) return configured.trim();
  if (meta?.step) {
    console.log(`\n${style.cyan(symbols.step)} ${style.bold(meta.step)}${meta.category ? ` ${style.dim(`· ${meta.category}`)}` : ""}`);
  }
  const suffix = fallback ? style.dim(` [${fallback}]`) : "";
  const value = (await readline.question(`  ${style.cyan(symbols.pointer)} ${question}${suffix}: `)).trim() || fallback;
  if (!value) throw new Error(`${question} is required.`);
  console.log(`  ${style.green(symbols.check)} ${meta?.category ?? question} ${style.dim("›")} ${style.cyan(style.bold(value))}\n`);
  return value;
}

function requireHttpsUrl(value: string, label: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error();
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${label} must be an HTTPS URL.`);
  }
}

export async function completeInteractiveOptions(options: CliOptions): Promise<CliOptions> {
  if (options.yes) return options;
  const readline = createInterface({ input: stdin, output: stdout });
  try {
    console.log(`\n${brandBanner()}`);
    const setupTitle = options.command === "bootstrap" ? "Bootstrap Guided Setup" : "Guided Agent Setup";
    console.log(`\n${style.bold(style.cyan(`✦ ${setupTitle}`))} ${style.dim("· Press Enter to accept recommended defaults")}`);

    const hasDestination = Boolean(options.destination);
    const totalSteps = (hasDestination ? 0 : 1) + 7 + (options.command === "bootstrap" ? 2 : 0);
    let stepIndex = 1;

    let destination = options.destination;
    if (!destination) {
      console.log(`\n${style.cyan(symbols.step)} ${style.bold(`Step ${stepIndex} of ${totalSteps}`)} ${style.dim("· Project Destination")}`);
      console.log(`  Where should your agent project be created?`);
      const answer = (await readline.question(`  ${style.cyan(symbols.pointer)} Destination [my-cosmos-agent]: `)).trim();
      destination = answer || "my-cosmos-agent";
      console.log(`  ${style.green(symbols.check)} Project Destination ${style.dim("›")} ${style.cyan(style.bold(destination))}`);
      stepIndex += 1;
    }

    const scenarios = await listScenarios();
    const template = await choose(
      readline,
      "What do you want to build?",
      scenarios.map((scenario) => ({
        value: scenario.id,
        label: scenario.name,
        description: scenario.description,
        badge: scenario.id === "chat-agent-ts" ? "recommended" : undefined,
      })),
      options.template,
      { step: `Step ${stepIndex++} of ${totalSteps}`, category: "Scenario Template" },
    );
    const provider = await choose<AIProvider>(
      readline,
      "Which AI provider should local development use?",
      [
        {
          value: "mock",
          label: "Local deterministic provider",
          description: "Starts immediately without credentials; development only.",
          badge: "local",
        },
        {
          value: "azure-openai",
          label: "Azure OpenAI",
          description: "Uses DefaultAzureCredential or an explicit development key.",
          badge: "production",
        },
        {
          value: "openai",
          label: "OpenAI",
          description: "Uses an OpenAI API key and configurable model.",
        },
        {
          value: "ollama",
          label: "Ollama",
          description: "Runs with a local or remote Ollama model server.",
          badge: "local",
        },
      ],
      options.provider,
      { step: `Step ${stepIndex++} of ${totalSteps}`, category: "AI Model Provider" },
    );
    const authMode = await choose<AuthMode>(
      readline,
      "How should users authenticate during development?",
      [
        {
          value: "local",
          label: "Local development identity",
          description: "Uses trusted tenant and user headers; blocked in production.",
          badge: "local",
        },
        {
          value: "entra",
          label: "Microsoft Entra ID",
          description: "Validates bearer tokens and enables MSAL sign-in in the React UI.",
          badge: "production",
        },
      ],
      options.authMode,
      { step: `Step ${stepIndex++} of ${totalSteps}`, category: "Authentication Strategy" },
    );
    const storage = await choose<StorageBackend>(
      readline,
      "Where should development data be stored?",
      [
        {
          value: "in-memory",
          label: "In-memory",
          description: "Zero configuration and resets when the API restarts.",
          badge: "local",
        },
        {
          value: "cosmos",
          label: "Azure Cosmos DB",
          description: "Durable memory, knowledge, tickets, and action state.",
          badge: "durable",
        },
      ],
      options.storage,
      { step: `Step ${stepIndex++} of ${totalSteps}`, category: "Data Storage" },
    );
    const localMode = await choose<LocalMode>(
      readline,
      "Which Cosmos DB connection should configuration target?",
      [
        {
          value: "emulator",
          label: "Local emulator",
          description: "Gateway connection with an emulator-only key.",
          badge: "local",
        },
        {
          value: "azure",
          label: "Azure",
          description: "Managed identity through DefaultAzureCredential.",
          badge: "production",
        },
      ],
      options.localMode,
      { step: `Cosmos DB Connection`, category: "Connection Target" },
    );
    const capacity = await choose<Capacity>(
      readline,
      "Which Azure Cosmos DB capacity model should infrastructure use?",
      [
        {
          value: "serverless",
          label: "Serverless",
          description: "Best for intermittent development and lower-volume workloads.",
          badge: "recommended",
        },
        {
          value: "autoscale",
          label: "Autoscale",
          description: "Best for variable production traffic with throughput guarantees.",
          badge: "production",
        },
      ],
      options.capacity,
      { step: `Step ${stepIndex++} of ${totalSteps}`, category: "Cosmos DB Capacity" },
    );
    const usesAzureResources =
      provider === "azure-openai" || (storage === "cosmos" && localMode === "azure");
    let azureSetup = options.azureSetup;
    let azureLocation = options.azureLocation;
    let azureOpenAIEndpoint = options.azureOpenAIEndpoint;
    let azureOpenAIChatDeployment = options.azureOpenAIChatDeployment;
    let cosmosEndpoint = options.cosmosEndpoint;
    let entraTenantId = options.entraTenantId;
    let entraAudience = options.entraAudience;
    let entraClientId = options.entraClientId;
    let entraScope = options.entraScope;
    let environmentName = options.environmentName;
    let deploy = options.deploy;
    if (usesAzureResources) {
      const setupChoices: Choice<AzureSetup>[] = [
        {
          value: "existing",
          label: "Use existing Azure resources",
          description: "Configure live resource endpoints in the generated project.",
        },
        ...(options.command === "bootstrap" && provider === "azure-openai" ? [{
          value: "provision" as const,
          label: "Provision application infrastructure with azd",
          description: "Creates billable Cosmos DB, Container Apps, identity, and monitoring resources; model deployment remains bring-your-own.",
        }] : []),
        {
          value: "later",
          label: "Configure Azure later",
          description: "Generate placeholders and continue without connecting to live resources.",
        },
      ];
      azureSetup = await choose(
        readline,
        "How should Azure resources be configured?",
        setupChoices,
        options.deploy ? "provision" : "existing",
      );
      if (azureSetup === "provision") {
        const confirmation = await choose(
          readline,
          "Provision billable Azure resources after generation?",
          [
            { value: "no", label: "No", description: "Generate the project without creating resources." },
            { value: "yes", label: "Yes", description: "Authenticate with Azure and run azd up after readiness checks." },
          ],
          "no",
        );
        if (confirmation === "no") azureSetup = "later";
      }
      if (azureSetup !== "later" && provider === "azure-openai") {
        azureOpenAIEndpoint = requireHttpsUrl(await askValue(
          readline,
          "Azure OpenAI endpoint",
          azureOpenAIEndpoint,
        ), "Azure OpenAI endpoint");
        azureOpenAIChatDeployment = await askValue(
          readline,
          "Azure OpenAI chat deployment name",
          azureOpenAIChatDeployment,
        );
      }
      if (azureSetup === "existing" && storage === "cosmos" && localMode === "azure") {
        cosmosEndpoint = requireHttpsUrl(await askValue(
          readline,
          "Azure Cosmos DB endpoint",
          cosmosEndpoint,
        ), "Azure Cosmos DB endpoint");
      }
      if (azureSetup === "provision") {
        deploy = true;
        environmentName = await askValue(
          readline,
          "Azure environment name",
          environmentName,
          resolveEnvironmentName(destination),
        );
        azureLocation = await askValue(readline, "Azure location", azureLocation, "eastus2");
        entraTenantId = await askValue(readline, "Microsoft Entra tenant ID", entraTenantId);
        entraAudience = await askValue(readline, "Microsoft Entra API audience", entraAudience);
        entraClientId = await askValue(readline, "Microsoft Entra SPA client ID", entraClientId);
        entraScope = await askValue(readline, "Microsoft Entra API scope", entraScope);
      } else {
        deploy = false;
      }
    }
    const web = await choose(
      readline,
      "Include the React customer application?",
      [
        { value: "yes", label: "Yes", description: "Chat, knowledge, support, agents, and operations UI.", badge: "recommended" },
        { value: "no", label: "No", description: "Generate an API-only project." },
      ],
      options.includeWeb ? "yes" : "no",
      { step: `Step ${stepIndex++} of ${totalSteps}`, category: "React Web Portal" },
    );
    const git = await choose(
      readline,
      "Initialize a Git repository?",
      [
        { value: "yes", label: "Yes", description: "Create a new local Git repository.", badge: "recommended" },
        { value: "no", label: "No", description: "Leave source control initialization to you." },
      ],
      options.initializeGit ? "yes" : "no",
      { step: `Step ${stepIndex++} of ${totalSteps}`, category: "Version Control" },
    );
    const install = options.command === "bootstrap"
      ? await choose(
          readline,
          "Install project dependencies?",
          [
            { value: "yes", label: "Yes", description: "Run npm install after scaffolding.", badge: "recommended" },
            { value: "no", label: "No", description: "Install dependencies later." },
          ],
          options.installDependencies ? "yes" : "no",
          { step: `Step ${stepIndex++} of ${totalSteps}`, category: "Dependencies" },
        )
      : "no";
    const link = options.command === "bootstrap"
      ? await choose(
          readline,
          "Link this directory to a local Cosmos Agent project context?",
          [
            { value: "yes", label: "Yes", description: "Create local environment context for Azure deployment.", badge: "recommended" },
            { value: "no", label: "No", description: "Leave the generated directory unlinked." },
          ],
          options.linkProject ? "yes" : "no",
          { step: `Step ${stepIndex++} of ${totalSteps}`, category: "Project Link" },
        )
      : "no";
    if (deploy && link !== "yes") {
      throw new Error("Azure provisioning requires a linked project context.");
    }

    const selectedScenario = scenarios.find((s) => s.id === template);
    const summaryItems = [
      `${style.bold("Destination:")}    ${destination}`,
      `${style.bold("Scenario:")}       ${selectedScenario?.name ?? template} ${style.dim(`(${template})`)}`,
      `${style.bold("AI Provider:")}    ${provider}`,
      `${style.bold("Auth Strategy:")}  ${authMode === "entra" ? "Microsoft Entra ID" : "Local Development Identity"}`,
      `${style.bold("Data Storage:")}   ${storage === "cosmos" ? `Azure Cosmos DB (${localMode})` : "In-memory"}`,
      `${style.bold("Capacity:")}       ${capacity}`,
      `${style.bold("Web Portal:")}     ${web === "yes" ? style.green("Included (React + Vite)") : style.dim("Excluded (API only)")}`,
      `${style.bold("Git Repository:")} ${git === "yes" ? style.green("Initialized") : style.dim("Skipped")}`,
      ...(options.command === "bootstrap" ? [
        `${style.bold("Dependencies:")}   ${install === "yes" ? style.green("Install via npm") : style.dim("Skipped")}`,
        `${style.bold("Project Link:")}   ${link === "yes" ? style.green(`Linked (${environmentName || "local"})`) : style.dim("Skipped")}`,
        ...(deploy ? [`${style.bold("Azure Deploy:")}   ${style.cyan("azd up after generation")}`] : []),
      ] : []),
    ];
    console.log(`\n${box(summaryItems, "Configuration Summary", style.cyan)}`);

    return {
      ...options,
      destination,
      template,
      provider,
      authMode,
      storage,
      localMode,
      capacity,
      includeWeb: web === "yes",
      initializeGit: git === "yes",
      installDependencies: install === "yes",
      linkProject: link === "yes",
      deploy,
      azureSetup,
      ...(environmentName ? { environmentName } : {}),
      ...(azureLocation ? { azureLocation } : {}),
      ...(azureOpenAIEndpoint ? { azureOpenAIEndpoint } : {}),
      ...(azureOpenAIChatDeployment ? { azureOpenAIChatDeployment } : {}),
      ...(cosmosEndpoint ? { cosmosEndpoint } : {}),
      ...(entraTenantId ? { entraTenantId } : {}),
      ...(entraAudience ? { entraAudience } : {}),
      ...(entraClientId ? { entraClientId } : {}),
      ...(entraScope ? { entraScope } : {}),
    };
  } finally {
    readline.close();
  }
}
