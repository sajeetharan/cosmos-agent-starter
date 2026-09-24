import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  runAzureReadiness,
  type ReadinessCommand,
  type ReadinessCommandResult,
} from "../../src/generator/azure-readiness.js";

const created: string[] = [];
afterEach(async () => Promise.all(
  created.splice(0).map((path) => rm(path, { recursive: true, force: true })),
));

async function project(features: string[] = []): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cosmos-readiness-"));
  created.push(root);
  await writeFile(join(root, "azure.yaml"), "name: sample\n");
  await writeFile(join(root, "cosmos-project.json"), JSON.stringify({
    cosmos: { capacity: "serverless" },
    features,
  }));
  await mkdir(join(root, ".cosmos-agent"));
  await writeFile(
    join(root, ".cosmos-agent", "context.json"),
    JSON.stringify({ environmentName: "sample-dev" }),
  );
  return root;
}

function commandResult(
  command: ReadinessCommand,
  environmentValues: string,
): ReadinessCommandResult {
  if (command.args[0] === "version") {
    return { exitCode: 0, stdout: "azd 1.34.2", stderr: "" };
  }
  if (command.args.includes("--check-status")) {
    return { exitCode: 0, stdout: "", stderr: "" };
  }
  return { exitCode: 0, stdout: environmentValues, stderr: "" };
}

describe("Azure deployment readiness", () => {
  it("reports a configured project as ready with explicit capacity guidance", async () => {
    const root = await project();
    const environmentValues = [
      'AZURE_LOCATION="eastus2"',
      'ENTRA_TENANT_ID="tenant"',
      'ENTRA_AUDIENCE="api://sample"',
      'ENTRA_CLIENT_ID="client"',
      'ENTRA_SCOPE="api://sample/access_as_user"',
      'AI_PROVIDER="azure-openai"',
      'AZURE_OPENAI_ENDPOINT="https://sample.openai.azure.com"',
      'AZURE_OPENAI_CHAT_DEPLOYMENT="chat"',
    ].join("\n");
    const result = await runAzureReadiness(
      root,
      undefined,
      async (command) => commandResult(command, environmentValues),
    );

    expect(result).toMatchObject({ ready: true, environmentName: "sample-dev" });
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "MODEL_CAPACITY", severity: "warning" }),
      expect.objectContaining({
        code: "COSMOS_CAPACITY",
        message: expect.stringContaining("serverless"),
      }),
    ]));
  });

  it("blocks deployment when Entra and model configuration are missing", async () => {
    const root = await project();
    const result = await runAzureReadiness(
      root,
      "review-dev",
      async (command) => commandResult(command, 'AZURE_LOCATION="eastus2"'),
    );

    expect(result).toMatchObject({ ready: false, environmentName: "review-dev" });
    expect(result.findings.filter((item) => item.severity === "error"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("ENTRA_TENANT_ID") }),
        expect.objectContaining({ message: expect.stringContaining("AZURE_OPENAI_ENDPOINT") }),
      ]));
  });

  it("stops early with installation guidance when azd is unavailable", async () => {
    const root = await project();
    const result = await runAzureReadiness(root, undefined, async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "not found",
    }));

    expect(result.ready).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({ code: "AZD_INSTALL" }));
  });

  it("does not require browser authentication values for event workers", async () => {
    const root = await project(["event-driven"]);
    const environmentValues = [
      'AZURE_LOCATION="eastus2"',
      'AI_PROVIDER="openai"',
      'OPENAI_API_KEY="configured"',
    ].join("\n");
    const result = await runAzureReadiness(
      root,
      undefined,
      async (command) => commandResult(command, environmentValues),
    );

    expect(result.ready).toBe(true);
    expect(result.findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining("ENTRA_TENANT_ID") }),
    ]));
  });
});
