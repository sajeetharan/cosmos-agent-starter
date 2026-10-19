import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { parseArguments, type CliOptions } from "./arguments.js";
import { CliError } from "./errors.js";
import { listScenarios } from "../generator/compose.js";
import { resolveEnvironmentName } from "../generator/bootstrap.js";
import type { Scenario } from "../generator/manifest.js";
import { brandBanner, style } from "./style.js";

export interface WizardTerminal {
  question: (prompt: string) => Promise<string>;
  write: (message: string) => void;
  close: () => void;
}

interface Field {
  key: keyof CliOptions;
  label: string;
  choices?: readonly string[];
}

function fields(options: CliOptions, scenarios: Scenario[]): Field[] {
  const scenario = scenarios.find((item) => item.id === options.template);
  const bootstrap = options.command === "bootstrap";
  const cloud = options.provider === "azure-openai" ||
    (options.storage === "cosmos" && options.localMode === "azure");
  return [
    { key: "destination", label: "Project destination" },
    { key: "template", label: "Scenario template", choices: scenarios.map((item) => item.id) },
    { key: "provider", label: "AI provider (mock needs no credentials)", choices: ["mock", "azure-openai", "openai", "ollama"] },
    ...(!scenario?.capabilities.includes("event-driven") ? [
      { key: "authMode" as const, label: "Development identity", choices: ["local", "entra"] },
    ] : []),
    { key: "storage", label: "Development storage (in-memory resets on restart)", choices: ["in-memory", "cosmos"] },
    ...(options.storage === "cosmos" ? [
      { key: "localMode" as const, label: "Cosmos connection", choices: ["emulator", "azure"] },
    ] : []),
    ...(options.storage === "cosmos" || options.deploy ? [
      { key: "capacity" as const, label: "Azure capacity", choices: ["serverless", "autoscale"] },
    ] : []),
    ...(cloud ? [{
      key: "azureSetup" as const, label: "Azure setup",
      choices: bootstrap && options.provider === "azure-openai"
        ? ["later", "existing", "provision"] : ["later", "existing"],
    }] : []),
    ...(options.azureSetup !== "later" && options.provider === "azure-openai" ? [
      { key: "azureOpenAIEndpoint" as const, label: "Azure OpenAI HTTPS endpoint" },
      { key: "azureOpenAIChatDeployment" as const, label: "Azure OpenAI chat deployment" },
    ] : []),
    ...(options.azureSetup === "existing" && options.storage === "cosmos" && options.localMode === "azure" ? [
      { key: "cosmosEndpoint" as const, label: "Cosmos DB HTTPS endpoint" },
    ] : []),
    ...(options.azureSetup === "provision" ? [
      { key: "azureLocation" as const, label: "Azure region" },
      { key: "entraTenantId" as const, label: "Entra tenant ID" },
      { key: "entraAudience" as const, label: "Entra API audience" },
      { key: "entraClientId" as const, label: "Entra SPA client ID" },
      { key: "entraScope" as const, label: "Entra API scope" },
    ] : []),
    ...(scenario?.capabilities.includes("react-web") ? [
      { key: "includeWeb" as const, label: "Include React web application", choices: ["yes", "no"] },
    ] : []),
    { key: "initializeGit", label: "Initialize Git", choices: ["yes", "no"] },
    ...(bootstrap ? [
      { key: "installDependencies" as const, label: "Install dependencies", choices: ["yes", "no"] },
      { key: "linkProject" as const, label: "Link local context", choices: ["yes", "no"] },
      ...(options.linkProject ? [{ key: "environmentName" as const, label: "Environment name" }] : []),
    ] : []),
  ];
}

function validateField(field: Field, value: string): void {
  if (!value || /[\0\r\n]/.test(value)) throw new Error(`${field.label} is required and must be a single line.`);
  if (field.key === "environmentName") resolveEnvironmentName(".", value);
  if (field.key === "azureOpenAIEndpoint" || field.key === "cosmosEndpoint") {
    try {
      if (new URL(value).protocol !== "https:") throw new Error();
    } catch {
      throw new Error(`${field.label} must be an HTTPS URL.`);
    }
  }
}

function validateOptions(options: CliOptions): void {
  const args = [options.command, options.destination ?? "my-cosmos-agent", "--yes"];
  const values = [
    ["--template", options.template], ["--provider", options.provider],
    ["--auth", options.authMode], ["--storage", options.storage],
    ["--local", options.localMode], ["--capacity", options.capacity],
    ["--azure-setup", options.azureSetup],
    ["--azure-location", options.azureLocation],
    ["--azure-openai-endpoint", options.azureOpenAIEndpoint],
    ["--azure-openai-deployment", options.azureOpenAIChatDeployment],
    ["--cosmos-endpoint", options.cosmosEndpoint],
    ["--entra-tenant-id", options.entraTenantId], ["--entra-audience", options.entraAudience],
    ["--entra-client-id", options.entraClientId], ["--entra-scope", options.entraScope],
    ...(options.command === "bootstrap" ? [["--environment", options.environmentName]] : []),
  ];
  for (const [flag, value] of values) if (flag && value) args.push(flag, value);
  if (options.command === "bootstrap") {
    args.push(options.linkProject ? "--link" : "--no-link");
    if (options.deploy) args.push("--deploy");
  }
  parseArguments(args);
}

