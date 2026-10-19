import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import type { CliOptions } from "../cli/arguments.js";
import { assertSafeDestination } from "./validation.js";

const execFileAsync = promisify(execFile);

export interface PreflightFinding {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  remediation: string;
}

export interface PreflightResult {
  ready: boolean;
  findings: PreflightFinding[];
}

export interface PreflightDependencies {
  platform: NodeJS.Platform;
  nodeVersion: string;
  run: (executable: string, args: string[]) => Promise<void>;
  checkDestination: (destination: string, force: boolean) => Promise<void>;
}

async function checkDestination(destination: string, force: boolean): Promise<void> {
  await assertSafeDestination(destination, force);
  let candidate = resolve(destination);
  while (true) {
    try {
      if (!(await stat(candidate)).isDirectory()) {
        throw new Error("The destination or its parent is not a directory.");
      }
      await access(candidate, constants.W_OK | constants.X_OK);
      return;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
        throw error;
      }
      const parent = dirname(candidate);
      if (parent === candidate) throw error;
      candidate = parent;
    }
  }
}

const defaults: PreflightDependencies = {
  platform: process.platform,
  nodeVersion: process.versions.node,
  run: async (executable, args) => {
    await execFileAsync(executable, args, { timeout: 10_000, windowsHide: true });
  },
  checkDestination,
};

export async function runPreflight(
  options: CliOptions,
  dependencies: PreflightDependencies = defaults,
): Promise<PreflightResult> {
  const findings: PreflightFinding[] = [];
  const add = (
    code: string,
    severity: PreflightFinding["severity"],
    message: string,
    remediation: string,
  ) => findings.push({ code, severity, message, remediation });
  const install = dependencies.platform === "win32"
    ? "Install using winget or the vendor's Windows installer, then reopen your terminal."
    : dependencies.platform === "darwin"
      ? "Install using Homebrew or the vendor's macOS installer, then reopen your terminal."
      : "Install using your distribution's package manager or the vendor's Linux instructions.";
  const tool = async (code: string, executable: string, args: string[], name: string) => {
    try {
      await dependencies.run(executable, args);
      add(code, "info", `${name} is available.`, "No action required.");
    } catch {
      // Tool output may contain environment-specific credentials; report only the check.
      add(code, "error", `${name} could not be verified.`, `${install} Retry ${name}.`);
    }
  };
  const nodeSupported = Number(dependencies.nodeVersion.split(".")[0]) >= 20;
  add("PREFLIGHT_NODE", nodeSupported ? "info" : "error",
    nodeSupported ? "Node.js 20 or newer is available." : "Node.js 20 or newer is required.",
    nodeSupported ? "No action required." : `Install Node.js 20 or newer. ${install}`);
  await tool("PREFLIGHT_NPM",
    dependencies.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm",
    dependencies.platform === "win32" ? ["/d", "/s", "/c", "npm --version"] : ["--version"],
    "npm --version");
  try {
    if (!options.destination) throw new Error("A destination is required.");
    await dependencies.checkDestination(options.destination, options.force);
    add("PREFLIGHT_DESTINATION", "info", "The destination is safe and writable.", "No action required.");
  } catch {
    add("PREFLIGHT_DESTINATION", "error", "The destination is not safe or writable.",
      "Choose an empty writable directory. Review existing files before explicitly using --force.");
  }
  if (options.initializeGit) {
    await tool("PREFLIGHT_GIT", "git", ["--version"], "git --version");
  }
  if (options.storage === "cosmos" && options.localMode === "emulator") {
    await tool("PREFLIGHT_DOCKER", "docker", ["--version"], "docker --version");
    await tool("PREFLIGHT_COMPOSE", "docker", ["compose", "version"], "docker compose version");
    add("PREFLIGHT_EMULATOR_RUNTIME", "warning",
      "Docker daemon readiness and emulator image compatibility require a manual check.",
      "Start Docker with Linux containers before npm run dev. No daemon or network probe was performed.");
  }
  if (options.deploy) {
    await tool("PREFLIGHT_AZD", "azd", ["version"], "azd version");
    add("PREFLIGHT_AZURE_READINESS", "warning", "Azure credentials and capacity were not checked.",
      "Run prepare-azure on the generated project before approving billable deployment.");
  }
  return { ready: !findings.some((finding) => finding.severity === "error"), findings };
}
