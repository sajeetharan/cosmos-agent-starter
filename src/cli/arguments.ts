export type Capacity = "serverless" | "autoscale";
export type LocalMode = "emulator" | "azure";
export type AIProvider = "mock" | "azure-openai" | "openai" | "ollama";
export type AuthMode = "local" | "entra";
export type StorageBackend = "in-memory" | "cosmos";
export type AzureSetup = "later" | "existing" | "provision";
export type CliCommand =
  | "create"
  | "bootstrap"
  | "list"
  | "doctor"
  | "prepare-azure"
  | "validate"
  | "help"
  | "version";

export interface CliOptions {
  command: CliCommand;
  destination?: string;
  projectDirectory: string;
  template: string;
  localMode: LocalMode;
  capacity: Capacity;
  provider: AIProvider;
  authMode: AuthMode;
  storage: StorageBackend;
  includeWeb: boolean;
  initializeGit: boolean;
  installDependencies: boolean;
  linkProject: boolean;
  deploy: boolean;
  environmentName?: string;
  azureSetup: AzureSetup;
  azureLocation?: string;
  azureOpenAIEndpoint?: string;
  azureOpenAIChatDeployment?: string;
  cosmosEndpoint?: string;
  entraTenantId?: string;
  entraAudience?: string;
  entraClientId?: string;
  entraScope?: string;
  yes: boolean;
  force: boolean;
  dryRun: boolean;
  json: boolean;
}

const valueFlags = new Map<string, "template" | "capacity" | "localMode" | "projectDirectory" | "provider" | "authMode" | "storage" | "environmentName" | "azureSetup" | "azureLocation" | "azureOpenAIEndpoint" | "azureOpenAIChatDeployment" | "cosmosEndpoint" | "entraTenantId" | "entraAudience" | "entraClientId" | "entraScope">([
  ["--template", "template"],
  ["-t", "template"],
  ["--capacity", "capacity"],
  ["--local", "localMode"],
  ["--provider", "provider"],
  ["--auth", "authMode"],
  ["--storage", "storage"],
  ["--project", "projectDirectory"],
  ["-C", "projectDirectory"],
  ["--environment", "environmentName"],
  ["-e", "environmentName"],
  ["--azure-setup", "azureSetup"],
  ["--azure-location", "azureLocation"],
  ["--azure-openai-endpoint", "azureOpenAIEndpoint"],
  ["--azure-openai-deployment", "azureOpenAIChatDeployment"],
  ["--cosmos-endpoint", "cosmosEndpoint"],
  ["--entra-tenant-id", "entraTenantId"],
  ["--entra-audience", "entraAudience"],
  ["--entra-client-id", "entraClientId"],
  ["--entra-scope", "entraScope"],
] as const);

const booleanFlags = new Set([
  "--list",
  "-l",
  "--yes",
  "-y",
  "--force",
  "-f",
  "--dry-run",
  "--json",
  "--web",
  "--no-web",
  "--git",
  "--no-git",
  "--install",
  "--no-install",
  "--link",
  "--no-link",
  "--deploy",
  "--help",
  "-h",
  "--version",
  "-v",
]);

function normalizeArgs(args: string[]): string[] {
  return args.map((argument) => {
    if (!argument.startsWith("--") || !argument.includes("=")) return argument;
    const [flag, ...value] = argument.split("=");
    return [flag, value.join("=")].join("\0");
  }).flatMap((argument) => argument.split("\0"));
}

