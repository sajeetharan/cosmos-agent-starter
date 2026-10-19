import { access, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseArguments } from "../cli/arguments.js";
import { CliError } from "../cli/errors.js";
import { readProjectManifest } from "./manifest.js";
import { loadScenario } from "./compose.js";
import {
  bootstrapProject, resolveEnvironmentName, runBootstrapCommand,
  type BootstrapCommandRunner, type BootstrapProgress,
} from "./bootstrap.js";
import { readBootstrapState, type BootstrapStage } from "./bootstrap-state.js";
import { runPreflight } from "./preflight.js";
import { validateGeneratedFiles } from "./validation.js";

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

export async function resumeBootstrap(
  root: string,
  options: { deploy?: boolean; silent?: boolean; onProgress?: (progress: BootstrapProgress) => void } = {},
  runner: BootstrapCommandRunner = runBootstrapCommand,
  preflight = runPreflight,
) {
  await validateGeneratedFiles(root);
  const manifest = await readProjectManifest(root);
  await loadScenario(manifest.scenario);
  const state = await readBootstrapState(root);
  if (state.active === "deployment" || state.failed === "deployment") state.deploymentUncertain = true;
  if (state.template !== manifest.scenario) throw new Error("Recovery template does not match the project manifest.");
  if (state.environmentName) resolveEnvironmentName(root, state.environmentName);
  if (options.deploy && !state.linkProject) throw new Error("Deployment requires a linked project context.");
  if (options.deploy && (state.deploymentUncertain || state.completed.includes("deployment"))) {
    throw new CliError("BOOTSTRAP_DEPLOYMENT_RECONCILE",
      "A previous deployment may have created resources. Automatic deployment retry is blocked.",
      ["Inspect azd show and the Azure portal, verify readiness, and explicitly run azd up only after reconciling resources and costs. Resume without --deploy for local setup."]);
  }
  if (options.deploy && state.azureConfigurationRequired && !state.completed.includes("azure")) {
    throw new CliError("BOOTSTRAP_AZURE_RECONCILE", "Azure configuration was interrupted and must be reconciled manually.",
      ["Select the existing azd environment and configure it using README.md, run prepare-azure, then explicitly deploy with azd. Resume without --deploy for local setup."]);
  }
  const configured = {
    ...parseArguments(["bootstrap", root, "--yes"]),
    destination: root, template: manifest.scenario, provider: manifest.ai.provider,
    storage: manifest.storage.development, localMode: manifest.storage.cosmosConnection,
    authMode: manifest.authentication.development, capacity: manifest.cosmos.capacity,
    initializeGit: state.initializeGit, installDependencies: state.installDependencies,
    linkProject: state.linkProject, deploy: options.deploy ?? false, force: true,
  };
  const findings = await preflight(configured);
  if (!findings.ready) {
    throw new CliError("BOOTSTRAP_PREFLIGHT_BLOCKED", "Recovery prerequisites are not satisfied.",
      findings.findings.filter((finding) => finding.severity === "error").map((finding) => `${finding.code}: ${finding.remediation}`));
  }
  const skipStages: BootstrapStage[] = [];
  const recoveryFindings: string[] = [];
  if (state.deploymentUncertain || state.deploymentRequested) {
    recoveryFindings.push("Prior Azure intent/state was not retried. Reconcile cloud resources manually; local recovery does not verify deployment.");
  }
  const silent = options.silent ?? false;
  if (state.installDependencies && state.completed.includes("dependencies") && await exists(join(root, "node_modules"))) {
    try {
      await runner({
        executable: process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm",
        args: process.platform === "win32" ? ["/d", "/s", "/c", "npm ls --depth=0"] : ["ls", "--depth=0"],
        cwd: root, silent,
      });
      skipStages.push("dependencies");
    } catch {
      recoveryFindings.push("Dependency verification failed; npm install was requested to repair the dependency stage.");
      if (!silent) console.warn("Dependency verification failed; npm install will repair the dependency stage.");
    }
  }
  if (state.initializeGit && await exists(join(root, ".git"))) {
    await runner({ executable: "git", args: ["rev-parse", "--git-dir"], cwd: root, silent });
    skipStages.push("git");
  }
  if (state.linkProject && await exists(join(root, ".cosmos-agent", "context.json"))) {
    const context: unknown = JSON.parse(await readFile(join(root, ".cosmos-agent", "context.json"), "utf8"));
    if (typeof context !== "object" || context === null ||
      !("schemaVersion" in context) || context.schemaVersion !== 1 ||
      !("template" in context) || context.template !== manifest.scenario ||
      !("environmentName" in context) || context.environmentName !== state.environmentName) {
      throw new Error("Existing context differs from recovery metadata; inspect .cosmos-agent/context.json before resuming.");
    }
    skipStages.push("context");
  }
  if (await exists(join(root, "node_modules")) && !(await stat(join(root, "node_modules"))).isDirectory()) {
    throw new Error("node_modules is not a directory; inspect it before resuming.");
  }
  state.completed = [...new Set([...state.completed, ...skipStages])];
  delete state.active;
  delete state.failed;
  const result = await bootstrapProject({
    destination: root, template: state.template,
    installDependencies: state.installDependencies, initializeGit: state.initializeGit,
    linkProject: state.linkProject, deploy: options.deploy ?? false,
    ...(state.environmentName ? { environmentName: state.environmentName } : {}),
    silent, ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    recoveryState: state, skipStages,
  }, runner);
  return { ...result, recovery: { skippedStages: skipStages, findings: recoveryFindings, preflight: findings } };
}
