import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseArguments } from "../../src/cli/arguments.js";
import { completionCandidates } from "../../src/cli/completion.js";
import { runCli } from "../../src/cli/run.js";
import { composeProject, listScenarios } from "../../src/generator/compose.js";
import { readLocalEnvironment } from "../../src/generator/environment.js";
import { probeLocalEndpoint, runLocalStatus, type LocalEndpoint } from "../../src/generator/local-status.js";

let root: string;
const scenarios = await listScenarios();
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "cosmos-local-status-"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

async function project(template = "chat-agent-ts", extra: string[] = []) {
  await composeProject({ ...parseArguments([root, "-y", "--no-git", "--template", template, ...extra]), force: true });
  await mkdir(join(root, "node_modules"), { recursive: true });
}

describe("local setup status", () => {
  it("reports mock defaults, lifetimes and unverified runtime without probing", async () => {
    await project();
    const probe = vi.fn(async () => true);
    const result = await runLocalStatus(root, { environment: {}, probe });
    expect(result).toMatchObject({
      status: "configured", connectivityChecked: false,
      configuration: { provider: "mock", storage: "in-memory", authMode: "local", worker: false, web: true },
      endpoints: [
        { service: "api", address: "http://localhost:3000/health", check: "health", status: "not-checked" },
        { service: "web", address: "http://localhost:5173", check: "head", status: "not-checked" },
      ],
    });
    expect(result.findings.map((item) => item.code)).toEqual(expect.arrayContaining([
      "LOCAL_MOCK", "LOCAL_VOLATILE_DATA", "LOCAL_CONNECTIVITY_NOT_CHECKED", "LOCAL_DIAGNOSTIC_SCOPE",
    ]));
    expect(probe).not.toHaveBeenCalled();
    await expect(readFile(join(root, ".env"))).rejects.toThrow();
  });

  it.each(scenarios)("reports appropriate endpoints for $id", async (scenario) => {
      const directory = join(root, scenario.id);
      await composeProject(parseArguments([directory, "-y", "--no-git", "--template", scenario.id]));
      await mkdir(join(directory, "node_modules"));
      const result = await runLocalStatus(directory, { environment: {} });
      expect(result.status).toBe("configured");
      expect(result.configuration.worker).toBe(scenario.category === "event");
      expect(result.endpoints.some((item) => item.service === "web")).toBe(scenario.capabilities.includes("react-web"));
      if (scenario.category === "event") {
        expect(result.endpoints).toEqual([]);
        expect(result.configuration.authMode).toBe("not-applicable");
        expect(result.findings.some((item) => item.code === "LOCAL_STDIN_WORKER")).toBe(true);
      }
  });

  it("reports API-only ports, proxy mismatch, and nonliteral Vite configurations honestly", async () => {
    await project("chat-agent-ts", ["--no-web"]);
    expect((await runLocalStatus(root, { environment: { PORT: "4567" } })).endpoints)
      .toEqual([{ service: "api", address: "http://localhost:4567/health", check: "health", status: "not-checked" }]);
    const invalid = await runLocalStatus(root, { environment: { PORT: "private-value" } });
    expect(invalid.status).toBe("blocked");
    expect(JSON.stringify(invalid)).not.toContain("private-value");
  });

  it("reports edited web ports without executing project code", async () => {
    await project();
    const mismatch = await runLocalStatus(root, { environment: { PORT: "4567" } });
    expect(mismatch.findings.some((item) => item.code === "LOCAL_WEB_PROXY")).toBe(true);
    await writeFile(join(root, "apps", "web", "vite.config.ts"), "throw new Error('must not execute'); export default { server: { port: Number(process.env.PORT) } };");
    const result = await runLocalStatus(root, { environment: {} });
    expect(result.findings.some((item) => item.code === "LOCAL_WEB_ADDRESS_MANUAL")).toBe(true);
    expect(result.endpoints.some((item) => item.service === "web")).toBe(false);
  });

  it("reports selected provider requirements and process-over-file precedence without exposing values", async () => {
    await project("chat-agent-ts", ["--provider", "openai"]);
    const missing = await runLocalStatus(root, { environment: {} });
    expect(missing.status).toBe("blocked");
    expect(JSON.stringify(missing)).toContain("OPENAI_API_KEY");
    expect(JSON.stringify(missing)).toContain("AI_PROVIDER");
    const content = 'AI_PROVIDER=openai\nOPENAI_API_KEY="do-not-expose"\nPORT=3456\n';
    await writeFile(join(root, ".env"), content);
    const result = await runLocalStatus(root, { environment: { AI_PROVIDER: "mock", PORT: "4567" } });
    expect(result.configuration.provider).toBe("mock");
    expect(result.endpoints[0]?.address).toBe("http://localhost:4567/health");
    expect(JSON.stringify(result)).not.toContain("do-not-expose");
    expect(await readFile(join(root, ".env"), "utf8")).toBe(content);
  });

  it("handles Entra web/API requirements and mismatches without SPA requirements for API-only", async () => {
    await project("chat-agent-ts", ["--no-web"]);
    const result = await runLocalStatus(root, { environment: { AUTH_MODE: "entra" } });
    expect(JSON.stringify(result)).toContain("AUTH_ENTRA_TENANT_ID");
    expect(JSON.stringify(result)).not.toContain("VITE_ENTRA");
    await project();
    const mismatch = await runLocalStatus(root, { environment: {
      AUTH_MODE: "entra", AUTH_ENTRA_TENANT_ID: "private-tenant", AUTH_ENTRA_AUDIENCE: "private-audience",
    } });
    expect(mismatch.findings.some((item) => item.code === "LOCAL_AUTH_MISMATCH")).toBe(true);
    expect(JSON.stringify(mismatch)).not.toContain("private-tenant");
    const web = await runLocalStatus(root, { environment: {
      AUTH_MODE: "entra", VITE_AUTH_MODE: "entra",
    } });
    expect(JSON.stringify(web)).toContain("VITE_ENTRA_CLIENT_ID");
  });

  it("checks Azure configuration without credential retrieval or cloud/model requests", async () => {
    await project();
    const probe = vi.fn(async () => true);
    const result = await runLocalStatus(root, { environment: {
      AI_PROVIDER: "azure-openai", AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
      AZURE_OPENAI_CHAT_DEPLOYMENT: "private-deployment", AZURE_OPENAI_API_KEY: "private-key",
    }, checkConnectivity: true, probe });
    expect(result.status).toBe("reachable");
    expect(result.findings.some((item) => item.code === "LOCAL_AZURE_MODEL_MANUAL")).toBe(true);
    expect(probe.mock.calls).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain("private-key");
    expect(JSON.stringify(result)).not.toContain("private-deployment");
    const invalid = await runLocalStatus(root, { environment: {
      AI_PROVIDER: "azure-openai", AZURE_OPENAI_ENDPOINT: "http://user:private-value@example.com?token=secret",
    } });
    expect(invalid.status).toBe("blocked");
    expect(JSON.stringify(invalid)).not.toContain("private-value");
  });

  it("reports Cosmos emulator and Ollama connectivity as TCP-only, not model/database verification", async () => {
    await project("chat-agent-ts", ["--storage", "cosmos"]);
    const probe = vi.fn(async () => true);
    const result = await runLocalStatus(root, { environment: {
      AI_PROVIDER: "ollama", OLLAMA_BASE_URL: "http://127.0.0.1:11434",
    }, checkConnectivity: true, timeoutMs: 1234, probe });
    expect(result.configuration.storage).toBe("cosmos");
    expect(result.endpoints.filter((item) => item.check === "tcp").map((item) => item.service)).toEqual(["ollama", "cosmos"]);
    expect(result.findings.some((item) => item.code === "LOCAL_OLLAMA_MODEL_MANUAL")).toBe(true);
    expect(result.findings.some((item) => item.code === "LOCAL_EMULATOR")).toBe(true);
    expect(probe.mock.calls.every(([, timeout]) => timeout === 1234)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("C2y6yDjf");
  });

  it("distinguishes unreachable services, missing dependencies and malformed configuration", async () => {
    await project();
    const probe = vi.fn(async () => false);
    const result = await runLocalStatus(root, { environment: {}, checkConnectivity: true, probe });
    expect(result.status).toBe("blocked");
    expect(result.endpoints.every((item) => item.status === "unreachable")).toBe(true);
    await rm(join(root, "node_modules"), { recursive: true });
    expect((await runLocalStatus(root, { environment: {} })).findings.some((item) => item.code === "LOCAL_DEPENDENCIES")).toBe(true);
    await writeFile(join(root, ".env"), "PRIVATE_TOKEN='secret not closed");
    await expect(runLocalStatus(root, { environment: {} })).rejects.toThrow("Invalid .env");
    await writeFile(join(root, ".env"), "INVALID secret-value");
    await expect(runLocalStatus(root, { environment: {} })).rejects.not.toThrow("secret-value");
  });

  it("handles event transport and invalid adapters without inventing API/web endpoints", async () => {
    await project("event-agent-ts");
    const result = await runLocalStatus(root, { environment: { EVENT_TRANSPORT: "service-bus", AUTH_MODE: "entra" } });
    expect(result.endpoints).toEqual([]);
    expect(JSON.stringify(result)).toContain("SERVICE_BUS_NAMESPACE");
    expect(JSON.stringify(result)).not.toContain("AUTH_ENTRA");
    const invalid = await runLocalStatus(root, { environment: {
      AI_PROVIDER: "private-value", MEMORY_BACKEND: "private-value", EVENT_TRANSPORT: "private-value",
    } });
    expect(invalid.status).toBe("blocked");
    expect(JSON.stringify(invalid)).not.toContain("private-value");
  });

  it("parses quoted, commented, exported and multiline env values without overwriting files", async () => {
    const content = "export FIRST=one # note\nSECOND='two # literal'\nTHIRD=\"three\\nfour\"\nMULTI='line1\nline2'\n";
    await writeFile(join(root, ".env"), content);
    expect(await readLocalEnvironment(root)).toEqual({
      FIRST: "one", SECOND: "two # literal", THIRD: "three\nfour", MULTI: "line1\nline2",
    });
    expect(await readFile(join(root, ".env"), "utf8")).toBe(content);
  });

  it("validates CLI opt-in/timeout boundaries and exposes help/completion", async () => {
    expect(parseArguments(["local-status", "-C", root, "--check-connectivity", "--timeout", "100"])).toMatchObject({
      command: "local-status", projectDirectory: root, checkConnectivity: true, timeoutMs: 100,
    });
    for (const timeout of ["0", "99", "10001", "abc", "1.5"]) {
      expect(() => parseArguments(["local-status", "--check-connectivity", "--timeout", timeout])).toThrow("timeout");
    }
    expect(() => parseArguments(["local-status", "--timeout", "100"])).toThrow("requires explicit");
    expect(() => parseArguments(["doctor", "--check-connectivity"])).toThrow("only valid");
    expect(completionCandidates(["local"], [])).toContainEqual(expect.objectContaining({ value: "local-status" }));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(await runCli(["local-status", "--help"])).toBe(0);
    expect(log.mock.calls.flat().join("\n")).toContain("--check-connectivity");
  });

  it("emits one parseable JSON document with names only and predictable failure exits", async () => {
    await project();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(await runCli(["local-status", root, "--json"])).toBe(0);
    expect(log).toHaveBeenCalledTimes(1);
    const result = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(Object.keys(result).sort()).toEqual([
      "command", "configuration", "connectivityChecked", "endpoints", "findings", "project", "schemaVersion", "status", "summary",
    ]);
    expect(result).toMatchObject({ command: "local-status", schemaVersion: 1, status: "configured", project: root });
    await rm(join(root, "node_modules"), { recursive: true });
    log.mockClear();
    expect(await runCli(["local-status", root, "--json"])).toBe(1);
    expect(JSON.parse(String(log.mock.calls[0]?.[0])).status).toBe("blocked");
  });

  it("verifies real API health, rejects wrong services/redirects, bounds stalled probes, and closes sockets", async () => {
    const server = createServer((request, response) => {
      if (request.url === "/health") { response.setHeader("content-type", "application/json"); response.end('{"status":"ok"}'); }
      else if (request.url === "/redirect") { response.writeHead(302, { location: "/health" }); response.end(); }
      else if (request.url === "/slow") { /* deliberately wait for the probe timeout */ }
      else response.end("not a health endpoint");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected TCP address.");
      const base = `http://127.0.0.1:${address.port}`;
      const endpoint: LocalEndpoint = { service: "api", address: `${base}/health`, check: "health", status: "not-checked" };
      expect(await probeLocalEndpoint(endpoint, 1000)).toBe(true);
      expect(await probeLocalEndpoint({ ...endpoint, address: base }, 1000)).toBe(false);
      expect(await probeLocalEndpoint({ ...endpoint, address: `${base}/redirect` }, 1000)).toBe(false);
      expect(await probeLocalEndpoint({ ...endpoint, check: "tcp" }, 1000)).toBe(true);
      const start = performance.now();
      expect(await probeLocalEndpoint({ ...endpoint, address: `${base}/slow` }, 100)).toBe(false);
      expect(performance.now() - start).toBeLessThan(2000);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
