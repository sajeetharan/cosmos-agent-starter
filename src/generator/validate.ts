import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { redactError } from "../cli/errors.js";
import { validateGeneratedFiles } from "./validation.js";

export interface ValidationCommand {
  executable: string;
  args: string[];
  cwd: string;
}

export interface ValidationCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  unavailable?: boolean;
}

export type ValidationCommandRunner = (command: ValidationCommand) => Promise<ValidationCommandResult>;

export interface ValidationStage {
  code: string;
  status: "passed" | "failed" | "skipped" | "unavailable";
  required: boolean;
  durationMs: number;
  reason?: string;
  command?: string;
  summary?: string;
  exitCode?: number;
}

export interface ValidationResult {
  schemaVersion: 1;
  exitCode: number;
  stages: ValidationStage[];
}

const outputLimit = 8192;

export const runValidationCommand: ValidationCommandRunner = (command) => {
  return new Promise((resolve, reject) => {
    const isWindowsNpm = process.platform === "win32" && command.executable === "npm";
    const isWindowsAz = process.platform === "win32" && command.executable === "az";
    const executable = isWindowsNpm
      ? process.execPath
      : isWindowsAz ? (process.env.ComSpec ?? "cmd.exe") : command.executable;
    const args = isWindowsNpm
      ? [join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"), ...command.args]
      : isWindowsAz
        ? ["/d", "/s", "/c", ["az", ...command.args].map((value) =>
          /^[A-Za-z0-9_.:\\/-]+$/.test(value) ? value : `"${value.replaceAll('"', '""')}"`,
        ).join(" ")]
        : command.args;
    const child = spawn(executable, args, { cwd: command.cwd, windowsHide: true, stdio: "pipe" });
    child.stdin.end();
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = (stdout + chunk.toString()).slice(0, outputLimit);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(0, outputLimit);
    });
    child.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        resolve({ exitCode: 1, stdout, stderr: "Executable was not found.", unavailable: true });
      } else reject(error);
    });
    child.once("close", (code, signal) => resolve({
      exitCode: code ?? 1,
      stdout,
      stderr: signal ? `${stderr}\nTerminated by signal ${signal}.` : stderr,
      ...(isWindowsAz && code === 9009 ? { unavailable: true } : {}),
    }));
  });
};

interface ValidationOptions {
  silent?: boolean;
  runner?: ValidationCommandRunner;
  onStage?: (stage: ValidationStage) => void;
}