export function parseArguments(rawArgs: string[]): CliOptions {
  const args = normalizeArgs(rawArgs);
  const first = args[0];
  const wizard = first === "wizard";
  const explicitCommand =
    wizard
      ? "create"
      : first === "create" || first === "bootstrap" || first === "doctor" ||
          first === "prepare-azure" || first === "validate" || first === "list"
      ? first
      : undefined;
  const commandOffset = explicitCommand ? 1 : 0;
  let command: CliCommand = explicitCommand ?? "create";
  let template = "chat-agent-ts";
  let capacity: string = "serverless";
  let localMode: string = "emulator";
  let provider: string = "mock";
  let authMode: string = "local";
  let storage: string = "in-memory";
  let projectDirectory = ".";
  let destination: string | undefined;
  let includeWeb = true;
  let initializeGit = true;
  let installDependencies = explicitCommand === "bootstrap";
  let linkProject = explicitCommand === "bootstrap";
  let deploy = false;
  let environmentName: string | undefined;
  let azureSetup: string = "later";
  let azureLocation: string | undefined;
  let azureOpenAIEndpoint: string | undefined;
  let azureOpenAIChatDeployment: string | undefined;
  let cosmosEndpoint: string | undefined;
  let entraTenantId: string | undefined;
  let entraAudience: string | undefined;
  let entraClientId: string | undefined;
  let entraScope: string | undefined;
  let yes = false;
  let force = false;
  let dryRun = false;
  let json = false;

  for (let index = commandOffset; index < args.length; index += 1) {
    const argument = args[index]!;
    const valueKey = valueFlags.get(argument);
    if (valueKey) {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error(`Option "${argument}" requires a value.`);
      }
      if (valueKey === "template") template = value;
      if (valueKey === "capacity") capacity = value;
      if (valueKey === "localMode") localMode = value;
      if (valueKey === "provider") provider = value;
      if (valueKey === "authMode") authMode = value;
      if (valueKey === "storage") storage = value;
      if (valueKey === "projectDirectory") projectDirectory = value;
      if (valueKey === "environmentName") environmentName = value;
      if (valueKey === "azureSetup") azureSetup = value;
      if (valueKey === "azureLocation") azureLocation = value;
      if (valueKey === "azureOpenAIEndpoint") azureOpenAIEndpoint = value;
      if (valueKey === "azureOpenAIChatDeployment") azureOpenAIChatDeployment = value;
      if (valueKey === "cosmosEndpoint") cosmosEndpoint = value;
      if (valueKey === "entraTenantId") entraTenantId = value;
      if (valueKey === "entraAudience") entraAudience = value;
      if (valueKey === "entraClientId") entraClientId = value;
      if (valueKey === "entraScope") entraScope = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("-") && !booleanFlags.has(argument)) {
      throw new Error(`Unknown option "${argument}". Run with --help for usage.`);
    }
    switch (argument) {
      case "--help":
      case "-h":
        command = "help";
        break;
      case "--version":
      case "-v":
        command = "version";
        break;
      case "--list":
      case "-l":
        command = "list";
        break;
      case "--yes":
      case "-y":
        yes = true;
        break;
      case "--force":
      case "-f":
        force = true;
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--json":
        json = true;
        break;
      case "--web":
        includeWeb = true;
        break;
      case "--no-web":
        includeWeb = false;
        break;
      case "--git":
        initializeGit = true;
        break;
      case "--no-git":
        initializeGit = false;
        break;
      case "--install":
        installDependencies = true;
        break;
      case "--no-install":
        installDependencies = false;
        break;
      case "--link":
        linkProject = true;
        break;
      case "--no-link":
        linkProject = false;
        break;
      case "--deploy":
        deploy = true;
        break;
      default:
        if (argument.startsWith("-")) break;
        if (
          explicitCommand === "doctor" ||
          explicitCommand === "prepare-azure" ||
          explicitCommand === "validate"
        ) {
          if (projectDirectory !== ".") {
            throw new Error(`Only one project directory can be specified for ${explicitCommand}.`);
          }
          projectDirectory = argument;
        } else if (command === "create" || command === "bootstrap") {
          if (destination) throw new Error("Only one destination can be specified.");
          destination = argument;
        } else {
          throw new Error(`The ${command} command does not accept a positional argument.`);
        }
    }
  }

  if (capacity !== "serverless" && capacity !== "autoscale") {
    throw new Error(`Unsupported capacity "${capacity}". Use serverless or autoscale.`);
  }
  if (localMode !== "emulator" && localMode !== "azure") {
    throw new Error(`Unsupported local mode "${localMode}". Use emulator or azure.`);
  }
  if (!["mock", "azure-openai", "openai", "ollama"].includes(provider)) {
    throw new Error(
      `Unsupported provider "${provider}". Use mock, azure-openai, openai, or ollama.`,
    );
  }
  if (authMode !== "local" && authMode !== "entra") {
    throw new Error(`Unsupported authentication mode "${authMode}". Use local or entra.`);
  }
  if (storage !== "in-memory" && storage !== "cosmos") {
    throw new Error(`Unsupported storage backend "${storage}". Use in-memory or cosmos.`);
  }
  if (!(["later", "existing", "provision"] as const).includes(azureSetup as AzureSetup)) {
    throw new Error(
      `Unsupported Azure setup mode "${azureSetup}". Use later, existing, or provision.`,
    );
  }
  for (const [name, value] of [
    ["Azure OpenAI endpoint", azureOpenAIEndpoint],
    ["Cosmos DB endpoint", cosmosEndpoint],
  ] as const) {
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error();
    } catch {
      throw new Error(`${name} must be an HTTPS URL.`);
    }
  }
  if (force && dryRun) {
    throw new Error("--force and --dry-run cannot be used together.");
  }
  const scaffoldingCommand = command === "create" || command === "bootstrap";
  if (!scaffoldingCommand && (force || dryRun)) {
    throw new Error("--force and --dry-run are only valid with create or bootstrap.");
  }
  const scaffoldingFlags = [
    "--template",
    "-t",
    "--capacity",
    "--local",
    "--provider",
    "--auth",
    "--storage",
    "--azure-setup",
    "--azure-location",
    "--azure-openai-endpoint",
    "--azure-openai-deployment",
    "--cosmos-endpoint",
    "--entra-tenant-id",
    "--entra-audience",
    "--entra-client-id",
    "--entra-scope",
    "--web",
    "--no-web",
    "--git",
    "--no-git",
    "--yes",
    "-y",
  ];
  if (
    !scaffoldingCommand &&
    command !== "help" &&
    command !== "version" &&
    scaffoldingFlags.some((flag) => args.includes(flag))
  ) {
    throw new Error("Scaffolding options are only valid with create or bootstrap.");
  }
  const bootstrapOnlyFlags = [
    "--install",
    "--no-install",
    "--link",
    "--no-link",
    "--deploy",
    "--environment",
    "-e",
  ];
  const invalidBootstrapFlags = bootstrapOnlyFlags.filter((flag) =>
    !(
      command === "prepare-azure" &&
      ["--environment", "-e"].includes(flag)
    )
  );
  if (
    command !== "bootstrap" &&
    invalidBootstrapFlags.some((flag) => args.includes(flag))
  ) {
    throw new Error("Install, link, environment, and deploy options are only valid with bootstrap.");
  }
  if (azureSetup === "provision" && command !== "bootstrap") {
    throw new Error('--azure-setup provision is only valid with bootstrap.');
  }
  if (azureSetup === "provision") deploy = true;
  if (deploy && !linkProject) {
    throw new Error("--deploy cannot be combined with --no-link.");
  }
  if (azureSetup === "provision" && provider !== "azure-openai") {
    throw new Error("Azure provisioning requires --provider azure-openai.");
  }
  if (azureSetup === "provision" && yes) {
    const requiredProvisioningValues = [
      ["--azure-location", azureLocation],
      ["--azure-openai-endpoint", azureOpenAIEndpoint],
      ["--azure-openai-deployment", azureOpenAIChatDeployment],
      ["--entra-tenant-id", entraTenantId],
      ["--entra-audience", entraAudience],
      ["--entra-client-id", entraClientId],
      ["--entra-scope", entraScope],
    ] as const;
    const missing = requiredProvisioningValues
      .filter(([, value]) => !value?.trim())
      .map(([flag]) => flag);
    if (missing.length > 0) {
      throw new Error(`Noninteractive Azure provisioning requires: ${missing.join(", ")}.`);
    }
  }
  if (azureSetup === "existing" && provider === "azure-openai" &&
    (!azureOpenAIEndpoint || !azureOpenAIChatDeployment)) {
    throw new Error(
      "Existing Azure OpenAI setup requires --azure-openai-endpoint and --azure-openai-deployment.",
    );
  }
  if (command === "bootstrap" && environmentName && !linkProject) {
    throw new Error("--environment cannot be combined with --no-link.");
  }
  if (command === "list" && projectDirectory !== ".") {
    throw new Error("--project is only valid with doctor, prepare-azure, or validate.");
  }
  if (json && scaffoldingCommand && !yes && !dryRun) {
    throw new Error("JSON scaffolding must be noninteractive. Add --yes or use --dry-run.");
  }

  return {
    command,
    ...(destination ? { destination } : {}),
    projectDirectory,
    template,
    localMode,
    capacity,
    provider: provider as AIProvider,
    authMode: authMode as AuthMode,
    storage: storage as StorageBackend,
    includeWeb,
    initializeGit,
    installDependencies,
    linkProject,
    deploy,
    ...(environmentName ? { environmentName } : {}),
    azureSetup: azureSetup as AzureSetup,
    ...(azureLocation ? { azureLocation } : {}),
    ...(azureOpenAIEndpoint ? { azureOpenAIEndpoint } : {}),
    ...(azureOpenAIChatDeployment ? { azureOpenAIChatDeployment } : {}),
    ...(cosmosEndpoint ? { cosmosEndpoint } : {}),
    ...(entraTenantId ? { entraTenantId } : {}),
    ...(entraAudience ? { entraAudience } : {}),
    ...(entraClientId ? { entraClientId } : {}),
    ...(entraScope ? { entraScope } : {}),
    yes,
    force,
    dryRun,
    json,
  };
}
