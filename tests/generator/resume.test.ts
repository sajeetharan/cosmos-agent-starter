import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseArguments } from "../../src/cli/arguments.js";
import { runCli } from "../../src/cli/run.js";
import { bootstrapProject, type BootstrapProjectOptions } from "../../src/generator/bootstrap.js";
import { readBootstrapState, writeBootstrapState } from "../../src/generator/bootstrap-state.js";
import { composeProject } from "../../src/generator/compose.js";
import { resumeBootstrap } from "../../src/generator/resume.js";
import type { PreflightResult } from "../../src/generator/preflight.js";

let root: string;
let options: BootstrapProjectOptions;
const ready = async (): Promise<PreflightResult> => ({ ready: true, findings: [] });
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "cosmos recovery ' "));
  await composeProject({ ...parseArguments([root, "-y", "--no-git"]), force: true });
  options = {
    destination: root, template: "chat-agent-ts", installDependencies: true,
    initializeGit: true, linkProject: true, deploy: false, environmentName: "dev",
  };
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe("safe bootstrap recovery", () => {
  it("records failures with completed stages and a copyable recovery command", async () => {
    const events: { elapsedMs?: number }[] = [];
    const runner = vi.fn(async (command) => {
      if (command.executable === "git") throw new Error("git failed API_KEY=private-value");
    });
    await expect(bootstrapProject({ ...options, onProgress: (event) => events.push(event) }, runner))
      .rejects.toMatchObject({
        code: "BOOTSTRAP_STAGE_FAILED",
        message: expect.stringContaining("Completed: dependencies"),
        suggestions: expect.arrayContaining([expect.stringContaining("resume-bootstrap --project")]),
      });
    const state = await readBootstrapState(root);
    expect(state).toMatchObject({ active: "git", failed: "git", completed: ["dependencies"] });
    expect(JSON.stringify(state)).not.toContain("private-value");
    expect(events.some((event) => typeof event.elapsedMs === "number" && event.elapsedMs >= 0)).toBe(true);
  });

  it("resumes installation failure without touching source, environment, or Git history", async () => {
    await expect(bootstrapProject(options, async () => { throw new Error("interrupted install"); }))
      .rejects.toThrow("dependencies");
    const source = join(root, "apps", "api", "src", "server.ts");
    await writeFile(source, "// user-edited source");
    await writeFile(join(root, ".env"), "PRIVATE_TOKEN=preserve-this");
    await mkdir(join(root, ".git"));
    await writeFile(join(root, ".git", "HEAD"), "preserve-history");
    const runner = vi.fn(async () => undefined);
    const result = await resumeBootstrap(root, {}, runner, ready);
    expect(result).toMatchObject({ deployed: false, linked: true, recovery: { skippedStages: ["git"] } });
    expect(await readFile(source, "utf8")).toBe("// user-edited source");
    expect(await readFile(join(root, ".env"), "utf8")).toBe("PRIVATE_TOKEN=preserve-this");
    expect(await readFile(join(root, ".git", "HEAD"), "utf8")).toBe("preserve-history");
    expect(runner.mock.calls.some(([command]) => command.args[0] === "init")).toBe(false);
    const state = await readBootstrapState(root);
    expect(state.completed).toEqual(expect.arrayContaining(["git", "dependencies", "context"]));
    expect(state.active).toBeUndefined();
    expect(state.failed).toBeUndefined();
  });

  it("revalidates completed dependencies and context across repeated resumes", async () => {
    await bootstrapProject({ ...options, initializeGit: false }, async () => undefined);
    await mkdir(join(root, "node_modules"));
    const contextBefore = await readFile(join(root, ".cosmos-agent", "context.json"), "utf8");
    const runner = vi.fn(async () => undefined);
    for (let index = 0; index < 2; index += 1) {
      const result = await resumeBootstrap(root, {}, runner, ready);
      expect(result.recovery.skippedStages).toEqual(["dependencies", "context"]);
    }
    expect(runner).toHaveBeenCalledTimes(2);
    expect(runner.mock.calls.every(([command]) => command.args.join(" ").includes("ls --depth=0"))).toBe(true);
    expect(await readFile(join(root, ".cosmos-agent", "context.json"), "utf8")).toBe(contextBefore);
  });

  it("repairs stale dependency completion and reports the repair", async () => {
    await bootstrapProject({ ...options, initializeGit: false, linkProject: false }, async () => undefined);
    await mkdir(join(root, "node_modules"));
    const runner = vi.fn(async (command) => {
      if (command.args.join(" ").includes("ls --depth=0")) throw new Error("missing dependency");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await resumeBootstrap(root, {}, runner, ready);
    expect(result.recovery.findings).toEqual([expect.stringContaining("repair")]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it("retries an interrupted stage based on its active journal record", async () => {
    await bootstrapProject({ ...options, installDependencies: false, initializeGit: false }, async () => undefined);
    const state = await readBootstrapState(root);
    state.completed = [];
    state.active = "dependencies";
    state.installDependencies = true;
    await writeBootstrapState(root, state);
    const runner = vi.fn(async () => undefined);
    await resumeBootstrap(root, {}, runner, ready);
    expect(runner).toHaveBeenCalledTimes(1);
    expect((await readBootstrapState(root)).active).toBeUndefined();
  });

  it("never retries uncertain deployment, even when explicitly requested", async () => {
    await bootstrapProject({ ...options, installDependencies: false, initializeGit: false }, async () => undefined);
    const state = await readBootstrapState(root);
    state.active = "deployment";
    state.deploymentRequested = true;
    state.installDependencies = true;
    await writeBootstrapState(root, state);
    const runner = vi.fn(async () => undefined);
    await expect(resumeBootstrap(root, { deploy: true }, runner, ready))
      .rejects.toMatchObject({ code: "BOOTSTRAP_DEPLOYMENT_RECONCILE" });
    await resumeBootstrap(root, {}, runner, ready);
    expect(runner).toHaveBeenCalledTimes(1);
    expect((await readBootstrapState(root)).deploymentUncertain).toBe(true);
    await expect(resumeBootstrap(root, { deploy: true }, runner, ready))
      .rejects.toMatchObject({ code: "BOOTSTRAP_DEPLOYMENT_RECONCILE" });
  });

  it("blocks interrupted Azure configuration before deployment", async () => {
    await bootstrapProject({ ...options, installDependencies: false, initializeGit: false }, async () => undefined);
    const state = await readBootstrapState(root);
    state.azureConfigurationRequired = true;
    state.active = "azure";
    await writeBootstrapState(root, state);
    await expect(resumeBootstrap(root, { deploy: true }, async () => undefined, ready))
      .rejects.toMatchObject({ code: "BOOTSTRAP_AZURE_RECONCILE" });
  });

  it("rejects malformed metadata/manifests and mismatched context before processes", async () => {
    await bootstrapProject({ ...options, installDependencies: false, initializeGit: false }, async () => undefined);
    const runner = vi.fn(async () => undefined);
    const context = join(root, ".cosmos-agent", "context.json");
    await writeFile(context, '{"schemaVersion":1,"template":"other","environmentName":"dev"}');
    await expect(resumeBootstrap(root, {}, runner, ready)).rejects.toThrow("differs");
    await rm(context);
    const manifest = await readFile(join(root, "cosmos-project.json"), "utf8");
    await writeFile(join(root, "cosmos-project.json"), '{"schemaVersion":9}');
    await expect(resumeBootstrap(root, {}, runner, ready)).rejects.toThrow("Invalid or unsupported");
    await writeFile(join(root, "cosmos-project.json"), manifest);
    await writeFile(join(root, ".cosmos-agent", "bootstrap.json"), '{"schemaVersion":9}');
    await expect(resumeBootstrap(root, {}, runner, ready)).rejects.toThrow("Invalid bootstrap");
    expect(runner).not.toHaveBeenCalled();
  });

  it("rechecks prerequisites and emits structured errors without process launches", async () => {
    await bootstrapProject({ ...options, installDependencies: false, initializeGit: false }, async () => undefined);
    const runner = vi.fn(async () => undefined);
    await expect(resumeBootstrap(root, {}, runner, async () => ({
      ready: false, findings: [{ severity: "error", code: "MISSING_NPM", message: "Missing", remediation: "Install npm" }],
    }))).rejects.toMatchObject({ code: "BOOTSTRAP_PREFLIGHT_BLOCKED" });
    expect(runner).not.toHaveBeenCalled();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(await runCli(["resume-bootstrap", root, "--json"])).toBe(0);
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      command: "resume-bootstrap", status: "resumed", deployed: false, recovery: { preflight: { ready: true } },
    });
  });
});
