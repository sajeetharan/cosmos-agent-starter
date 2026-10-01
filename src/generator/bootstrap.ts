import { execFile, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import {
  runAzureReadiness,
  type AzureReadinessResult,
} from "./azure-readiness.js";

const execFileAsync = promisify(execFile);

export interface BootstrapCommand {
  executable: string;
  args: string[];
  cwd: string;
  silent: boolean;
}

export type BootstrapCommandRunner = (command: BootstrapCommand) => Promise<void>;
export type AzureReadinessRunner = (
  root: string,
  environmentName?: string,
) => Promise<AzureReadinessResult>;

export interface BootstrapProjectOptions {
  destination: string;
  template: string;
  installDependencies: boolean;
  initializeGit: boolean;
  linkProject: boolean;
  deploy: boolean;
  environmentName?: string;
  silent?: boolean;
  onProgress?: (progress: BootstrapProgress) => void;
  azureProvisioning?: AzureProvisioningConfiguration;
}

export interface AzureProvisioningConfiguration {
  location: string;
  provider: "azure-openai";
  azureOpenAIEndpoint: string;
  azureOpenAIChatDeployment: string;
  entraTenantId: string;
  entraAudience: string;
  entraClientId: string;
  entraScope: string;
}

export interface BootstrapProgress {
  stage: "dependencies" | "git" | "context" | "azure" | "readiness" | "deployment";
  status: "started" | "completed";
  message: string;
}

export interface BootstrapResult {
  destination: string;
  environmentName?: string;
  dependenciesInstalled: boolean;
  gitInitialized: boolean;
  linked: boolean;
  deployed: boolean;
}

interface ProjectContext {
  schemaVersion: 1;
  projectManifest: "cosmos-project.json";
  azureConfig: "azure.yaml";
  template: string;
  environmentName: string;
  deploymentStatus: "local" | "deployed";
  linkedAt: string;
  deployedAt?: string;
}

export function resolveEnvironmentName(destination: string, configured?: string): string {
  const candidate = configured?.trim() || basename(destination).toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,31}$/.test(candidate)) {
    throw new Error(
      'Azure environment names must start with a letter or number and contain at most 32 letters, numbers, or "-".',
    );
  }
  return candidate;
}

export const runBootstrapCommand: BootstrapCommandRunner = async (command) => {
  try {
    if (command.silent) {
      await execFileAsync(command.executable, command.args, {
        cwd: command.cwd,
        maxBuffer: 20 * 1024 * 1024,
        windowsHide: true,
      });
    } else {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(command.executable, command.args, {
          cwd: command.cwd,
          stdio: "inherit",
          windowsHide: true,
        });
        child.once("error", reject);
        child.once("close", (code, signal) => {
          if (code === 0) resolve();
          else reject(new Error(
            signal ? `terminated by signal ${signal}` : `exited with code ${code}`,
          ));
        });
      });
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (detail.includes("ENOENT")) {
      throw new Error(
        `Required command "${command.executable}" was not found. Install it and retry bootstrap.`,
      );
    }
    throw new Error(`${command.executable} ${command.args.join(" ")} failed: ${detail}`);
  }
};

async function writeContext(
  destination: string,
  context: ProjectContext,
): Promise<void> {
  const directory = join(destination, ".cosmos-agent");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "context.json"), `${JSON.stringify(context, null, 2)}\n`);
}

