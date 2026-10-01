import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  bootstrapProject,
  resolveEnvironmentName,
  type BootstrapCommand,
  type BootstrapProgress,
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
    const progress: BootstrapProgress[] = [];
    const result = await bootstrapProject({
      destination,
      template: "chat-agent-ts",
      installDependencies: true,
      initializeGit: true,
      linkProject: true,
      deploy: true,
      environmentName: "sample-dev",
      onProgress: (event) => progress.push(event),
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
    expect(progress.map((event) => `${event.status}:${event.stage}`)).toEqual([
      "started:dependencies",
      "completed:dependencies",
      "started:git",
      "completed:git",
      "started:context",
      "completed:context",
      "started:readiness",
      "completed:readiness",
      "started:deployment",
      "completed:deployment",
    ]);
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

  it("configures the azd environment before provisioning", async () => {
    const destination = await mkdtemp(join(tmpdir(), "cosmos-bootstrap-azure-"));
    created.push(destination);
    const commands: BootstrapCommand[] = [];
    await bootstrapProject({
      destination,
      template: "chat-agent-ts",
      installDependencies: false,
      initializeGit: false,
      linkProject: true,
      deploy: true,
      environmentName: "sample-dev",
      azureProvisioning: {
        location: "eastus2",
        provider: "azure-openai",
        azureOpenAIEndpoint: "https://sample.openai.azure.com",
        azureOpenAIChatDeployment: "chat",
        entraTenantId: "tenant",
        entraAudience: "api://sample",
        entraClientId: "client",
        entraScope: "api://sample/access_as_user",
      },
    }, async (command) => {
      commands.push(command);
    }, async (_root, environmentName) => ({
      ready: true,
      environmentName: environmentName!,
      findings: [],
    }));
    expect(commands[0]).toMatchObject({ executable: "azd", args: ["auth", "login"] });
    expect(commands[1]?.args).toEqual([
      "env", "new", "sample-dev", "--location", "eastus2", "--no-prompt",
    ]);
    expect(commands).toContainEqual(expect.objectContaining({
      args: [
        "env", "set", "AZURE_OPENAI_ENDPOINT", "https://sample.openai.azure.com",
        "--environment", "sample-dev", "--no-prompt",
      ],
    }));
    expect(commands.at(-1)?.args).toEqual([
      "up", "--environment", "sample-dev", "--no-prompt",
    ]);
  });

  it("does not launch interactive Azure login in silent automation", async () => {
    const destination = await mkdtemp(join(tmpdir(), "cosmos-bootstrap-azure-json-"));
    created.push(destination);
    const commands: BootstrapCommand[] = [];
    await bootstrapProject({
      destination,
      template: "chat-agent-ts",
      installDependencies: false,
      initializeGit: false,
      linkProject: true,
      deploy: true,
      silent: true,
      environmentName: "sample-dev",
      azureProvisioning: {
        location: "eastus2",
        provider: "azure-openai",
        azureOpenAIEndpoint: "https://sample.openai.azure.com",
        azureOpenAIChatDeployment: "chat",
        entraTenantId: "tenant",
        entraAudience: "api://sample",
        entraClientId: "client",
        entraScope: "api://sample/access_as_user",
      },
    }, async (command) => {
      commands.push(command);
    }, async (_root, environmentName) => ({
      ready: true,
      environmentName: environmentName!,
      findings: [],
    }));
    expect(commands).not.toContainEqual(expect.objectContaining({ args: ["auth", "login"] }));
  });
});
