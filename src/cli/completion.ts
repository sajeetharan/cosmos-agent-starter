import type { Scenario } from "../generator/manifest.js";

export type CompletionShell = "powershell" | "bash" | "zsh" | "clink";

export interface CompletionCandidate {
  value: string;
  description: string;
}

const commands: CompletionCandidate[] = [
  { value: "wizard", description: "Create a project with guided choices" },
  { value: "create", description: "Create a project" },
  { value: "bootstrap", description: "Scaffold, install, link, and optionally deploy a configured project" },
  { value: "list", description: "List scenario templates" },
  { value: "doctor", description: "Inspect security and configuration" },
  { value: "prepare-azure", description: "Check Azure deployment readiness" },
  { value: "validate", description: "Validate a generated project" },
  { value: "completion", description: "Print shell completion setup" },
];

const flags: CompletionCandidate[] = [
  { value: "--template", description: "Scenario template" },
  { value: "--provider", description: "AI provider" },
  { value: "--auth", description: "Development authentication mode" },
  { value: "--storage", description: "Development storage backend" },
  { value: "--local", description: "Cosmos connection target" },
  { value: "--capacity", description: "Azure Cosmos DB capacity" },
  { value: "--web", description: "Include the React application" },
  { value: "--no-web", description: "Exclude the React application" },
  { value: "--git", description: "Initialize Git" },
  { value: "--no-git", description: "Skip Git initialization" },
  { value: "--install", description: "Install dependencies during bootstrap" },
  { value: "--no-install", description: "Skip dependency installation" },
  { value: "--link", description: "Create local project context" },
  { value: "--no-link", description: "Skip local project context" },
  { value: "--environment", description: "Azure environment name" },
  { value: "--deploy", description: "Provision and deploy with Azure Developer CLI" },
  { value: "--azure-setup", description: "Configure existing Azure resources, provision, or defer" },
  { value: "--azure-location", description: "Azure provisioning region" },
  { value: "--azure-openai-endpoint", description: "Existing Azure OpenAI endpoint" },
  { value: "--azure-openai-deployment", description: "Existing Azure OpenAI chat deployment" },
  { value: "--cosmos-endpoint", description: "Existing Azure Cosmos DB endpoint" },
  { value: "--entra-tenant-id", description: "Microsoft Entra tenant ID" },
  { value: "--entra-audience", description: "Microsoft Entra API audience" },
  { value: "--entra-client-id", description: "Microsoft Entra SPA client ID" },
  { value: "--entra-scope", description: "Microsoft Entra API scope" },
  { value: "--yes", description: "Accept defaults without prompting" },
  { value: "--force", description: "Overlay a non-empty destination" },
  { value: "--dry-run", description: "Print the generation plan" },
  { value: "--json", description: "Emit machine-readable JSON" },
  { value: "--help", description: "Show help" },
  { value: "--version", description: "Show version" },
];

const valuesByFlag: Record<string, CompletionCandidate[]> = {
  "--provider": [
    { value: "mock", description: "Deterministic local development provider" },
    { value: "azure-openai", description: "Azure OpenAI with managed identity or key" },
    { value: "openai", description: "OpenAI-compatible API" },
    { value: "ollama", description: "Local or remote Ollama server" },
  ],
  "--auth": [
    { value: "local", description: "Trusted local development headers" },
    { value: "entra", description: "Microsoft Entra ID authentication" },
  ],
  "--storage": [
    { value: "in-memory", description: "Zero-configuration ephemeral storage" },
    { value: "cosmos", description: "Durable Azure Cosmos DB storage" },
  ],
  "--local": [
    { value: "emulator", description: "Local Cosmos DB emulator" },
    { value: "azure", description: "Azure Cosmos DB account" },
  ],
  "--capacity": [
    { value: "serverless", description: "Pay-per-request serverless capacity" },
    { value: "autoscale", description: "Autoscale provisioned throughput" },
  ],
  "--azure-setup": [
    { value: "later", description: "Configure Azure resources later" },
    { value: "existing", description: "Use existing live Azure resources" },
    { value: "provision", description: "Provision supported infrastructure with azd" },
  ],
  completion: [
    { value: "powershell", description: "PowerShell native argument completer" },
    { value: "bash", description: "Bash completion function" },
    { value: "zsh", description: "Zsh completion function" },
    { value: "clink", description: "Clink completion for Windows Command Prompt" },
  ],
};

function matches(candidates: CompletionCandidate[], prefix: string): CompletionCandidate[] {
  return candidates.filter((candidate) => candidate.value.startsWith(prefix));
}

export function completionCandidates(
  words: string[],
  scenarios: Scenario[],
): CompletionCandidate[] {
  const current = words.at(-1) ?? "";
  const previous = words.at(-2);
  if (previous === "--template") {
    return matches(
      scenarios.map((scenario) => ({ value: scenario.id, description: scenario.description })),
      current,
    );
  }
  if (previous && valuesByFlag[previous]) return matches(valuesByFlag[previous], current);
  if (words[0] === "completion") {
    return matches(valuesByFlag.completion!, words.length === 1 ? "" : current);
  }
  for (const [flag, candidates] of Object.entries(valuesByFlag)) {
    if (current.startsWith(`${flag}=`)) {
      const prefix = current.slice(flag.length + 1);
      return matches(candidates, prefix).map((candidate) => ({
        ...candidate,
        value: `${flag}=${candidate.value}`,
      }));
    }
  }
  if (current === "--template=") {
    return scenarios.map((scenario) => ({
      value: `--template=${scenario.id}`,
      description: scenario.description,
    }));
  }
  if (current.startsWith("-")) return matches(flags, current);
  if (words.length <= 1) return matches(commands, current);
  return [];
}