export async function bootstrapProject(
  options: BootstrapProjectOptions,
  runner: BootstrapCommandRunner = runBootstrapCommand,
  readiness: AzureReadinessRunner = runAzureReadiness,
): Promise<BootstrapResult> {
  const silent = options.silent ?? false;
  const report = (progress: BootstrapProgress) => {
    if (!silent) options.onProgress?.(progress);
  };
  if (options.deploy && !options.linkProject) {
    throw new Error("Azure deployment requires a linked project context.");
  }
  if (options.installDependencies) {
    report({
      stage: "dependencies",
      status: "started",
      message: "Installing project dependencies...",
    });
    const npmCommand = process.platform === "win32"
      ? {
          executable: process.env.ComSpec || "cmd.exe",
          args: ["/d", "/s", "/c", "npm install"],
        }
      : { executable: "npm", args: ["install"] };
    await runner({
      ...npmCommand,
      cwd: options.destination,
      silent,
    });
    report({
      stage: "dependencies",
      status: "completed",
      message: "Dependencies installed",
    });
  }
  if (options.initializeGit) {
    report({ stage: "git", status: "started", message: "Initializing Git repository..." });
    await runner({
      executable: "git",
      args: ["init"],
      cwd: options.destination,
      silent,
    });
    report({ stage: "git", status: "completed", message: "Git repository initialized" });
  }
  const environmentName = options.linkProject
    ? resolveEnvironmentName(options.destination, options.environmentName)
    : undefined;
  const linkedAt = new Date().toISOString();
  if (environmentName) {
    report({
      stage: "context",
      status: "started",
      message: "Linking local project context...",
    });
    await writeContext(options.destination, {
      schemaVersion: 1,
      projectManifest: "cosmos-project.json",
      azureConfig: "azure.yaml",
      template: options.template,
      environmentName,
      deploymentStatus: "local",
      linkedAt,
    });
    report({
      stage: "context",
      status: "completed",
      message: `Project context linked to ${environmentName}`,
    });
  }
  if (options.azureProvisioning && environmentName) {
    report({ stage: "azure", status: "started", message: "Configuring Azure environment..." });
    if (!silent) {
      await runner({
        executable: "azd",
        args: ["auth", "login"],
        cwd: options.destination,
        silent,
      });
    }
    await runner({
      executable: "azd",
      args: [
        "env", "new", environmentName,
        "--location", options.azureProvisioning.location,
        "--no-prompt",
      ],
      cwd: options.destination,
      silent,
    });
    const values: Record<string, string> = {
      AZURE_LOCATION: options.azureProvisioning.location,
      AI_PROVIDER: options.azureProvisioning.provider,
      AZURE_OPENAI_ENDPOINT: options.azureProvisioning.azureOpenAIEndpoint,
      AZURE_OPENAI_CHAT_DEPLOYMENT: options.azureProvisioning.azureOpenAIChatDeployment,
      ENTRA_TENANT_ID: options.azureProvisioning.entraTenantId,
      ENTRA_AUDIENCE: options.azureProvisioning.entraAudience,
      ENTRA_CLIENT_ID: options.azureProvisioning.entraClientId,
      ENTRA_SCOPE: options.azureProvisioning.entraScope,
    };
    for (const [name, value] of Object.entries(values)) {
      await runner({
        executable: "azd",
        args: ["env", "set", name, value, "--environment", environmentName, "--no-prompt"],
        cwd: options.destination,
        silent,
      });
    }
    report({
      stage: "azure",
      status: "completed",
      message: `Azure environment ${environmentName} configured`,
    });
  }
  if (options.deploy && environmentName) {
    report({
      stage: "readiness",
      status: "started",
      message: "Checking Azure deployment readiness...",
    });
    const result = await readiness(options.destination, environmentName);
    if (!result.ready) {
      const blockers = result.findings
        .filter((item) => item.severity === "error")
        .map((item) => `${item.message} ${item.remediation}`);
      throw new Error(
        `Azure deployment is not ready:\n- ${blockers.join("\n- ")}\n` +
          `Run create-cosmos-agent prepare-azure . --environment ${environmentName} for the full report.`,
      );
    }
    report({
      stage: "readiness",
      status: "completed",
      message: "Azure deployment readiness confirmed",
    });
    report({
      stage: "deployment",
      status: "started",
      message: "Deploying project to Azure...",
    });
    await runner({
      executable: "azd",
      args: ["up", "--environment", environmentName, "--no-prompt"],
      cwd: options.destination,
      silent,
    });
    await writeContext(options.destination, {
      schemaVersion: 1,
      projectManifest: "cosmos-project.json",
      azureConfig: "azure.yaml",
      template: options.template,
      environmentName,
      deploymentStatus: "deployed",
      linkedAt,
      deployedAt: new Date().toISOString(),
    });
    report({
      stage: "deployment",
      status: "completed",
      message: "Azure deployment completed",
    });
  }
  return {
    destination: options.destination,
    ...(environmentName ? { environmentName } : {}),
    dependenciesInstalled: options.installDependencies,
    gitInitialized: options.initializeGit,
    linked: options.linkProject,
    deployed: options.deploy,
  };
}
