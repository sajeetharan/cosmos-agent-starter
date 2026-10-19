import type { DoctorFinding } from "../generator/doctor.js";
import type { AzureReadinessFinding } from "../generator/azure-readiness.js";
import type { ValidationStage } from "../generator/validate.js";
import { brandBanner, statusTag, style } from "./style.js";
import type { NextStepPlan } from "./next-steps.js";

export const helpText = `create-cosmos-agent - scaffold secure Azure Cosmos DB agents

Usage:
  create-cosmos-agent [create] <destination> [options]
  create-cosmos-agent bootstrap <destination> [options]
  create-cosmos-agent list [--json]
  create-cosmos-agent doctor [project] [--json]
  create-cosmos-agent prepare-azure [project] [--environment <name>] [--json]
  create-cosmos-agent validate [project] [--json]
  create-cosmos-agent completion <powershell|bash|zsh|clink>

Commands:
  create [destination]  Create a project (default command)
  bootstrap [destination] Scaffold, install, link, and optionally deploy a configured project
  wizard [destination]  Create with a descriptive guided setup
  list                  List available templates
  doctor [project]      Report security and configuration findings
  prepare-azure [project] Check azd, Entra, model, RBAC, and capacity readiness
  validate [project]    Run generated-file, type, build, test, and Bicep checks
  completion <shell>    Print a dynamic shell completion script

Create options:
  -t, --template <id>        Scenario template (default: chat-agent-ts)
      --provider <provider>   mock | azure-openai | openai | ollama
      --auth <mode>           local | entra (default: local)
      --storage <backend>     in-memory | cosmos (default: in-memory)
      --local <mode>         emulator | azure (default: emulator)
      --capacity <model>     serverless | autoscale (default: serverless)
      --web / --no-web       Include or exclude the example web interface
      --git / --no-git       Initialize or skip a Git repository
      --install / --no-install Install or skip dependencies during bootstrap
      --link / --no-link     Create or skip local project context
  -e, --environment <name>   Azure environment name for bootstrap
      --deploy               Provision and deploy with azd (may create billable resources)
        --azure-setup <mode>   later | existing | provision
        --azure-location <id>  Azure region used when provisioning
        --azure-openai-endpoint <url> Existing Azure OpenAI endpoint
        --azure-openai-deployment <name> Existing chat model deployment
        --cosmos-endpoint <url> Existing Azure Cosmos DB endpoint
        --entra-tenant-id <id> Microsoft Entra tenant ID for deployment
        --entra-audience <uri> Microsoft Entra API audience
        --entra-client-id <id> Microsoft Entra SPA client ID
        --entra-scope <scope>  Microsoft Entra API scope
  -y, --yes                  Accept prompt defaults; does not allow overwrites
  -f, --force                Allow generated files to overwrite a non-empty destination
      --dry-run              Print the resolved generation plan without writing files

General options:
  -C, --project <path>       Project directory for doctor, prepare-azure, or validate
      --json                 Emit machine-readable JSON
  -l, --list                 Alias for the list command
  -h, --help                 Show help
  -v, --version              Show version

Examples:
  create-cosmos-agent wizard my-agent
  create-cosmos-agent bootstrap my-agent --yes
  create-cosmos-agent bootstrap my-agent --yes --deploy
  create-cosmos-agent my-agent -t rag-agent-ts --capacity autoscale -y
  create-cosmos-agent create my-agent --provider azure-openai --auth entra -y
  create-cosmos-agent my-agent --dry-run --json
  create-cosmos-agent completion powershell
  create-cosmos-agent completion clink
  create-cosmos-agent doctor ./my-agent
  create-cosmos-agent prepare-azure ./my-agent --environment my-agent-dev
  create-cosmos-agent validate -C ./my-agent --json`;

export const helpCommands = ["create", "bootstrap", "wizard", "list", "doctor", "prepare-azure", "validate", "completion"] as const;
export type HelpCommand = typeof helpCommands[number];

