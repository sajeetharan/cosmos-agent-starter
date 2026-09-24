import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  bootstrapProject,
  resolveEnvironmentName,
  type BootstrapCommand,
} from "../../src/generator/bootstrap.js";

const created: string[] = [];
afterEach(async () => Promise.all(
  created.splice(0).map((path) => rm(path, { recursive: true, force: true })),
));

describe("project bootstrap", () => {
  it("runs setup in order and deploys only when explicitly requested", async () => {
    const destination = await mkdtemp(join(tmpdir(), "cosmos-bootstrap-"));
    created.push(destination);
    const commands: BootstrapCommand[] = [];
    const result = await bootstrapProject({
      destination,
      template: "chat-agent-ts",
      installDependencies: true,
      initializeGit: true,
      linkProject: true,
      deploy: true,
      environmentName: "sample-dev",
      silent: true,
    }, async (command) => {
      commands.push(command);
    }, async (_root, environmentName) => ({
      ready: true,
      environmentName: environmentName!,
      findings: [],
    }));
    expect(commands).toHaveLength(3);
    expect([
      commands[0]?.executable,
      ...(commands[0]?.args ?? []),
    ].join(" ")).toMatch(/npm install$/);
    expect(commands[1]).toMatchObject({ executable: "git", args: ["init"] });
    expect(commands[2]).toMatchObject({
      executable: "azd",
      args: ["up", "--environment", "sample-dev", "--no-prompt"],
    });
    expect(result).toMatchObject({ linked: true, deployed: true });
    expect(JSON.parse(
      await readFile(join(destination, ".cosmos-agent", "context.json"), "utf8"),
    )).toMatchObject({
      environmentName: "sample-dev",
      deploymentStatus: "deployed",
    });
  });

  it("derives a safe environment name and rejects invalid explicit names", () => {
    expect(resolveEnvironmentName(join("projects", "My Agent"))).toBe("my-agent");
    expect(() => resolveEnvironmentName("demo", "not_valid")).toThrow(/environment names/i);
  });

  it("does not invoke azd up when readiness checks are blocked", async () => {
    const destination = await mkdtemp(join(tmpdir(), "cosmos-bootstrap-"));
    created.push(destination);
    const commands: BootstrapCommand[] = [];
    await expect(bootstrapProject({
      destination,
      template: "chat-agent-ts",
      installDependencies: false,
      initializeGit: false,
      linkProject: true,
      deploy: true,
      environmentName: "sample-dev",
      silent: true,
    }, async (command) => {
      commands.push(command);
    }, async (_root, environmentName) => ({
      ready: false,
      environmentName: environmentName!,
      findings: [{
        severity: "error",
        code: "AZD_AUTH",
        message: "Azure Developer CLI is not signed in.",
        remediation: "Run azd auth login.",
      }],
    }))).rejects.toThrow(/not ready/i);
    expect(commands).toHaveLength(0);
  });
});
