import type { DoctorFinding } from "../generator/doctor.js";
import type { AzureReadinessFinding } from "../generator/azure-readiness.js";
import { brandBanner, statusTag, style } from "./style.js";

export const helpText = `create-cosmos-agent - scaffold secure Azure Cosmos DB agents

Usage:
  create-cosmos-agent [create] <destination> [options]
  create-cosmos-agent bootstrap <destination> [options]
  create-cosmos-agent list [--json]
  create-cosmos-agent doctor [project] [--json]
  create-cosmos-agent prepare-azure [project] [--environment <name>] [--json]
  create-cosmos-agent validate [project] [--json]
  create-cosmos-agent completion <powershell|bash|zsh>

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
  create-cosmos-agent doctor ./my-agent
  create-cosmos-agent prepare-azure ./my-agent --environment my-agent-dev
  create-cosmos-agent validate -C ./my-agent --json`;

export function formatHelp(): string {
  return `${brandBanner()}\n\n${style.bold("Create secure, production-oriented AI agents.", undefined)}\n\n${helpText}`;
}

export function nextSteps(destination: string, includeWeb = true): string[] {
  return [
    `cd "${destination}"`,
    "npm install",
    "npm run dev",
    ...(includeWeb ? ["Open http://localhost:5173"] : []),
    "npx create-cosmos-agent prepare-azure .",
    "azd up",
  ];
}

export function printNextSteps(destination: string, includeWeb = true): void {
  console.log(`\n${brandBanner()}`);
  console.log(`\n${statusTag("success")} Created Cosmos Agent Starter`);
  console.log(`  ${style.dim(destination)}`);
  console.log(`\n${style.bold("Next steps")}`);
  const steps = nextSteps(destination, includeWeb);
  for (const step of steps.slice(0, includeWeb ? 4 : 3)) {
    console.log(`  ${style.cyan(">")} ${step}`);
  }
  console.log(`\n${style.bold("When you are ready for Azure")}`);
  console.log(`  ${style.blue(">")} ${steps.at(-2)}`);
  console.log(`  ${style.blue(">")} ${steps.at(-1)}`);
}

export function summarizeFindings(findings: DoctorFinding[]) {
  return {
    errors: findings.filter((finding) => finding.severity === "error").length,
    warnings: findings.filter((finding) => finding.severity === "warning").length,
    information: findings.filter((finding) => finding.severity === "info").length,
  };
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
