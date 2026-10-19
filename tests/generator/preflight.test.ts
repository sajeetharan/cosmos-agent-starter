import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseArguments } from "../../src/cli/arguments.js";
import { runPreflight, type PreflightDependencies } from "../../src/generator/preflight.js";
import * as preflight from "../../src/generator/preflight.js";
import { runCli } from "../../src/cli/run.js";

afterEach(() => vi.restoreAllMocks());

function dependencies(platform: NodeJS.Platform = "linux"): PreflightDependencies {
  return {
    platform, nodeVersion: "20.1.0",
    run: vi.fn(async () => undefined),
    checkDestination: vi.fn(async () => undefined),
  };
}

describe("scenario preflight", () => {
  it.each(["win32", "darwin", "linux"] as const)("checks only local prerequisites on %s", async (platform) => {
    const deps = dependencies(platform);
    const result = await runPreflight(parseArguments(["agent", "-y", "--no-git"]), deps);
    expect(result.ready).toBe(true);
    expect(deps.run).toHaveBeenCalledTimes(1);
    expect(deps.run).toHaveBeenCalledWith(
      platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm",
      platform === "win32" ? ["/d", "/s", "/c", "npm --version"] : ["--version"],
    );
    expect(deps.checkDestination).toHaveBeenCalledWith("agent", false);
  });

  it("checks requested Git, emulator, and deployment tools without authentication", async () => {
    const deps = dependencies();
    const result = await runPreflight(parseArguments([
      "bootstrap", "agent", "-y", "--storage", "cosmos", "--deploy",
    ]), deps);
    expect(result.ready).toBe(true);
    expect(deps.run).toHaveBeenCalledWith("git", ["--version"]);
    expect(deps.run).toHaveBeenCalledWith("docker", ["--version"]);
    expect(deps.run).toHaveBeenCalledWith("docker", ["compose", "version"]);
    expect(deps.run).toHaveBeenCalledWith("azd", ["version"]);
    expect(result.findings.filter((item) => item.severity === "warning")).toHaveLength(2);
    expect(deps.run).toHaveBeenCalledTimes(5);
  });

  it("does not require Docker for Azure Cosmos or azd for linking only", async () => {
    const deps = dependencies();
    await runPreflight(parseArguments([
      "bootstrap", "agent", "-y", "--storage", "cosmos", "--local", "azure", "--no-git",
    ]), deps);
    expect(deps.run).toHaveBeenCalledTimes(1);
  });

  it.each(["win32", "darwin", "linux"] as const)("reports failures with %s remediation and no tool output", async (platform) => {
    const deps = dependencies(platform);
    deps.nodeVersion = "18.0.0";
    deps.run = vi.fn().mockRejectedValue(new Error("secret-value"));
    deps.checkDestination = vi.fn().mockRejectedValue(new Error("EACCES"));
    const result = await runPreflight(parseArguments(["agent", "-y"]), deps);
    expect(result.ready).toBe(false);
    expect(result.findings.filter((item) => item.severity === "error")).toHaveLength(4);
    expect(JSON.stringify(result)).not.toContain("secret-value");
    expect(JSON.stringify(result)).toContain(platform === "win32" ? "winget" : platform === "darwin" ? "Homebrew" : "distribution");
  });

  it("blocks CLI generation before writing and emits one JSON result", async () => {
    const parent = await mkdtemp(join(tmpdir(), "cosmos-preflight-"));
    try {
      const destination = join(parent, "unwritten");
      vi.spyOn(preflight, "runPreflight").mockResolvedValue({
        ready: false,
        findings: [{ code: "PREFLIGHT_NPM", severity: "error", message: "Missing npm", remediation: "Install npm" }],
      });
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      expect(await runCli([destination, "-y", "--json"])).toBe(1);
      expect(log).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({ status: "blocked", preflight: { ready: false } });
      await expect(readFile(join(destination, "package.json"))).rejects.toThrow();
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("checks real destination safety without creating directories", async () => {
    const parent = await mkdtemp(join(tmpdir(), "cosmos-preflight-path-"));
    try {
      const destination = join(parent, "nested", "agent");
      expect((await runPreflight(parseArguments([destination, "-y", "--no-git"]))).ready).toBe(true);
      await expect(readFile(destination)).rejects.toThrow();
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
