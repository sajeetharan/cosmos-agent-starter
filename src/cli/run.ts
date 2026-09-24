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
  nextSteps,
  printFindings,
  printAzureReadiness,
  printNextSteps,
  summarizeFindings,
} from "./output.js";
import { brandBanner, statusTag, style } from "./style.js";
import { composeProject, listScenarios, loadScenario } from "../generator/compose.js";
import { runDoctor } from "../generator/doctor.js";
import { validateProject } from "../generator/validate.js";
import { bootstrapProject } from "../generator/bootstrap.js";
import { runAzureReadiness } from "../generator/azure-readiness.js";

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
    if (args[0] === "completion") {
      const shell = args[1];
      if (shell !== "powershell" && shell !== "bash" && shell !== "zsh") {
        throw new Error("The completion command requires powershell, bash, or zsh.");
      }
      console.log(completionScript(shell as CompletionShell));
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
      const exitCode = await validateProject(project, { silent: options.json });
      if (options.json) {
        writeJson({
          command: "validate",
          project,
          status: exitCode === 0 ? "passed" : "failed",
          exitCode,
        });
      }
      return exitCode;
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
          ...(options.environmentName ? { environmentName: options.environmentName } : {}),
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
    const created = await composeProject(options);
    const includeWeb = scenario.capabilities.includes("react-web") && options.includeWeb;
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
      });
      if (options.json) {
        writeJson({
          command: "bootstrap",
          status: result.deployed ? "deployed" : "bootstrapped",
          ...result,
          nextSteps: [
            "npm run dev",
            ...(!result.deployed && result.environmentName
              ? [
                  `npx create-cosmos-agent prepare-azure . --environment ${result.environmentName}`,
                  `azd up --environment ${result.environmentName}`,
                ]
              : []),
          ],
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
        console.log(`\n${style.bold("Next step")} ${style.cyan("npm run dev")}`);
        if (!result.deployed && result.environmentName) {
          console.log(`\n${style.bold("When you are ready for Azure")}`);
          console.log(
            `  ${style.blue(">")} npx create-cosmos-agent prepare-azure . ` +
              `--environment ${result.environmentName}`,
          );
          console.log(
            `  ${style.blue(">")} azd up --environment ${result.environmentName}`,
          );
        }
      }
      return 0;
    }
    if (options.initializeGit) await execFileAsync("git", ["init"], { cwd: created });
    if (options.json) {
      writeJson({
        command: "create",
        status: "created",
        destination: created,
        template: scenario.id,
        nextSteps: nextSteps(created, includeWeb),
      });
    } else {
      printNextSteps(created, includeWeb);
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) console.error(JSON.stringify({ status: "error", message }));
    else console.error(
      `${statusTag("error")} ${style.bold(message)}\n` +
        `${style.dim("Run with --help for usage.")}`,
    );
    return 1;
  }
}
