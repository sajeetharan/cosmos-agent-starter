import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { composeProject, listScenarios, loadScenario } from "../../src/generator/compose.js";
import { runDoctor } from "../../src/generator/doctor.js";

const created: string[] = [];
afterEach(async () => Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

async function destination(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "cosmos-agent-test-"));
  created.push(path);
  return path;
}
const options = (path: string) => ({
  command: "create" as const, destination: path, template: "agent-memory-ts",
  localMode: "emulator" as const, capacity: "serverless" as const,
  provider: "mock" as const, authMode: "local" as const, storage: "in-memory" as const,
  includeWeb: true, initializeGit: false, yes: true, force: true, dryRun: false,
  json: false, projectDirectory: ".", azureSetup: "later" as const,
});

describe("scenario composition", () => {
  it("loads the declarative scenario", async () => {
    expect((await loadScenario("agent-memory-ts")).features).toContain("agent-memory");
  });
  it("lists every customer scenario", async () => {
    expect((await listScenarios()).map((scenario) => scenario.id)).toEqual([
      "agent-memory-ts",
      "chat-agent-ts",
      "customer-support-ts",
      "event-agent-ts",
      "multi-agent-ts",
      "rag-agent-ts",
    ]);
  });
  it("rejects an invalid template", async () => {
    await expect(loadScenario("missing")).rejects.toThrow(/unknown template/i);
  });
  it("generates deterministic manifest and required surfaces", async () => {
    const first = await destination();
    const second = await destination();
    await composeProject(options(first));
    await composeProject(options(second));
    expect(await readFile(join(first, "cosmos-project.json"), "utf8"))
      .toBe(await readFile(join(second, "cosmos-project.json"), "utf8"));
    expect(await readFile(join(first, ".github", "copilot-instructions.md"), "utf8")).toMatch(/DefaultAzureCredential/);
    expect(await readFile(join(first, "docs", "architecture.md"), "utf8"))
      .toMatch(/Conversation store[\s\S]*Durable memory store/);
    expect(await readFile(join(first, "scripts", "init-emulator.ts"), "utf8"))
      .toMatch(/conversation-history[\s\S]*agent-memory[\s\S]*vectorEmbeddingPolicy/);
    expect(await readFile(join(first, "scripts", "init-emulator.ts"), "utf8"))
      .not.toContain("vectorIndexes");
    expect(await readFile(join(first, "tests", "scenarios", "multi-tenant.test.ts"), "utf8"))
      .toMatch(/isolates conversation, durable memory, deletion, and approval flows/);
    expect(await readFile(join(first, "infra", "modules", "cosmos.bicep"), "utf8"))
      .toMatch(/name: 'conversation-history'[\s\S]*name: 'agent-memory'/);
    expect(JSON.parse(await readFile(join(first, "package.json"), "utf8")))
      .toMatchObject({ scripts: { "emulator:init": "tsx scripts/init-emulator.ts" } });
    expect(await readFile(join(first, "docker-compose.yml"), "utf8"))
      .toMatch(/PROTOCOL: http/);
  }, 15_000);
  it("composes every customer template with scenario-specific metadata", async () => {
    for (const template of [
      "chat-agent-ts",
      "rag-agent-ts",
      "customer-support-ts",
      "multi-agent-ts",
    ]) {
      const path = await destination();
      await composeProject({ ...options(path), template });
      const manifest = JSON.parse(await readFile(join(path, "cosmos-project.json"), "utf8")) as {
        scenario: string;
      };
      expect(manifest.scenario).toBe(template);
      expect(await readFile(join(path, "apps", "web", "src", "App.tsx"), "utf8"))
        .toContain("Context-aware assistant");
      expect(await readFile(join(path, "apps", "api", "src", "server.ts"), "utf8"))
        .toContain(`id: "${template}"`);
    }
  }, 15_000);
  it("does not leave web Docker copy steps in the API-only memory template", async () => {
    const path = await destination();
    await composeProject({ ...options(path), template: "agent-memory-ts" });
    expect(await readFile(join(path, "Dockerfile"), "utf8")).not.toContain("apps/web");
  });
  it("composes an API-free event worker with retry-safe contracts", async () => {
    const path = await destination();
    await composeProject({ ...options(path), template: "event-agent-ts" });
    const packageJson = JSON.parse(await readFile(join(path, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      workspaces?: string[];
    };
    expect(packageJson.dependencies).toHaveProperty("@azure/service-bus");
    expect(packageJson.workspaces).toBeUndefined();
    expect(await readFile(join(path, "apps", "api", "src", "server.ts"), "utf8"))
      .toContain("EVENT_TRANSPORT");
    expect(await readFile(join(path, "packages", "agent", "src", "index.ts"), "utf8"))
      .toContain("idempotencyKey");
    expect(await readFile(join(path, "infra", "modules", "service-bus.bicep"), "utf8"))
      .toContain("maxDeliveryCount: 10");
    expect(await readFile(join(path, "infra", "main.parameters.json"), "utf8"))
      .not.toContain("ENTRA_TENANT_ID");
    expect(await readFile(join(path, "README.md"), "utf8")).toContain("Service Bus");
  });
  it("writes assisted provider, authentication, and storage selections", async () => {
    const path = await destination();
    await composeProject({
      ...options(path),
      template: "chat-agent-ts",
      provider: "ollama",
      authMode: "entra",
      storage: "cosmos",
      localMode: "azure",
    });
    const environment = await readFile(join(path, ".env.example"), "utf8");
    expect(environment).toMatch(/^AI_PROVIDER=ollama$/m);
    expect(environment).toMatch(/^AUTH_MODE=entra$/m);
    expect(environment).toMatch(/^MEMORY_BACKEND=cosmos$/m);
    expect(JSON.parse(await readFile(join(path, "cosmos-project.json"), "utf8")))
      .toMatchObject({
        ai: { provider: "ollama" },
        authentication: { development: "entra" },
        storage: { development: "cosmos", cosmosConnection: "azure" },
      });
  });
  it("starts and initializes the selected local emulator through npm run dev", async () => {
    const path = await destination();
    await composeProject({
      ...options(path),
      template: "chat-agent-ts",
      storage: "cosmos",
      localMode: "emulator",
    });
    const packageSource = await readFile(join(path, "package.json"), "utf8");
    const packageJson = JSON.parse(packageSource) as {
      scripts: Record<string, string>;
    };
    expect(packageSource.match(/"emulator:init"/g)).toHaveLength(1);
    expect(packageJson.scripts).toMatchObject({
      "dev:app": "concurrently -k -n api,web -c blue,magenta \"npm:dev:api\" \"npm:dev:web\"",
      "emulator:start": "docker compose up -d --wait",
      "emulator:stop": "docker compose down",
      predev: "npm run emulator:start && npm run emulator:init",
    });
    expect(await readFile(join(path, ".env"), "utf8")).toMatch(
      /^COSMOS_EMULATOR_KEY=.+$/m,
    );
    expect(await readFile(join(path, "apps", "api", "src", "server.ts"), "utf8"))
      .toContain("The request failed. Check the API logs for details.");
  });
  it("does not start the emulator for in-memory development", async () => {
    const path = await destination();
    await composeProject({ ...options(path), template: "chat-agent-ts" });
    const packageJson = JSON.parse(await readFile(join(path, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts.predev).toBeUndefined();
    await expect(readFile(join(path, ".env"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("writes existing Azure resource endpoints into the local environment", async () => {
    const path = await destination();
    await composeProject({
      ...options(path),
      template: "customer-support-ts",
      provider: "azure-openai",
      storage: "cosmos",
      localMode: "azure",
      azureSetup: "existing",
      azureOpenAIEndpoint: "https://sample.openai.azure.com",
      azureOpenAIChatDeployment: "chat",
      cosmosEndpoint: "https://sample.documents.azure.com:443/",
    });
    const environment = await readFile(join(path, ".env"), "utf8");
    expect(environment).toMatch(/^AZURE_OPENAI_ENDPOINT=https:\/\/sample\.openai\.azure\.com$/m);
    expect(environment).toMatch(/^AZURE_OPENAI_CHAT_DEPLOYMENT=chat$/m);
    expect(environment).toMatch(/^COSMOS_ENDPOINT=https:\/\/sample\.documents\.azure\.com:443\/$/m);
    expect(environment).toMatch(/^COSMOS_EMULATOR=false$/m);
    expect(environment).toMatch(/^COSMOS_EMULATOR_KEY=$/m);
  });
  it("produces a buildable API-only layout with --no-web", async () => {
    const path = await destination();
    await composeProject({ ...options(path), template: "chat-agent-ts", includeWeb: false });
    const packageJson = JSON.parse(await readFile(join(path, "package.json"), "utf8")) as {
      workspaces: string[];
      scripts: Record<string, string>;
    };
    expect(packageJson.workspaces).not.toContain("apps/web");
    expect(packageJson.scripts.dev).toBe("npm run dev:api");
    expect(await readFile(join(path, "Dockerfile"), "utf8")).not.toContain("apps/web");
  });
  it("refuses a non-empty destination without confirmation", async () => {
    const path = await destination();
    await writeFile(join(path, "existing.txt"), "preserve me");
    await expect(composeProject({ ...options(path), force: false })).rejects.toThrow(/not empty/i);
  });
  it("merges generated dot-directories when force-overwriting an existing project", async () => {
    const path = await destination();
    await composeProject(options(path));
    await writeFile(join(path, ".github", "customer-owned.txt"), "preserve me");
    await expect(composeProject({
      ...options(path),
      template: "chat-agent-ts",
      force: true,
    })).resolves.toBe(path);
    expect(await readFile(join(path, ".github", "customer-owned.txt"), "utf8")).toBe("preserve me");
    expect(await readFile(join(path, ".github", "copilot-instructions.md"), "utf8"))
      .toMatch(/DefaultAzureCredential/);
  }, 15_000);
  it("ignores installed workspace links when force-overwriting a project", async () => {
    const path = await destination();
    await composeProject({ ...options(path), template: "customer-support-ts" });
    const modules = join(path, "node_modules");
    await mkdir(modules);
    await symlink(join(path, "apps", "api"), join(modules, "workspace-api"), "junction");
    await expect(composeProject({
      ...options(path),
      template: "customer-support-ts",
      storage: "cosmos",
      force: true,
    })).resolves.toBe(path);
  }, 15_000);
  it("doctor detects intentionally unsafe patterns", async () => {
    const path = await destination();
    await composeProject(options(path));
    await writeFile(join(path, "unsafe.ts"), "container.items.query(`SELECT * FROM c WHERE c.id = '${id}'`).fetchAll();");
    const findings = await runDoctor(path);
    expect(findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      "QUERY_INTERPOLATION",
      "UNBOUNDED_FETCH",
      "UNBOUNDED_SELECT",
    ]));
  });
  it("doctor permits bounded TOP interpolation in generated Cosmos queries", async () => {
    const path = await destination();
    await composeProject({ ...options(path), template: "customer-support-ts" });
    const findings = await runDoctor(path);
    expect(findings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "QUERY_INTERPOLATION" }),
    ]));
  });
});