export async function runWizard(options: CliOptions, terminal: WizardTerminal): Promise<CliOptions> {
  const selected = { ...options };
  selected.destination ??= "my-cosmos-agent";
  const scenarios = await listScenarios();
  const supplied = new Set(options.suppliedOptions ?? []);
  const visited = new Set<keyof CliOptions>();
  const history: (keyof CliOptions)[] = [];
  let edit: keyof CliOptions | undefined;
  terminal.write(`${brandBanner()}\n${style.bold("Guided setup")}\n` +
    "Enter accepts the current value. Type back or cancel at any question.\n" +
    "Explicit flags are retained. Use the final Edit menu to override them.\n" +
    "Step totals update as conditional choices become relevant.");
  while (true) {
    const visible = fields(selected, scenarios);
    const pending = visible.filter((field) => !supplied.has(field.key));
    const field = edit ? visible.find((item) => item.key === edit)
      : pending.find((item) => !visited.has(item.key));
    if (!field) {
      terminal.write("Review before creating files:");
      visible.forEach((item, index) => terminal.write(
        `${index + 1}. ${item.label}: ${String(selected[item.key] ?? "(not configured)")}`,
      ));
      const action = (await terminal.question("1. Confirm  2. Edit  3. Cancel [1]: ")).trim().toLowerCase();
      if (action === "3" || action === "cancel") throw cancelled();
      if (action === "2" || action === "edit" || action === "back") {
        const answer = await terminal.question(`Edit which field (1-${visible.length}), or back? `);
        if (answer.trim().toLowerCase() === "cancel") throw cancelled();
        const index = /^\d+$/.test(answer.trim()) ? Number(answer.trim()) - 1 : -1;
        if (!visible[index]) { terminal.write("Choose a listed field number."); continue; }
        edit = visible[index].key;
        continue;
      }
      if (action !== "" && action !== "1" && action !== "confirm") {
        terminal.write("Choose Confirm, Edit, or Cancel."); continue;
      }
      try {
        validateOptions(selected);
      } catch (error) {
        terminal.write(error instanceof Error ? error.message : String(error));
        continue;
      }
      if (selected.deploy || selected.azureSetup === "provision") {
        const consent = (await terminal.question(
          "Billable deployment requested. Type deploy to approve, back to edit, or cancel [cancel]: ",
        )).trim().toLowerCase();
        if (consent === "back") continue;
        if (consent !== "deploy") throw cancelled();
      }
      return selected;
    }
    const position = pending.findIndex((item) => item.key === field.key);
    terminal.write(`${edit ? "Editing" : `Step ${position + 1} of ${pending.length}`}: ${field.label}`);
    field.choices?.forEach((choice, index) => terminal.write(`  ${index + 1}. ${choice}`));
    const current = selected[field.key] ??
      (field.key === "environmentName" ? resolveEnvironmentName(selected.destination!) : "");
    const fallback = typeof current === "boolean" ? current ? "yes" : "no" : String(current);
    const answer = (await terminal.question(`${field.label} [${fallback}]: `)).trim();
    if (answer.toLowerCase() === "cancel") throw cancelled();
    if (answer.toLowerCase() === "back") {
      const previous = history.pop();
      if (previous) { visited.delete(previous); edit = previous; }
      else terminal.write("Already at the first question.");
      continue;
    }
    let value = answer || fallback;
    if (field.choices) {
      if (/^\d+$/.test(value)) value = field.choices[Number(value) - 1] ?? "";
      if (!field.choices.includes(value)) {
        terminal.write("Choose a listed number or option value."); continue;
      }
    }
    try {
      validateField(field, value);
    } catch (error) {
      terminal.write(error instanceof Error ? error.message : String(error)); continue;
    }
    Object.assign(selected, { [field.key]: typeof current === "boolean" ? value === "yes" : value });
    if (field.key === "azureSetup") selected.deploy = value === "provision" || Boolean(options.deploy);
    visited.add(field.key);
    history.push(field.key);
    edit = undefined;
  }
}

function cancelled(): CliError {
  return new CliError("CLI_CANCELLED", "Setup cancelled before filesystem changes.", ["Run wizard again when ready."]);
}

export async function completeInteractiveOptions(options: CliOptions): Promise<CliOptions> {
  if (options.yes) return options;
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new CliError("CLI_NON_INTERACTIVE", "Interactive setup requires a terminal.",
      ["Supply a destination and --yes to explicitly accept defaults, or use --dry-run."]);
  }
  const readline = createInterface({ input: stdin, output: stdout });
  const controller = new AbortController();
  const abort = () => controller.abort();
  readline.once("SIGINT", abort);
  readline.once("close", abort);
  try {
    return await runWizard(options, {
      question: async (prompt) => {
        if (controller.signal.aborted) throw cancelled();
        try {
          return await readline.question(prompt, { signal: controller.signal });
        } catch (error) {
          if (controller.signal.aborted) throw cancelled();
          throw error;
        }
      },
      write: (message) => console.log(message),
      close: () => readline.close(),
    });
  } finally {
    readline.close();
  }
}
