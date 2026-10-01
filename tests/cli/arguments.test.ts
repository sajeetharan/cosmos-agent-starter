import { describe, expect, it } from "vitest";
import { parseArguments } from "../../src/cli/arguments.js";

describe("CLI arguments", () => {
  it("defaults to the customer-ready chat template", () => {
    expect(parseArguments(["demo"]).template).toBe("chat-agent-ts");
  });

  it("selects noninteractive options", () => {
    expect(
      parseArguments([
        "create",
        "demo",
        "-t",
        "agent-memory-ts",
        "--capacity=autoscale",
        "--local",
        "azure",
        "--provider",
        "ollama",
        "--auth",
        "entra",
        "--storage",
        "cosmos",
        "--no-web",
        "--no-git",
        "-y",
        "-f",
      ]),
    ).toMatchObject({
      command: "create",
      destination: "demo",
      template: "agent-memory-ts",
      capacity: "autoscale",
      localMode: "azure",
      provider: "ollama",
      authMode: "entra",
      storage: "cosmos",
      includeWeb: false,
      initializeGit: false,
      yes: true,
      force: true,
    });
  });

  it.each([
    [["-l"], "list"],
    [["--help"], "help"],
    [["-v"], "version"],
    [["doctor", "./sample"], "doctor"],
    [["prepare-azure", "./sample"], "prepare-azure"],
    [["validate", "-C", "./sample"], "validate"],
  ] as const)("supports command aliases for %j", (args, command) => {
    expect(parseArguments([...args])).toMatchObject({ command });
  });

  it("targets project inspection commands by positional argument or -C", () => {
    expect(parseArguments(["doctor", "./one"])).toMatchObject({ projectDirectory: "./one" });
    expect(parseArguments(["prepare-azure", "./one", "--environment", "one-dev"]))
      .toMatchObject({
        projectDirectory: "./one",
        environmentName: "one-dev",
      });
    expect(parseArguments(["validate", "-C", "./two"])).toMatchObject({
      projectDirectory: "./two",
    });
  });

  it("rejects invalid capacity", () => {
    expect(() => parseArguments(["demo", "--capacity", "invalid"])).toThrow(/capacity/i);
  });

  it("supports the explicit wizard command", () => {
    expect(parseArguments(["wizard", "demo", "--yes"])).toMatchObject({
      command: "create",
      destination: "demo",
    });
  });

  it("supports Neon-style bootstrap setup and explicit deployment", () => {
    expect(parseArguments([
      "bootstrap",
      "demo",
      "--template",
      "rag-agent-ts",
      "--environment",
      "demo-dev",
      "--deploy",
      "--yes",
    ])).toMatchObject({
      command: "bootstrap",
      destination: "demo",
      template: "rag-agent-ts",
      environmentName: "demo-dev",
      installDependencies: true,
      linkProject: true,
      deploy: true,
    });
    expect(parseArguments([
      "bootstrap",
      "demo",
      "--no-install",
      "--no-link",
      "--no-git",
      "--yes",
    ])).toMatchObject({
      installDependencies: false,
      linkProject: false,
      initializeGit: false,
      deploy: false,
    });
  });

  it("configures existing or provisioned Azure resources", () => {
    expect(parseArguments([
      "bootstrap",
      "demo",
      "--provider",
      "azure-openai",
      "--azure-setup",
      "existing",
      "--azure-openai-endpoint",
      "https://sample.openai.azure.com",
      "--azure-openai-deployment",
      "chat",
      "--cosmos-endpoint",
      "https://sample.documents.azure.com:443/",
      "--yes",
    ])).toMatchObject({
      azureSetup: "existing",
      azureOpenAIEndpoint: "https://sample.openai.azure.com",
      azureOpenAIChatDeployment: "chat",
      cosmosEndpoint: "https://sample.documents.azure.com:443/",
    });
    expect(parseArguments([
      "bootstrap",
      "demo",
      "--azure-setup",
      "provision",
      "--provider",
      "azure-openai",
      "--azure-location",
      "eastus2",
      "--azure-openai-endpoint",
      "https://sample.openai.azure.com",
      "--azure-openai-deployment",
      "chat",
      "--entra-tenant-id",
      "tenant",
      "--entra-audience",
      "api://demo",
      "--entra-client-id",
      "client",
      "--entra-scope",
      "api://demo/access_as_user",
      "--yes",
    ])).toMatchObject({ azureSetup: "provision", deploy: true });
  });

  it("rejects invalid provider, authentication, and storage options", () => {
    expect(() => parseArguments(["demo", "--provider", "invalid"])).toThrow(/provider/i);
    expect(() => parseArguments(["demo", "--auth", "invalid"])).toThrow(/authentication/i);
    expect(() => parseArguments(["demo", "--storage", "invalid"])).toThrow(/storage/i);
  });

  it("rejects unknown options, missing values, and conflicting modes", () => {
    expect(() => parseArguments(["demo", "--unknown"])).toThrow(/unknown option/i);
    expect(() => parseArguments(["demo", "--template"])).toThrow(/requires a value/i);
    expect(() => parseArguments(["demo", "--force", "--dry-run"])).toThrow(/cannot be used/i);
    expect(() => parseArguments(["doctor", "--force"])).toThrow(/only valid/i);
    expect(() => parseArguments(["list", "unexpected"])).toThrow(/positional/i);
    expect(() => parseArguments(["doctor", "--capacity", "autoscale"])).toThrow(
      /scaffolding options/i,
    );
    expect(() => parseArguments(["list", "-C", "./sample"])).toThrow(/project/i);
    expect(() => parseArguments(["demo", "--deploy"])).toThrow(/only valid with bootstrap/i);
    expect(() => parseArguments(["bootstrap", "demo", "--deploy", "--no-link"]))
      .toThrow(/cannot be combined/i);
    expect(() => parseArguments(["bootstrap", "demo", "--environment", "dev", "--no-link"]))
      .toThrow(/cannot be combined/i);
    expect(() => parseArguments(["demo", "--azure-setup", "provision"]))
      .toThrow(/only valid with bootstrap/i);
    expect(() => parseArguments([
      "bootstrap", "demo", "--azure-setup", "provision", "--no-link",
    ])).toThrow(/cannot be combined/i);
    expect(() => parseArguments([
      "bootstrap", "demo", "--azure-setup", "provision", "--provider", "mock",
    ])).toThrow(/requires --provider azure-openai/i);
    expect(() => parseArguments([
      "bootstrap", "demo", "--azure-setup", "provision", "--provider", "azure-openai", "--yes",
    ])).toThrow(/requires: --azure-location/i);
    expect(() => parseArguments([
      "bootstrap", "demo", "--provider", "azure-openai", "--azure-setup", "existing",
    ])).toThrow(/requires --azure-openai-endpoint/i);
    expect(() => parseArguments(["demo", "--cosmos-endpoint", "http://example.com"]))
      .toThrow(/HTTPS URL/i);
  });

  it("requires JSON creation to be noninteractive", () => {
    expect(() => parseArguments(["demo", "--json"])).toThrow(/noninteractive/i);
    expect(parseArguments(["demo", "--json", "--dry-run"]).json).toBe(true);
  });
});