export async function validateProjectDetailed(
  root: string,
  options: ValidationOptions = {},
): Promise<ValidationResult> {
  const stages: ValidationStage[] = [];
  let exitCode = 0;
  const runner = options.runner ?? runValidationCommand;
  const record = (stage: ValidationStage) => {
    stages.push(stage);
    if (stage.status === "failed" || (stage.required && stage.status === "unavailable")) {
      exitCode ||= stage.exitCode && stage.exitCode > 0 ? stage.exitCode : 1;
    }
    if (!options.silent) options.onStage?.(stage);
  };
  const skipped = (code: string, required: boolean, reason: string, command?: string) => record({
    code, required, status: "skipped", durationMs: 0, reason, ...(command ? { command } : {}),
  });
  const fileStage = async (code: string, check: () => Promise<void>, command: string) => {
    const start = performance.now();
    try {
      await check();
      record({ code, required: true, status: "passed", durationMs: performance.now() - start, command });
    } catch (error) {
      record({
        code, required: true, status: "failed", durationMs: performance.now() - start,
        command, exitCode: 1, reason: "Project inspection failed.",
        summary: redactError(error instanceof Error ? error.message : String(error)),
      });
    }
  };
  const commandStage = async (
    code: string, executable: string, args: string[], command: string, required: boolean,
    missingBicepIsUnavailable = false,
  ): Promise<void> => {
    const start = performance.now();
    try {
      const result = await runner({ executable, args, cwd: root });
      const unavailable = result.unavailable || (missingBicepIsUnavailable &&
        result.exitCode !== 0 && /bicep cli (?:is not installed|not found)/i.test(result.stderr + result.stdout));
      const status = unavailable ? "unavailable" : result.exitCode === 0 ? "passed" : "failed";
      record({
        code, required, status, durationMs: performance.now() - start, command, exitCode: result.exitCode,
        ...(status !== "passed" ? {
          reason: unavailable
            ? `Install ${executable === "az" ? "Azure CLI and Bicep" : executable} and rerun validation.`
            : "Command failed. Run the reproduction command from the project directory.",
          summary: redactError((result.stderr || result.stdout || `Command exited with code ${result.exitCode}.`).trim()),
        } : {}),
      });
    } catch (error) {
      record({
        code, required, status: "failed", durationMs: performance.now() - start, command,
        exitCode: 1, reason: "Command could not be executed.",
        summary: redactError(error instanceof Error ? error.message : String(error)),
      });
    }
  };
  const reproduce = "npx create-cosmos-agent validate .";
  const blocked = "Not run because a preceding stage failed.";
  await fileStage("VALIDATE_GENERATED_FILES", () => validateGeneratedFiles(root), reproduce);
  let scripts: Record<string, string> = {};
  if (exitCode === 0) {
    await fileStage("VALIDATE_PACKAGE", async () => {
      const data: unknown = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
      if (typeof data !== "object" || data === null || Array.isArray(data)) {
        throw new Error("package.json must contain an object.");
      }
      if ("scripts" in data && data.scripts !== undefined) {
        if (typeof data.scripts !== "object" || data.scripts === null || Array.isArray(data.scripts) ||
          !Object.values(data.scripts).every((value) => typeof value === "string")) {
          throw new Error("package.json scripts must be an object of command strings.");
        }
        scripts = Object.fromEntries(Object.entries(data.scripts));
      }
    }, reproduce);
  } else skipped("VALIDATE_PACKAGE", true, blocked, reproduce);
  const scriptStages = [
    ["typecheck", "VALIDATE_TYPECHECK"],
    ["build", "VALIDATE_BUILD"],
    ["test:unit", "VALIDATE_UNIT"],
    ["test:security", "VALIDATE_SECURITY"],
    ["test:cost", "VALIDATE_COST"],
    ["test:scenario", "VALIDATE_SCENARIO"],
  ] as const;
  for (const [script, code] of scriptStages) {
    const command = `npm run ${script}`;
    if (exitCode !== 0) skipped(code, true, blocked, command);
    else if (!scripts[script]) skipped(code, false, `Not applicable: package.json does not define ${script}.`, command);
    else await commandStage(code, "npm", ["run", script], command, true);
  }
  skipped("VALIDATE_INTEGRATION", false,
    "Live integration checks are opt-in and are not run by validate; configure services and run npm run test:integration explicitly.",
    "npm run test:integration");
  if (exitCode !== 0) {
    for (const code of ["VALIDATE_AZURE_CLI", "VALIDATE_BICEP_TOOLCHAIN", "VALIDATE_BICEP_BUILD"]) {
      skipped(code, false, blocked);
    }
  } else {
    let infrastructure = true;
    try {
      await access(join(root, "infra", "main.bicep"));
    } catch (error) {
      infrastructure = false;
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        skipped("VALIDATE_AZURE_CLI", false, "Not applicable: infra/main.bicep is absent.");
      } else {
        record({
          code: "VALIDATE_AZURE_CLI", required: false, status: "failed", durationMs: 0,
          reason: "Cannot inspect infra/main.bicep.", command: reproduce, exitCode: 1,
          summary: redactError(error instanceof Error ? error.message : String(error)),
        });
      }
    }
    if (infrastructure) {
      await commandStage("VALIDATE_AZURE_CLI", "az", ["--version"], "az --version", false);
      if (stages.at(-1)?.status === "passed") {
        await commandStage("VALIDATE_BICEP_TOOLCHAIN", "az", ["bicep", "version"], "az bicep version", false, true);
      } else skipped("VALIDATE_BICEP_TOOLCHAIN", false, "Azure CLI is not available or its version check failed.");
      if (stages.at(-1)?.status === "passed") {
        await commandStage("VALIDATE_BICEP_BUILD", "az",
          ["bicep", "build", "--file", join("infra", "main.bicep")],
          "az bicep build --file infra/main.bicep", false);
      } else skipped("VALIDATE_BICEP_BUILD", false, "Bicep toolchain was not verified; build was not run.");
    } else {
      skipped("VALIDATE_BICEP_TOOLCHAIN", false, "Infrastructure is absent or could not be inspected.");
      skipped("VALIDATE_BICEP_BUILD", false, "Infrastructure is absent or could not be inspected.");
    }
  }
  return { schemaVersion: 1, exitCode, stages };
}

export async function validateProject(root: string, options: ValidationOptions = {}): Promise<number> {
  return (await validateProjectDetailed(root, options)).exitCode;
}
