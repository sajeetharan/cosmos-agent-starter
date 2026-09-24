import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import type { ProjectManifest } from "./manifest.js";

const execFileAsync = promisify(execFile);

export type ReadinessSeverity = "error" | "warning" | "info";

export interface AzureReadinessFinding {
  severity: ReadinessSeverity;
  code: string;
  message: string;
  remediation: string;
}

export interface AzureReadinessResult {
  ready: boolean;
  environmentName: string;
  findings: AzureReadinessFinding[];
}

export interface ReadinessCommand {
  executable: string;
  args: string[];
  cwd: string;
}

export interface ReadinessCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type ReadinessCommandRunner = (
  command: ReadinessCommand,
) => Promise<ReadinessCommandResult>;

interface ProjectContext {
  environmentName?: string;
}

export const runReadinessCommand: ReadinessCommandRunner = async (command) => {
  try {
    const result = await execFileAsync(command.executable, command.args, {
      cwd: command.cwd,
      windowsHide: true,
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & {
      code?: string | number;
      stdout?: string;
      stderr?: string;
    };
    return {
      exitCode: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? failure.message,
    };
  }
};

function finding(
  severity: ReadinessSeverity,
  code: string,
  message: string,
  remediation: string,
): AzureReadinessFinding {
  return { severity, code, message, remediation };
}

function parseEnvironmentValues(output: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    const raw = match[2]!.trim();
    const value =
      raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')
        ? raw.slice(1, -1).replaceAll('\\"', '"')
        : raw;
    values.set(match[1]!, value);
  }
  return values;
}

async function configuredEnvironmentName(
  root: string,
  requested?: string,
): Promise<string> {
  if (requested?.trim()) return requested.trim();
  try {
    const context = JSON.parse(
      await readFile(join(root, ".cosmos-agent", "context.json"), "utf8"),
    ) as ProjectContext;
    if (context.environmentName?.trim()) return context.environmentName.trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return basename(root).toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 32);
}

function requireValues(
  values: Map<string, string>,
  names: string[],
  findings: AzureReadinessFinding[],
  reason: string,
): void {
  const missing = names.filter((name) => !values.get(name)?.trim());
  if (missing.length === 0) return;
  findings.push(finding(
    "error",
    "AZURE_ENV_VALUES",
    `${reason}: ${missing.join(", ")}`,
    missing.map((name) => `azd env set ${name} "<value>"`).join(" && "),
  ));
}

export async function runAzureReadiness(
  root: string,
  requestedEnvironment?: string,
  runner: ReadinessCommandRunner = runReadinessCommand,
): Promise<AzureReadinessResult> {
  const findings: AzureReadinessFinding[] = [];
  const environmentName = await configuredEnvironmentName(root, requestedEnvironment);
  let manifest: ProjectManifest;
  try {
    manifest = JSON.parse(
      await readFile(join(root, "cosmos-project.json"), "utf8"),
    ) as ProjectManifest;
    await readFile(join(root, "azure.yaml"), "utf8");
  } catch {
    findings.push(finding(
      "error",
      "AZURE_PROJECT",
      "This directory is not a complete generated Cosmos Agent project.",
      "Run this command from a generated project containing cosmos-project.json and azure.yaml.",
    ));
    return { ready: false, environmentName, findings };
  }

  const version = await runner({ executable: "azd", args: ["version"], cwd: root });
  if (version.exitCode !== 0) {
    findings.push(finding(
      "error",
      "AZD_INSTALL",
      "Azure Developer CLI is not available.",
      "Install azd from https://aka.ms/install-azd and retry.",
    ));
    return { ready: false, environmentName, findings };
  }
  findings.push(finding("info", "AZD_INSTALL", "Azure Developer CLI is available.", "No action required."));

  const auth = await runner({
    executable: "azd",
    args: ["auth", "login", "--check-status"],
    cwd: root,
  });
  if (auth.exitCode !== 0) {
    findings.push(finding(
      "error",
      "AZD_AUTH",
      "Azure Developer CLI is not signed in.",
      "Run azd auth login, then retry.",
    ));
  } else {
    findings.push(finding("info", "AZD_AUTH", "Azure Developer CLI authentication is ready.", "No action required."));
  }

  const environment = await runner({
    executable: "azd",
    args: ["env", "get-values", "--environment", environmentName],
    cwd: root,
  });
  if (environment.exitCode !== 0) {
    findings.push(finding(
      "error",
      "AZD_ENVIRONMENT",
      `Azure environment "${environmentName}" has not been configured.`,
      `Run azd env new ${environmentName}, then set the values shown by this command and retry.`,
    ));
    return {
      ready: false,
      environmentName,
      findings: [
        ...findings,
        finding(
          "info",
          "COSMOS_CAPACITY",
          `The deployment uses Cosmos DB ${manifest.cosmos.capacity} capacity.`,
          "Confirm the selected region supports the capacity model before provisioning.",
        ),
      ],
    };
  }

  const values = parseEnvironmentValues(environment.stdout);
  requireValues(values, ["AZURE_LOCATION"], findings, "Select an Azure region");
  if (!manifest.features?.includes("event-driven")) {
    requireValues(
      values,
      ["ENTRA_TENANT_ID", "ENTRA_AUDIENCE", "ENTRA_CLIENT_ID", "ENTRA_SCOPE"],
      findings,
      "Configure the Microsoft Entra API and SPA registrations",
    );
  }

  const provider = values.get("AI_PROVIDER")?.trim() || "azure-openai";
  if (provider === "azure-openai") {
    requireValues(
      values,
      ["AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_CHAT_DEPLOYMENT"],
      findings,
      "Configure an existing Azure OpenAI deployment",
    );
    findings.push(finding(
      "warning",
      "MODEL_CAPACITY",
      "Model capacity is not provisioned by this starter and cannot be inferred from the endpoint.",
      "Confirm the configured deployment exists, has available quota in AZURE_LOCATION, and grants the runtime identity Cognitive Services OpenAI User access.",
    ));
  } else if (provider === "openai") {
    requireValues(values, ["OPENAI_API_KEY"], findings, "Configure the OpenAI provider");
  } else if (provider === "mock") {
    findings.push(finding(
      "error",
      "PRODUCTION_PROVIDER",
      "The deterministic mock provider is blocked in production.",
      "Set AI_PROVIDER to azure-openai or openai and configure that provider.",
    ));
  } else if (provider === "ollama") {
    findings.push(finding(
      "error",
      "PRODUCTION_PROVIDER",
      "The default localhost Ollama endpoint is not reachable from Azure Container Apps.",
      "Use azure-openai/openai, or configure a secured Ollama endpoint reachable from the container app.",
    ));
  } else {
    findings.push(finding(
      "error",
      "PRODUCTION_PROVIDER",
      `Unsupported production provider "${provider}".`,
      "Set AI_PROVIDER to azure-openai or openai.",
    ));
  }

  if (!values.get("AZURE_PRINCIPAL_ID")?.trim()) {
    findings.push(finding(
      "warning",
      "DEPLOYMENT_RBAC",
      "AZURE_PRINCIPAL_ID is not set, so the deployer will not receive Cosmos DB data-plane access.",
      "Set AZURE_PRINCIPAL_ID to the deployer object ID only when post-deployment data access is required.",
    ));
  }
  findings.push(finding(
    "info",
    "COSMOS_CAPACITY",
    `The deployment uses Cosmos DB ${manifest.cosmos.capacity} capacity.`,
    "Confirm the selected region supports the capacity model before provisioning.",
  ));

  return {
    ready: !findings.some((item) => item.severity === "error"),
    environmentName,
    findings,
  };
}
