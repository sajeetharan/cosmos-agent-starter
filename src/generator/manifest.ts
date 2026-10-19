import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface Scenario {
  id: string;
  name: string;
  description: string;
  category: "foundation" | "chat" | "rag" | "support" | "multi-agent" | "event";
  base: string;
  features: string[];
  capabilities: string[];
}

function isProjectManifest(value: unknown): value is ProjectManifest {
  const object = (item: unknown): item is Record<string, unknown> =>
    typeof item === "object" && item !== null && !Array.isArray(item);
  return !(!object(value) || value.schemaVersion !== 1 || value.language !== "typescript" ||
    value.hosting !== "container-apps" ||
    typeof value.scenario !== "string" || !object(value.cosmos) ||
    value.cosmos.api !== "nosql" || value.cosmos.partitioning !== "hierarchical" || value.cosmos.vectorSearch !== true ||
    !["serverless", "autoscale"].includes(String(value.cosmos.capacity)) ||
    !object(value.authentication) || value.authentication.production !== "entra-id" ||
    !["local", "entra"].includes(String(value.authentication.development)) ||
    !object(value.ai) || !["mock", "azure-openai", "openai", "ollama"].includes(String(value.ai.provider)) ||
    !object(value.storage) || value.storage.production !== "cosmos" ||
    !["in-memory", "cosmos"].includes(String(value.storage.development)) ||
    !["emulator", "azure"].includes(String(value.storage.cosmosConnection)) ||
    !Array.isArray(value.features) || !value.features.every((item) => typeof item === "string"));
}

export async function readProjectManifest(root: string): Promise<ProjectManifest> {
  const value: unknown = JSON.parse(await readFile(join(root, "cosmos-project.json"), "utf8"));
  if (!isProjectManifest(value)) {
    throw new Error("Invalid or unsupported cosmos-project.json. Restore a schemaVersion 1 generated manifest.");
  }
  return value;
}

export interface ProjectManifest {
  schemaVersion: 1;
  language: "typescript";
  scenario: string;
  hosting: "container-apps";
  cosmos: {
    api: "nosql";
    capacity: "serverless" | "autoscale";
    partitioning: "hierarchical";
    vectorSearch: true;
  };
  authentication: {
    production: "entra-id";
    development: "local" | "entra";
  };
  ai: {
    provider: "mock" | "azure-openai" | "openai" | "ollama";
  };
  storage: {
    development: "in-memory" | "cosmos";
    production: "cosmos";
    cosmosConnection: "emulator" | "azure";
  };
  features: string[];
}