export function formatCompletionCandidates(candidates: CompletionCandidate[]): string {
  return candidates.map((candidate) => `${candidate.value}\t${candidate.description}`).join("\n");
}

function luaList(candidates: CompletionCandidate[]): string {
  return `{ ${candidates.map((candidate) => JSON.stringify(candidate.value)).join(", ")} }`;
}

function luaDescriptions(candidates: CompletionCandidate[]): string {
  return `{\n${candidates.map((candidate) =>
    `  [${JSON.stringify(candidate.value)}] = ${JSON.stringify(candidate.description)},`
  ).join("\n")}\n}`;
}

function clinkCompletionScript(scenarios: Scenario[]): string {
  const templates = scenarios.map((scenario) => ({
    value: scenario.id,
    description: scenario.description,
  }));
  const flagDescriptions = luaDescriptions(flags);
  const commandDescriptions = luaDescriptions(commands);
  return `local template_values = ${luaList(templates)}
local provider_values = ${luaList(valuesByFlag["--provider"]!)}
local auth_values = ${luaList(valuesByFlag["--auth"]!)}
local storage_values = ${luaList(valuesByFlag["--storage"]!)}
local local_values = ${luaList(valuesByFlag["--local"]!)}
local capacity_values = ${luaList(valuesByFlag["--capacity"]!)}
local azure_setup_values = ${luaList(valuesByFlag["--azure-setup"]!)}
local completion_values = ${luaList(valuesByFlag.completion!)}

local flag_descriptions = ${flagDescriptions}
local command_descriptions = ${commandDescriptions}

local function value_matcher(values)
  return clink.argmatcher():addarg(values):nofiles()
end

local function add_common_flags(matcher)
  return matcher
    :addflags({
      "--template"..value_matcher(template_values),
      "--provider"..value_matcher(provider_values),
      "--auth"..value_matcher(auth_values),
      "--storage"..value_matcher(storage_values),
      "--local"..value_matcher(local_values),
      "--capacity"..value_matcher(capacity_values),
      "--azure-setup"..value_matcher(azure_setup_values),
      "--web", "--no-web", "--git", "--no-git",
      "--install", "--no-install", "--link", "--no-link",
      "--environment", "--deploy", "--azure-location",
      "--azure-openai-endpoint", "--azure-openai-deployment", "--cosmos-endpoint",
      "--entra-tenant-id", "--entra-audience", "--entra-client-id", "--entra-scope",
      "--yes", "--force",
      "--dry-run", "--json", "--help", "--version",
    })
    :adddescriptions(flag_descriptions)
end

local function scaffold_matcher()
  return add_common_flags(clink.argmatcher():addarg(clink.dirmatches))
end

local project_matcher = clink.argmatcher():addarg(clink.dirmatches)
  :addflags("--environment", "--json", "--help")
local completion_matcher = clink.argmatcher():addarg(completion_values):nofiles()
local no_args_matcher = clink.argmatcher():addflags("--json", "--help"):nofiles()

add_common_flags(clink.argmatcher("create-cosmos-agent")
  :addarg({
    "wizard"..scaffold_matcher(),
    "create"..scaffold_matcher(),
    "bootstrap"..scaffold_matcher(),
    "list"..no_args_matcher,
    "doctor"..project_matcher,
    "prepare-azure"..project_matcher,
    "validate"..project_matcher,
    "completion"..completion_matcher,
  })
  :adddescriptions(command_descriptions))`;
}

export function completionScript(shell: CompletionShell, scenarios: Scenario[] = []): string {
  if (shell === "clink") return clinkCompletionScript(scenarios);
  if (shell === "powershell") {
    return `Register-ArgumentCompleter -Native -CommandName create-cosmos-agent -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $arguments = @($commandAst.CommandElements | Select-Object -Skip 1 | ForEach-Object { $_.Extent.Text })
  create-cosmos-agent __complete @arguments | ForEach-Object {
    $parts = $_ -split "\`t", 2
    [System.Management.Automation.CompletionResult]::new($parts[0], $parts[0], "ParameterValue", $parts[1])
  }
}`;
  }
  if (shell === "bash") {
    return `_create_cosmos_agent() {
  local line value current="\${COMP_WORDS[COMP_CWORD]}"
  COMPREPLY=()
  while IFS= read -r line; do
    value="\${line%%$'\\t'*}"
    [[ "$value" == "$current"* ]] && COMPREPLY+=("$value")
  done < <(create-cosmos-agent __complete "\${COMP_WORDS[@]:1}")
}
complete -F _create_cosmos_agent create-cosmos-agent`;
  }
  return `#compdef create-cosmos-agent
_create_cosmos_agent() {
  local -a values
  local line
  while IFS= read -r line; do
    values+=("\${line//$'\\t'/:}")
  done < <(create-cosmos-agent __complete "\${words[@]:1}")
  _describe 'create-cosmos-agent options' values
}
compdef _create_cosmos_agent create-cosmos-agent`;
}
