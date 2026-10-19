import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseArguments } from "../../src/cli/arguments.js";
import { runCli } from "../../src/cli/run.js";
import { composeProject } from "../../src/generator/compose.js";
import {
  runValidationCommand,
  validateProject,
  validateProjectDetailed,
  type ValidationCommand,
  type ValidationCommandResult,
} from "../../src/generator/validate.js";

let root: string;
const passed: ValidationCommandResult = { exitCode: 0, stdout: "", stderr: "" };
const codes = [
  "VALIDATE_GENERATED_FILES", "VALIDATE_PACKAGE", "VALIDATE_TYPECHECK", "VALIDATE_BUILD",
  "VALIDATE_UNIT", "VALIDATE_SECURITY", "VALIDATE_COST", "VALIDATE_SCENARIO",
  "VALIDATE_INTEGRATION", "VALIDATE_AZURE_CLI", "VALIDATE_BICEP_TOOLCHAIN", "VALIDATE_BICEP_BUILD",
];
const scripts = Object.fromEntries(
  ["typecheck", "build", "test:unit", "test:security", "test:cost", "test:scenario"].map((name) => [name, "node --version"]),
);

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "cosmos validation "));
  await composeProject({ ...parseArguments([root, "-y", "--no-git"]), force: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ scripts }));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe("validation stage reporting", () => {
  it("reports all stages, runs scenario checks, and preserves the numeric wrapper", async () => {
    const runner = vi.fn(async () => passed);
    const onStage = vi.fn();
    const result = await validateProjectDetailed(root, { runner, onStage });
    expect(result.schemaVersion).toBe(1);
    expect(result.exitCode).toBe(0);
    expect(result.stages.map((stage) => stage.code)).toEqual(codes);
    expect(result.stages.filter((stage) => stage.status === "passed")).toHaveLength(11);
    expect(result.stages.find((stage) => stage.code === "VALIDATE_INTEGRATION"))
      .toMatchObject({ status: "skipped", reason: expect.stringContaining("opt-in") });
    expect(runner).toHaveBeenCalledWith({ executable: "npm", args: ["run", "test:scenario"], cwd: root });
    expect(runner).toHaveBeenCalledTimes(9);
    expect(onStage).toHaveBeenCalledTimes(12);
    for (const stage of result.stages) {
      expect(stage.durationMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(stage.durationMs)).toBe(true);
    }
    expect(await validateProject(root, { runner, silent: true, onStage })).toBe(0);
    expect(onStage).toHaveBeenCalledTimes(12);
  });

  it("records failed scripts and marks subsequent checks skipped rather than passed", async () => {
    const runner = vi.fn(async () => ({
      exitCode: 7, stdout: "", stderr: `API_KEY=private-value\n${"x".repeat(10000)}`,
    }));
    const result = await validateProjectDetailed(root, { runner });
    expect(result.exitCode).toBe(7);
    expect(result.stages.find((stage) => stage.code === "VALIDATE_TYPECHECK")).toMatchObject({
      status: "failed", exitCode: 7, command: "npm run typecheck", summary: expect.stringContaining("[REDACTED]"),
    });
    const summary = result.stages.find((stage) => stage.code === "VALIDATE_TYPECHECK")?.summary ?? "";
    expect(summary.length).toBeLessThanOrEqual(2000);
    expect(summary).not.toContain("private-value");
    expect(result.stages.slice(3).every((stage) => stage.status === "skipped")).toBe(true);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("explicitly reports scripts that are not applicable", async () => {
    await writeFile(join(root, "package.json"), "{}");
    const runner = vi.fn(async () => passed);
    const result = await validateProjectDetailed(root, { runner });
    expect(result.exitCode).toBe(0);
    for (const stage of result.stages.slice(2, 8)) {
      expect(stage).toMatchObject({ status: "skipped", reason: expect.stringContaining("Not applicable") });
    }
    expect(runner).toHaveBeenCalledTimes(3);
  });

  it.each(["absent", "malformed", "invalid-scripts"])("fails project inspection for %s configuration", async (mode) => {
    if (mode === "absent") await rm(join(root, "cosmos-project.json"));
    else await writeFile(join(root, "package.json"), mode === "malformed" ? "{" : '{"scripts": {"build": 123}}');
    const runner = vi.fn(async () => passed);
    const result = await validateProjectDetailed(root, { runner });
    expect(result.exitCode).toBe(1);
    expect(result.stages.some((stage) => stage.status === "failed")).toBe(true);
    expect(result.stages.map((stage) => stage.code)).toEqual(codes);
    expect(runner).not.toHaveBeenCalled();
  });

  it.each(["npm", "az"])("distinguishes missing %s based on whether the tool is required", async (tool) => {
    const runner = vi.fn(async (command: ValidationCommand) =>
      command.executable === tool ? { ...passed, exitCode: 1, unavailable: true, stderr: "Not found" } : passed);
    const result = await validateProjectDetailed(root, { runner });
    expect(result.exitCode).toBe(tool === "npm" ? 1 : 0);
    expect(result.stages.find((stage) => stage.status === "unavailable")).toMatchObject({
      code: tool === "npm" ? "VALIDATE_TYPECHECK" : "VALIDATE_AZURE_CLI",
      required: tool === "npm",
    });
    expect(result.stages.at(-1)?.status).toBe("skipped");
  });

  it("reports a missing Bicep installation as unavailable, never passed", async () => {
    const runner = vi.fn(async (command: ValidationCommand) =>
      command.args.join(" ") === "bicep version"
        ? { ...passed, exitCode: 1, stderr: "Bicep CLI not found. Install it explicitly." } : passed);
    const result = await validateProjectDetailed(root, { runner });
    expect(result.exitCode).toBe(0);
    expect(result.stages.at(-2)).toMatchObject({ status: "unavailable", code: "VALIDATE_BICEP_TOOLCHAIN" });
    expect(result.stages.at(-1)?.status).toBe("skipped");
  });

  it.each(["--version", "bicep version", "bicep build"])("does not swallow actual Azure failure in %s", async (failing) => {
    const runner = vi.fn(async (command: ValidationCommand) =>
      command.executable === "az" && command.args.join(" ").startsWith(failing)
        ? { ...passed, exitCode: 2, stderr: "Permission denied or invalid infrastructure." } : passed);
    const result = await validateProjectDetailed(root, { runner });
    expect(result.exitCode).toBe(2);
    expect(result.stages.find((stage) => stage.status === "failed"))
      .toMatchObject({ required: false, exitCode: 2, summary: "Permission denied or invalid infrastructure." });
    expect(result.stages.some((stage) => stage.status === "unavailable")).toBe(false);
  });

  it("reports permission/execution exceptions as failures", async () => {
    const runner = vi.fn(async (command: ValidationCommand) => {
      if (command.executable === "az") throw new Error("EACCES");
      return passed;
    });
    const result = await validateProjectDetailed(root, { runner });
    expect(result.exitCode).toBe(1);
    expect(result.stages.find((stage) => stage.code === "VALIDATE_AZURE_CLI"))
      .toMatchObject({ status: "failed", summary: "EACCES" });
  });

  it("drains and bounds real process output and identifies missing executables", async () => {
    const result = await runValidationCommand({
      executable: process.execPath, cwd: root,
      args: ["-e", "process.stdout.write('x'.repeat(30000)); process.stderr.write('y'.repeat(30000)); process.exitCode=3"],
    });
    expect(result.exitCode).toBe(3);
    expect(result.stdout).toHaveLength(8192);
    expect(result.stderr).toHaveLength(8192);
    expect(await runValidationCommand({ executable: "cosmos-missing-executable-28", args: [], cwd: root }))
      .toMatchObject({ unavailable: true, exitCode: 1 });
  });

  it("returns a single parseable JSON report with redacted real npm failures and no child chatter", async () => {
    await writeFile(join(root, "package.json"), JSON.stringify({
      scripts: { typecheck: "node -e \"console.log('child-chatter'); console.error('API_KEY=private-value'); process.exitCode=7\"" },
    }));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await runCli(["validate", root, "--json"])).toBe(7);
    expect(log).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    const result = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(Object.keys(result).sort()).toEqual(["command", "exitCode", "project", "schemaVersion", "stages", "status"]);
    expect(result).toMatchObject({ command: "validate", project: root, status: "failed", exitCode: 7, schemaVersion: 1 });
    expect(result.stages.map((stage: { code: string }) => stage.code)).toEqual(codes);
    expect(JSON.stringify(result)).not.toContain("private-value");
    expect(JSON.stringify(result)).not.toContain("child-chatter");
  });
});
