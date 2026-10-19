import { access, readFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { join } from "node:path";
import { readProjectManifest } from "./manifest.js";
import { loadScenario } from "./compose.js";
import { readLocalEnvironment } from "./environment.js";
import type { DoctorFinding } from "./doctor.js";
import { summarizeFindings } from "../cli/output.js";

export interface LocalEndpoint {
  service: "api" | "web" | "ollama" | "cosmos";
  address: string;
  check: "health" | "head" | "tcp";
  status: "not-checked" | "reachable" | "unreachable";
}

export type LocalProbe = (endpoint: LocalEndpoint, timeoutMs: number) => Promise<boolean>;

export interface LocalStatusResult {
  schemaVersion: 1;
  status: "configured" | "reachable" | "blocked";
  configuration: { scenario: string; provider: string; storage: string; authMode: string; worker: boolean; web: boolean };
  connectivityChecked: boolean;
  endpoints: LocalEndpoint[];
  findings: DoctorFinding[];
  summary: ReturnType<typeof summarizeFindings>;
}

export const probeLocalEndpoint: LocalProbe = async (endpoint, timeoutMs) => {
  const url = new URL(endpoint.address);
  if (endpoint.check === "tcp") {
    return new Promise((resolve) => {
      const socket = createConnection({
        host: url.hostname.replace(/^\[|\]$/g, ""),
        port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
      });
      const finish = (available: boolean) => { clearTimeout(timer); socket.destroy(); resolve(available); };
      const timer = setTimeout(() => finish(false), timeoutMs);
      socket.once("error", () => finish(false));
      socket.once("connect", () => finish(true));
    });
  }
  try {
    const response = await fetch(endpoint.address, {
      method: endpoint.check === "head" ? "HEAD" : "GET",
      redirect: "error", signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) { await response.body?.cancel(); return false; }
    if (endpoint.check === "head") { await response.body?.cancel(); return true; }
    const reader = response.body?.getReader();
    if (!reader) return false;
    let text = "";
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        text += new TextDecoder().decode(part.value);
        if (text.length > 16_384) return false;
      }
      const health: unknown = JSON.parse(text);
      return typeof health === "object" && health !== null && "status" in health && health.status === "ok";
    } finally { await reader.cancel(); }
  } catch {
    return false;
  }
};

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

