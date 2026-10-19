import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BootstrapProjectOptions, BootstrapProgress } from "./bootstrap.js";

export type BootstrapStage = BootstrapProgress["stage"];
export interface BootstrapState {
  schemaVersion: 1;
  template: string;
  installDependencies: boolean;
  initializeGit: boolean;
  linkProject: boolean;
  deploymentRequested: boolean;
  azureConfigurationRequired: boolean;
  deploymentUncertain?: boolean;
  environmentName?: string;
  completed: BootstrapStage[];
  active?: BootstrapStage;
  failed?: BootstrapStage;
}

const stages: BootstrapStage[] = ["dependencies", "git", "context", "azure", "readiness", "deployment"];

function isState(value: unknown): value is BootstrapState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  return state.schemaVersion === 1 && typeof state.template === "string" &&
    ["installDependencies", "initializeGit", "linkProject", "deploymentRequested", "azureConfigurationRequired"]
      .every((key) => typeof state[key] === "boolean") &&
    (state.environmentName === undefined || typeof state.environmentName === "string") &&
    (state.deploymentUncertain === undefined || typeof state.deploymentUncertain === "boolean") &&
    Array.isArray(state.completed) && state.completed.every((stage) => stages.includes(stage)) &&
    (state.active === undefined || stages.some((stage) => stage === state.active)) &&
    (state.failed === undefined || stages.some((stage) => stage === state.failed));
}

export async function readBootstrapState(root: string): Promise<BootstrapState> {
  const value: unknown = JSON.parse(await readFile(join(root, ".cosmos-agent", "bootstrap.json"), "utf8"));
  if (!isState(value)) throw new Error("Invalid bootstrap recovery metadata. Do not regenerate or overwrite the project; inspect .cosmos-agent/bootstrap.json.");
  return value;
}

export async function writeBootstrapState(root: string, state: BootstrapState): Promise<void> {
  const directory = join(root, ".cosmos-agent");
  await mkdir(directory, { recursive: true });
  const path = join(directory, "bootstrap.json");
  await writeFile(`${path}.tmp`, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}

export function newBootstrapState(options: BootstrapProjectOptions): BootstrapState {
  return {
    schemaVersion: 1, template: options.template,
    installDependencies: options.installDependencies, initializeGit: options.initializeGit,
    linkProject: options.linkProject, deploymentRequested: options.deploy,
    azureConfigurationRequired: Boolean(options.azureProvisioning),
    ...(options.environmentName ? { environmentName: options.environmentName } : {}),
    completed: [],
  };
}
