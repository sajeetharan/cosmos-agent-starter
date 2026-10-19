import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseArguments } from "./arguments.js";
import { completeInteractiveOptions } from "./prompts.js";
import {
  completionCandidates,
  completionScript,
  formatCompletionCandidates,
  type CompletionShell,
} from "./completion.js";
import {
  formatHelp,
  helpCommands,
  printFindings,
  printAzureReadiness,
  printValidationStage,
  printNextSteps,
  summarizeFindings,
} from "./output.js";
import { brandBanner, statusTag, style } from "./style.js";
import { composeProject, listScenarios, loadScenario } from "../generator/compose.js";
import { runDoctor } from "../generator/doctor.js";
import { validateProjectDetailed } from "../generator/validate.js";
import { bootstrapProject } from "../generator/bootstrap.js";
import { runAzureReadiness } from "../generator/azure-readiness.js";
import { buildNextStepPlan, nextSteps } from "./next-steps.js";
import { CliError, invalidChoice, redactError } from "./errors.js";
import { runPreflight } from "../generator/preflight.js";

const execFileAsync = promisify(execFile);

async function packageVersion(): Promise<string> {
  const packagePath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as { version: string };
  return packageJson.version;
}

function writeJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export async function runCli(args: string[]): Promise<number> {
  let json = args.includes("--json");
  try {
    const helpCommand = helpCommands.find((command) => command === args[0]);
    if (args.includes("--help") || args.includes("-h")) {
      console.log(formatHelp(helpCommand));
      return 0;
    }
    if (args[0] === "completion") {
      const shell = args[1];
      if (shell !== "powershell" && shell !== "bash" && shell !== "zsh" && shell !== "clink") {
        throw invalidChoice("completion shell", shell ?? "", ["powershell", "bash", "zsh", "clink"]);
      }
      console.log(completionScript(shell as CompletionShell, await listScenarios()));
      return 0;
    }
    if (args[0] === "__complete") {
      console.log(formatCompletionCandidates(
        completionCandidates(args.slice(1), await listScenarios()),
      ));
      return 0;
    }
    let options = parseArguments(args);
    json = options.json;
    if (options.command === "help") {
      console.log(formatHelp());
      return 0;
    }
    if (options.command === "version") {
      const version = await packageVersion();
      if (options.json) writeJson({ name: "create-cosmos-agent", version });
      else console.log(version);
      return 0;
    }
    if (options.command === "list") {
      const scenarios = await listScenarios();
      if (options.json) writeJson({ templates: scenarios });
      else {
        for (const scenario of scenarios) {
          console.log(
            `${style.cyan(scenario.id)}\t${style.bold(scenario.name)}\t` +
              `${style.dim(scenario.description)}`,
          );
        }
      }
      return 0;
    }
    if (options.command === "doctor") {
      const project = resolve(options.projectDirectory);
      const findings = await runDoctor(project);
      const summary = summarizeFindings(findings);
      if (options.json) {
        writeJson({
          command: "doctor",
          project,
          status: summary.errors > 0 ? "failed" : "passed",
          summary,
          findings,
        });
      } else {
        printFindings(findings);
      }
      return summary.errors > 0 ? 1 : 0;
    }
    if (options.command === "prepare-azure") {
      const project = resolve(options.projectDirectory);
      const result = await runAzureReadiness(project, options.environmentName);
      if (options.json) {
        writeJson({
          command: "prepare-azure",
          project,
          status: result.ready ? "ready" : "blocked",
          ...result,
        });
      } else {
        printAzureReadiness(result.environmentName, result.findings);
      }
      return result.ready ? 0 : 1;
    }
    if (options.command === "validate") {
      const project = resolve(options.projectDirectory);
      const result = await validateProjectDetailed(project, {
        silent: options.json,
        onStage: printValidationStage,
      });
      if (options.json) {
        writeJson({
          command: "validate",
          project,
          status: result.exitCode === 0 ? "passed" : "failed",
          ...result,
        });
      }
      return result.exitCode;
    }
    if (options.json && !options.destination) {
      throw new Error("JSON scaffolding requires a destination.");
    }
    if (!options.dryRun) options = await completeInteractiveOptions(options);
    if (!options.destination) throw new Error("A project destination is required.");
    const destination = resolve(options.destination);
    const scenario = await loadScenario(options.template);
    if (options.dryRun) {
      const plan = {
        command: options.command,
        status: "planned",
        destination,
        template: { id: scenario.id, name: scenario.name },
        options: {
          localMode: options.localMode,
          capacity: options.capacity,
          provider: options.provider,
          authMode: options.authMode,
          storage: options.storage,
          includeWeb: options.includeWeb,
          initializeGit: options.initializeGit,
          installDependencies: options.installDependencies,
          linkProject: options.linkProject,
          deploy: options.deploy,
          azureSetup: options.azureSetup,
          ...(options.environmentName ? { environmentName: options.environmentName } : {}),
          ...(options.azureLocation ? { azureLocation: options.azureLocation } : {}),
          ...(options.azureOpenAIEndpoint ? {
            azureOpenAIEndpoint: options.azureOpenAIEndpoint,
          } : {}),
          ...(options.azureOpenAIChatDeployment ? {
            azureOpenAIChatDeployment: options.azureOpenAIChatDeployment,
          } : {}),
          ...(options.cosmosEndpoint ? { cosmosEndpoint: options.cosmosEndpoint } : {}),
          force: options.force,
        },
      };
      if (options.json) writeJson(plan);
      else {
        console.log(brandBanner());
        console.log(`\n${style.bold("Generation plan")}`);
        console.log(JSON.stringify(plan, null, 2));
      }
      return 0;
    }
    const preflight = await runPreflight(options);
    if (!options.json) {
      for (const finding of preflight.findings) {
        console.log(`${statusTag(finding.severity)} ${finding.code} ${finding.message}`);
        if (finding.severity !== "info") console.log(`  Next: ${finding.remediation}`);
      }
    }
    if (!preflight.ready) {
      if (options.json) writeJson({
        command: options.command, status: "blocked", destination, preflight,
      });
      return 1;
    }
    if (!options.json) {
      console.log(`\n${statusTag("info")} Generating project files...`);
    }
    const created = await composeProject(options);
    if (!options.json) {
      console.log(`${statusTag("success")} Project files generated`);
    }
    if (options.command === "bootstrap") {
      const result = await bootstrapProject({
        destination: created,
        template: scenario.id,
        installDependencies: options.installDependencies,
        initializeGit: options.initializeGit,
        linkProject: options.linkProject,
        deploy: options.deploy,
        ...(options.environmentName ? { environmentName: options.environmentName } : {}),
        silent: options.json,
        onProgress: ({ status, message }) => {
          console.log(`${statusTag(status === "completed" ? "success" : "info")} ${message}`);
        },
        ...(options.azureSetup === "provision" ? {
          azureProvisioning: {
            location: options.azureLocation!,
            provider: "azure-openai" as const,
            azureOpenAIEndpoint: options.azureOpenAIEndpoint!,
            azureOpenAIChatDeployment: options.azureOpenAIChatDeployment!,
            entraTenantId: options.entraTenantId!,
            entraAudience: options.entraAudience!,
            entraClientId: options.entraClientId!,
            entraScope: options.entraScope!,
          },
        } : {}),
      });
      const nextStepPlan = buildNextStepPlan(created, scenario, options, result);
      if (options.json) {
        writeJson({
          command: "bootstrap",
          status: result.deployed ? "deployed" : "bootstrapped",
          ...result,
          preflight,
          nextSteps: nextSteps(nextStepPlan),
          nextStepPlan,
        });
      } else {
        console.log(`\n${brandBanner()}`);
        console.log(`\n${statusTag("success")} ${style.bold("Bootstrap complete")}`);
        console.log(`  ${style.dim(created)}`);
        console.log(
          `  ${result.dependenciesInstalled ? statusTag("success") : statusTag("info")} ` +
            `Dependencies ${result.dependenciesInstalled ? "installed" : "skipped"}`,
        );
        console.log(
          `  ${result.gitInitialized ? statusTag("success") : statusTag("info")} ` +
            `Git ${result.gitInitialized ? "initialized" : "skipped"}`,
        );
        console.log(
          `  ${result.linked ? statusTag("success") : statusTag("info")} Project context ` +
            `${result.linked ? `linked to ${result.environmentName}` : "skipped"}`,
        );
        console.log(
          `  ${result.deployed ? statusTag("success") : statusTag("info")} Azure deployment ` +
            `${result.deployed ? "completed" : "not requested"}`,
        );
        printNextSteps(nextStepPlan);
      }
      return 0;
    }
    if (options.initializeGit) {
      if (!options.json) {
        console.log(`${statusTag("info")} Initializing Git repository...`);
      }
      await execFileAsync("git", ["init"], { cwd: created });
      if (!options.json) {
        console.log(`${statusTag("success")} Git repository initialized`);
      }
    }
    const nextStepPlan = buildNextStepPlan(created, scenario, options);
    if (options.json) {
      writeJson({
        command: "create",
        status: "created",
        destination: created,
        template: scenario.id,
        preflight,
        nextSteps: nextSteps(nextStepPlan),
        nextStepPlan,
      });
    } else {
      console.log(`\n${brandBanner()}`);
      console.log(`\n${statusTag("success")} Created Cosmos Agent Starter`);
      console.log(`  ${style.dim(created)}`);
      printNextSteps(nextStepPlan);
    }
    return 0;
  } catch (error) {
    const message = redactError(error instanceof Error ? error.message : String(error));
    const code = error instanceof CliError ? error.code : "CLI_ERROR";
    const suggestions = error instanceof CliError && error.suggestions.length
      ? error.suggestions
      : [`Run create-cosmos-agent ${helpCommands.find((command) => command === args[0]) ?? ""} --help for usage.`];
    if (json) console.error(JSON.stringify({ status: "error", message, code, suggestions }));
    else console.error(
      `${statusTag("error")} ${code} ${style.bold(message)}\n` +
        suggestions.map((suggestion) => style.dim(suggestion)).join("\n"),
    );
    return 1;
  }
}