export function formatHelp(command?: HelpCommand): string {
  if (!command) return `${brandBanner()}\n\n${style.bold("Create secure, production-oriented AI agents.", undefined)}\n\n${helpText}`;
  const creation = command === "create" || command === "bootstrap" || command === "wizard";
  const descriptions: Record<HelpCommand, string> = {
    create: "Scaffold files only; install dependencies yourself. Use bootstrap to install and link too.",
    bootstrap: "Scaffold, install dependencies, initialize Git, and link local context. Deployment requires --deploy and may be billable.",
    wizard: "Guided create with descriptive prompts. Unlike bootstrap, it does not install dependencies.",
    list: "List supported scenario templates.",
    doctor: "Inspect generated-project security and configuration; does not provision resources.",
    "prepare-azure": "Inspect Azure deployment readiness; does not deploy or grant permissions.",
    validate: "Run generated-file, npm quality, and optional Bicep checks.",
    completion: "Print a shell completion script; install it using your shell's instructions.",
  };
  const usages: Record<HelpCommand, string> = {
    create: "create <destination> [options]",
    bootstrap: "bootstrap <destination> [options]",
    wizard: "wizard [destination] [options]",
    list: "list [--json]",
    doctor: "doctor [project] [-C <path>] [--json]",
    "prepare-azure": "prepare-azure [project] [--environment <name>] [--json]",
    validate: "validate [project] [-C <path>] [--json]",
    completion: "completion <powershell|bash|zsh|clink>",
  };
  const examples: Record<HelpCommand, string> = {
    create: "create my-agent --template chat-agent-ts --yes",
    bootstrap: "bootstrap my-agent --yes --no-install",
    wizard: "wizard my-agent",
    list: "list --json",
    doctor: "doctor -C \"my agent\" --json",
    "prepare-azure": "prepare-azure my-agent --environment dev",
    validate: "validate my-agent --json",
    completion: "completion powershell",
  };
  const creationOptions = helpText.split("Create options:\n")[1]!.split("\nGeneral options:")[0]!;
  const filteredOptions = creationOptions.split("\n").filter((line) =>
    command === "bootstrap" ||
    !/--install|--link|--environment|--deploy|--azure-location|--entra-|--azure-setup/.test(line));
  return [
    `create-cosmos-agent ${command}`, descriptions[command],
    `Usage:\n  create-cosmos-agent ${usages[command]}`,
    ...(creation ? [`Options:\n${filteredOptions.join("\n")}`,
      command !== "bootstrap" ? "  --azure-setup later|existing (provision requires bootstrap)" : "",
      "  --yes accepts defaults, not overwrites or implicit billable deployment.",
      "  Use create <destination> explicitly for command-like directory names."] : []),
    ...(command === "doctor" || command === "validate" || command === "prepare-azure"
      ? ["Options:\n  -C, --project <path>  Project directory\n  --json  Machine-readable output",
        ...(command === "prepare-azure" ? ["  -e, --environment <name>  Azure environment"] : [])] : []),
    "  -h, --help  Show this command's help",
    `Example:\n  create-cosmos-agent ${examples[command]}`,
  ].filter(Boolean).join("\n\n");
}

export function printNextSteps(plan: NextStepPlan): void {
  console.log(`\n${style.bold(`Next steps (${plan.shell === "powershell" ? "PowerShell" : "Bash/Zsh"})`)}`);
  for (const step of plan.local) {
    console.log(`  ${step.kind === "command" ? "> " : ""}${step.text}`);
  }
  console.log(`\n${style.bold("Optional Azure workflow")}`);
  for (const step of plan.azure) {
    console.log(`  ${step.kind === "command" ? "> " : ""}${step.text}` +
      (step.billable ? " (may create billable resources)" : ""));
  }
}

export function summarizeFindings(findings: DoctorFinding[]) {
  return {
    errors: findings.filter((finding) => finding.severity === "error").length,
    warnings: findings.filter((finding) => finding.severity === "warning").length,
    information: findings.filter((finding) => finding.severity === "info").length,
  };
}

export function printValidationStage(stage: ValidationStage): void {
  const severity = stage.status === "passed" ? "success"
    : stage.status === "failed" || (stage.required && stage.status === "unavailable")
      ? "error" : stage.status === "unavailable" ? "warning" : "info";
  console.log(`${statusTag(severity)} ${stage.code}: ${stage.status} (${Math.round(stage.durationMs)} ms)`);
  if (stage.reason) console.log(`  ${stage.reason}`);
  if (stage.summary) console.log(`  ${stage.summary}`);
  if (stage.command && stage.status !== "passed") console.log(`  From the project directory: ${stage.command}`);
}

export function printFindings(findings: DoctorFinding[]): void {
  for (const finding of findings) {
    const severity = finding.severity === "warning" ? "warning" : finding.severity;
    console.log(
      `${statusTag(severity)} ${style.bold(finding.code)} ${finding.message}\n` +
        `  ${style.dim("Evidence:")} ${finding.evidence}\n` +
        `  ${style.dim("Next:")} ${finding.remediation}`,
    );
  }
  const counts = summarizeFindings(findings);
  console.log(
    `\n${style.bold("Doctor")} ${counts.errors} error(s), ${counts.warnings} warning(s), ` +
      `${counts.information} info`,
  );
}

export function printAzureReadiness(
  environmentName: string,
  findings: AzureReadinessFinding[],
): void {
  console.log(
    `${style.bold("Azure readiness")} ${style.dim(`environment "${environmentName}"`)}`,
  );
  for (const item of findings) {
    const severity = item.severity === "warning" ? "warning" : item.severity;
    console.log(
      `${statusTag(severity)} ${style.bold(item.code)} ${item.message}\n` +
        `  ${style.dim("Next:")} ${item.remediation}`,
    );
  }
  const errors = findings.filter((item) => item.severity === "error").length;
  const warnings = findings.filter((item) => item.severity === "warning").length;
  console.log(
    `\n${errors === 0 ? statusTag("success") : statusTag("error")} ` +
      `${style.bold(`Azure readiness: ${errors === 0 ? "ready" : "not ready"}`)} ` +
      `(${errors} error(s), ${warnings} warning(s))`,
  );
}
