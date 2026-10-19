import type { CliOptions } from "./arguments.js";
import type { BootstrapResult } from "../generator/bootstrap.js";
import type { Scenario } from "../generator/manifest.js";

export type InstructionShell = "powershell" | "posix";

export interface NextStep {
  kind: "command" | "instruction";
  text: string;
  billable: boolean;
}

export interface NextStepPlan {
  schemaVersion: 1;
  shell: InstructionShell;
  local: NextStep[];
  azure: NextStep[];
}

export function quoteShell(value: string, shell: InstructionShell): string {
  return shell === "powershell"
    ? `'${value.replaceAll("'", "''")}'`
    : `'${value.replaceAll("'", "'\"'\"'")}'`;
}

export function buildNextStepPlan(
  destination: string,
  scenario: Scenario,
  options: CliOptions,
  bootstrap?: BootstrapResult,
  shell: InstructionShell = process.platform === "win32" ? "powershell" : "posix",
): NextStepPlan {
  const command = (text: string, billable = false): NextStep => ({ kind: "command", text, billable });
  const instruction = (text: string): NextStep => ({ kind: "instruction", text, billable: false });
  const local: NextStep[] = [
    command(shell === "powershell"
      ? `Set-Location -LiteralPath ${quoteShell(destination, shell)}`
      : `cd ${quoteShell(destination, shell)}`),
    ...(!bootstrap?.dependenciesInstalled ? [command("npm install")] : []),
  ];
  if (options.provider !== "mock" || options.authMode === "entra" || options.storage === "cosmos") {
    local.push(instruction(
      "Review .env.example and create or update .env for the selected provider, identity, and storage; preserve existing values.",
    ));
  }
  if (options.storage === "cosmos" && options.localMode === "emulator") {
    local.push(instruction(
      "Start Docker with Linux containers. npm run dev starts and initializes the emulator; stop it later with npm run emulator:stop.",
    ));
  }
  local.push(command("npm run dev"));
  if (scenario.capabilities.includes("event-driven")) {
    local.push(instruction(
      'The local worker reads one JSON event per stdin line (EVENT_TRANSPORT=stdin). Paste {"id":"event-00000001","type":"mail.received","source":"gmail","tenantId":"tenant-a","subjectId":"user-a","occurredAt":"2026-09-23T12:00:00.000Z","data":{"objective":"Summarize the new message.","threadId":"mailbox"}} and press Enter. See README.md for Service Bus setup.',
    ));
  } else if (scenario.capabilities.includes("react-web") && options.includeWeb) {
    local.push(instruction("Open http://localhost:5173 after the web server reports ready."));
  } else {
    local.push(instruction(
      "API only: check http://localhost:3000/health (or your configured PORT); see README.md for API usage. No web UI was generated.",
    ));
  }
  if (options.provider === "mock") {
    local.push(instruction("Mock AI responses are deterministic demonstrations, not live model inference."));
  }
  if (options.storage === "in-memory") {
    local.push(instruction("In-memory data is lost when the process stops."));
  }
  local.push(instruction(
    "Inspect setup with npx create-cosmos-agent local-status .; after starting services, add --check-connectivity for bounded readiness probes.",
  ));
  const azure: NextStep[] = [];
  if (bootstrap?.deployed) {
    azure.push(instruction(
      "Azure deployment already completed. Use the endpoints reported by azd, verify the application, and review README.md for cleanup; do not rerun deployment merely to start locally.",
    ));
  } else {
    azure.push(instruction(
      bootstrap?.linked
        ? "Local context is linked, but that does not create or configure an azd cloud environment. Follow README.md to sign in, select/create an environment, and configure production identity, model, and capacity."
        : "No project context was linked. Follow README.md to sign in and select/create and configure an azd environment; local development does not require one.",
    ));
    if (options.azureSetup === "existing") {
      azure.push(instruction(
        "Existing resources were selected. Review their configuration and the infrastructure plan: azd up may still provision application resources.",
      ));
    }
    const environment = bootstrap?.environmentName;
    const environmentFlag = environment ? ` --environment ${quoteShell(environment, shell)}` : "";
    azure.push(
      command(`npx create-cosmos-agent prepare-azure .${environmentFlag}`),
      instruction("Only after readiness passes and you explicitly approve costs, run deployment. azd up may create billable resources."),
      command(`azd up${environmentFlag}`, true),
    );
  }
  return { schemaVersion: 1, shell, local, azure };
}

export function nextSteps(plan: NextStepPlan): string[] {
  return [...plan.local, ...plan.azure].map((step) =>
    step.billable ? `${step.text} (optional; may create billable resources)` : step.text);
}