export async function runLocalStatus(
  root: string,
  options: { checkConnectivity?: boolean; timeoutMs?: number; environment?: NodeJS.ProcessEnv; probe?: LocalProbe } = {},
): Promise<LocalStatusResult> {
  const timeoutMs = options.timeoutMs ?? 2000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10000) {
    throw new Error("Connectivity timeout must be an integer from 100 to 10000 milliseconds.");
  }
  const manifest = await readProjectManifest(root);
  const scenario = await loadScenario(manifest.scenario);
  const environment = { ...await readLocalEnvironment(root), ...(options.environment ?? process.env) };
  const findings: DoctorFinding[] = [];
  const endpoints: LocalEndpoint[] = [];
  const add = (severity: DoctorFinding["severity"], code: string, message: string, remediation: string) =>
    findings.push({ severity, code, message, remediation, evidence: "Generated manifest and local configuration (values withheld)." });
  const required = (names: string[]) => {
    const missing = names.filter((name) => !environment[name]?.trim());
    if (missing.length) add("error", "LOCAL_MISSING_CONFIG", `Missing environment variable names: ${missing.join(", ")}.`,
      "Review .env.example and manually set these values in .env or the process environment. Existing values were not changed.");
  };
  const choice = (name: string, fallback: string, choices: string[]) => {
    const value = environment[name]?.trim() || fallback;
    if (!choices.includes(value)) {
      add("error", "LOCAL_INVALID_CONFIG", `${name} has an unsupported value.`, `Set ${name} to one of: ${choices.join(", ")}.`);
      return "invalid";
    }
    return value;
  };
  const provider = choice("AI_PROVIDER", manifest.ai.provider, ["mock", "azure-openai", "openai", "ollama"]);
  const storage = choice("MEMORY_BACKEND", manifest.storage.development, ["in-memory", "cosmos"]);
  const worker = scenario.capabilities.includes("event-driven");
  const web = !worker && scenario.capabilities.includes("react-web") && await exists(join(root, "apps", "web", "package.json"));
  const authMode = worker ? "not-applicable" : choice("AUTH_MODE", manifest.authentication.development, ["local", "entra"]);
  const production = environment.NODE_ENV === "production";
  for (const [name, selected, runtimeDefault] of [
    ["AI_PROVIDER", provider, "mock"],
    ["MEMORY_BACKEND", storage, production ? "cosmos" : "in-memory"],
    ...(!worker ? [["AUTH_MODE", authMode, production ? "entra" : "local"]] : []),
  ]) {
    if (!environment[name!]?.trim() && selected !== runtimeDefault) required([name!]);
  }
  if (production && (provider === "mock" || (!worker && authMode === "local"))) {
    add("error", "LOCAL_PRODUCTION_ADAPTER", "Development-only adapters cannot run in production mode.",
      "Use NODE_ENV=development for local testing, or configure production identity and a real provider.");
  }
  if (!await exists(join(root, "node_modules"))) {
    add("error", "LOCAL_DEPENDENCIES", "Project dependencies are not installed.", "Run npm install from the generated project directory, then rerun local-status.");
  }
  const endpoint = (service: LocalEndpoint["service"], value: string, check: LocalEndpoint["check"], variable: string) => {
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
      endpoints.push({ service, address: check === "health" ? `${url.origin}/health` : url.origin, check, status: "not-checked" });
    } catch {
      add("error", "LOCAL_INVALID_ENDPOINT", `${variable} is not a valid credential-free HTTP(S) address.`,
        `Review ${variable}; credentials, query strings, and fragments are not supported in readiness addresses.`);
    }
  };
  if (provider === "mock") add("info", "LOCAL_MOCK", "Mock responses are deterministic demonstrations, not live inference.",
    "Choose and configure a real provider when you need model-generated responses.");
  if (storage === "in-memory") add("warning", "LOCAL_VOLATILE_DATA", "In-memory data is lost when the process stops.",
    "Use Cosmos storage for persistence when needed; no migration or provisioning was performed.");
  if (provider === "openai") required(["OPENAI_API_KEY"]);
  if (provider === "openai" && environment.OPENAI_BASE_URL) {
    try {
      const url = new URL(environment.OPENAI_BASE_URL);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
    } catch {
      add("error", "LOCAL_INVALID_ENDPOINT", "OPENAI_BASE_URL must be a credential-free HTTP(S) address.",
        "Review OPENAI_BASE_URL; no values are displayed and no provider requests were sent.");
    }
  }
  if (provider === "azure-openai") {
    required(["AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_CHAT_DEPLOYMENT"]);
    if (environment.AZURE_OPENAI_ENDPOINT) {
      try {
        const url = new URL(environment.AZURE_OPENAI_ENDPOINT);
        if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error();
      } catch {
        add("error", "LOCAL_INVALID_ENDPOINT", "AZURE_OPENAI_ENDPOINT must be a credential-free HTTPS endpoint.",
          "Review AZURE_OPENAI_ENDPOINT. No endpoint value or credentials are displayed.");
      }
    }
    add("warning", "LOCAL_AZURE_MODEL_MANUAL", "Azure model authentication, deployment capability, and quota were not verified.",
      "Use prepare-azure and the provider's configuration guidance; local-status never obtains tokens or calls model inference.");
  }
  if (provider === "ollama") {
    endpoint("ollama", environment.OLLAMA_BASE_URL?.trim() || "http://localhost:11434", "tcp", "OLLAMA_BASE_URL");
    add("warning", "LOCAL_OLLAMA_MODEL_MANUAL", "Ollama model installation was not verified.",
      "Check the configured OLLAMA_MODEL (default llama3.2) on your model server. A TCP probe cannot verify model availability.");
  }
  if (storage === "cosmos") {
    required(["COSMOS_ENDPOINT"]);
    const emulator = environment.COSMOS_EMULATOR === "true";
    if (emulator) {
      required(["COSMOS_EMULATOR_KEY"]);
      add("warning", "LOCAL_EMULATOR", "Emulator container, database initialization and feature compatibility require verification.",
        "Start Docker with Linux containers and use npm run dev. No containers or initialization scripts were started by this command.");
    } else {
      add("warning", "LOCAL_COSMOS_IDENTITY_MANUAL", "Cosmos managed identity, data-plane roles, and database availability were not verified.",
        "Review prepare-azure findings; no credentials were obtained or data-plane requests sent.");
    }
    if (environment.COSMOS_EMULATOR && !["true", "false"].includes(environment.COSMOS_EMULATOR)) {
      add("error", "LOCAL_INVALID_CONFIG", "COSMOS_EMULATOR must be true or false.", "Review COSMOS_EMULATOR in .env or the process environment.");
    }
    if (environment.COSMOS_ENDPOINT) endpoint("cosmos", environment.COSMOS_ENDPOINT, "tcp", "COSMOS_ENDPOINT");
  }
  if (worker) {
    const transport = choice("EVENT_TRANSPORT", "stdin", ["stdin", "service-bus"]);
    if (transport === "service-bus") {
      required(["SERVICE_BUS_NAMESPACE"]);
      add("warning", "LOCAL_SERVICE_BUS_MANUAL", "Service Bus authentication and receiver permissions were not verified.",
        "Review the worker README; no messages or customer data were sent.");
    } else if (transport === "stdin") {
      add("info", "LOCAL_STDIN_WORKER", "This worker reads one JSON event per stdin line; it exposes no API or web endpoint.",
        "Run npm run dev and use the README's sample event. Process inspection is separate from starting the worker.");
    }
  } else {
    if (authMode === "entra") required(["AUTH_ENTRA_TENANT_ID", "AUTH_ENTRA_AUDIENCE"]);
    if (web) {
      const webAuth = choice("VITE_AUTH_MODE", "local", ["local", "entra"]);
      if (webAuth === "entra") required(["VITE_ENTRA_TENANT_ID", "VITE_ENTRA_CLIENT_ID", "VITE_API_SCOPE"]);
      if (authMode !== "invalid" && webAuth !== "invalid" && webAuth !== authMode) {
        add("error", "LOCAL_AUTH_MISMATCH", "API and web authentication modes do not match.",
          "Review AUTH_MODE and VITE_AUTH_MODE together; values were not changed.");
      }
    }
    const port = environment.PORT ?? "3000";
    if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
      add("error", "LOCAL_INVALID_PORT", "PORT must be an integer from 1 to 65535.", "Choose a free local API port.");
    } else endpoint("api", `http://localhost:${port}`, "health", "PORT");
    if (web) {
      const config = await readFile(join(root, "apps", "web", "vite.config.ts"), "utf8");
      const webPort = /server\s*:\s*\{\s*port\s*:\s*(\d+)/m.exec(config)?.[1];
      if (webPort && Number(webPort) >= 1 && Number(webPort) <= 65535) {
        endpoint("web", `http://localhost:${webPort}`, "head", "Vite server.port");
      } else add("warning", "LOCAL_WEB_ADDRESS_MANUAL", "The edited Vite configuration does not declare a recognizable static server port.",
        "Use the URL printed by Vite; local-status does not execute project configuration.");
      if (port !== "3000" && config.includes("127.0.0.1:3000")) {
        add("warning", "LOCAL_WEB_PROXY", "The API port differs from the generated Vite proxy target.",
          "Update the web Vite proxy to the configured API port before testing browser requests.");
      }
      add("info", "LOCAL_WEB_PORT", "Vite may choose another port if its configured port is occupied.",
        "Use the actual URL printed by npm run dev or configure Vite strictPort. Stop only processes you own or choose another port.");
    }
  }
  if (options.checkConnectivity) {
    await Promise.all(endpoints.map(async (item) => {
      const reachable = await (options.probe ?? probeLocalEndpoint)(item, timeoutMs);
      item.status = reachable ? "reachable" : "unreachable";
      add(reachable ? "info" : "error", reachable ? "LOCAL_REACHABLE" : "LOCAL_UNREACHABLE",
        `${item.service}: ${reachable ? "probe passed" : "probe failed or timed out"}.`,
        reachable
          ? "This probe does not verify model capability, tenant access, or application behavior beyond the reported check."
          : "Start the selected service yourself, check its logs and configured port, and stop only conflicting processes you own. Retry with --check-connectivity.");
    }));
  } else add("info", "LOCAL_CONNECTIVITY_NOT_CHECKED", "Runtime connectivity was not checked.",
    "Start services separately, then explicitly use --check-connectivity. Each probe has a bounded timeout and sends no credentials or inference requests.");
  add("info", "LOCAL_DIAGNOSTIC_SCOPE", "Local setup inspection does not replace static safety or Azure readiness checks.",
    "Run doctor for project safety findings and prepare-azure before deployment. No files were changed.");
  const summary = summarizeFindings(findings);
  return {
    schemaVersion: 1,
    status: summary.errors ? "blocked" : options.checkConnectivity && endpoints.length ? "reachable" : "configured",
    configuration: { scenario: manifest.scenario, provider, storage, authMode, worker, web },
    connectivityChecked: options.checkConnectivity ?? false, endpoints, findings, summary,
  };
}
