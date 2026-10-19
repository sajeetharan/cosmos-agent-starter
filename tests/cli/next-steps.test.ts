import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseArguments } from "../../src/cli/arguments.js";
import { buildNextStepPlan, nextSteps, quoteShell } from "../../src/cli/next-steps.js";
import { printNextSteps } from "../../src/cli/output.js";
import { runCli } from "../../src/cli/run.js";
import { listScenarios, loadScenario } from "../../src/generator/compose.js";

afterEach(() => vi.restoreAllMocks());

describe("scenario-aware next steps", () => {
  it("quotes literal paths for PowerShell and POSIX shells", () => {
    expect(quoteShell("C:\\my agent's [$HOME]", "powershell")).toBe("'C:\\my agent''s [$HOME]'");
    expect(quoteShell("/tmp/my agent's $HOME", "posix")).toBe("'/tmp/my agent'\"'\"'s $HOME'");
  });

  it("covers every scenario and web option", async () => {
    for (const scenario of await listScenarios()) {
      for (const includeWeb of [false, true]) {
        const options = { ...parseArguments(["agent", "-y"]), includeWeb };
        const plan = buildNextStepPlan("my agent", scenario, options, undefined, "powershell");
        expect(plan.local[0]).toEqual({
          kind: "command", text: "Set-Location -LiteralPath 'my agent'", billable: false,
        });
        expect(plan.local.filter((step) => step.text === "npm install")).toHaveLength(1);
        expect(plan.local.filter((step) => step.text === "npm run dev")).toHaveLength(1);
        const local = plan.local.map((step) => step.text).join("\n");
        expect(local.includes("http://localhost:5173")).toBe(
          scenario.capabilities.includes("react-web") && includeWeb,
        );
        if (scenario.capabilities.includes("event-driven")) {
          expect(local).toContain("stdin");
          expect(local).toContain('"type":"mail.received"');
          expect(local).not.toContain("http://localhost");
        } else if (!scenario.capabilities.includes("react-web") || !includeWeb) {
          expect(local).toContain("http://localhost:3000/health");
        }
      }
    }
  });

  it("uses actual bootstrap outcomes and labels optional billable work", async () => {
    const scenario = await loadScenario("chat-agent-ts");
    const options = parseArguments(["bootstrap", "agent", "-y", "--no-link"]);
    for (const dependenciesInstalled of [false, true]) {
      for (const linked of [false, true]) {
        for (const deployed of [false, true]) {
          const plan = buildNextStepPlan("agent", scenario, options, {
            destination: "agent", dependenciesInstalled, linked, deployed,
            gitInitialized: false, ...(linked ? { environmentName: "my-dev" } : {}),
          }, "posix");
          expect(plan.local.some((step) => step.text === "npm install")).toBe(!dependenciesInstalled);
          expect(plan.azure.some((step) => step.billable)).toBe(!deployed);
          if (deployed) {
            expect(plan.azure).toHaveLength(1);
            expect(plan.azure[0]?.text).toContain("already completed");
          } else {
            expect(plan.azure[0]?.text).toContain(linked ? "context is linked" : "No project context");
            expect(plan.azure.at(-1)).toEqual({
              kind: "command", text: `azd up${linked ? " --environment 'my-dev'" : ""}`, billable: true,
            });
          }
          expect(nextSteps(plan).some((text) => text.includes("optional; may create billable"))).toBe(!deployed);
        }
      }
    }
  });

  it("explains existing resources and emulator/non-mock configuration", async () => {
    const scenario = await loadScenario("chat-agent-ts");
    const options = parseArguments([
      "agent", "-y", "--storage", "cosmos", "--provider", "ollama", "--azure-setup", "existing",
    ]);
    const plan = buildNextStepPlan("agent", scenario, options);
    expect(plan.local.map((step) => step.text).join("\n")).toMatch(/\.env.*Docker/s);
    expect(plan.azure.map((step) => step.text).join("\n")).toContain("may still provision");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    printNextSteps(plan);
    const human = log.mock.calls.flat().join("\n");
    for (const step of [...plan.local, ...plan.azure]) expect(human).toContain(step.text);
  });

  it.each(["create", "bootstrap"])("emits the exact shared JSON shape for %s", async (command) => {
    const parent = await mkdtemp(join(tmpdir(), "cosmos-next-"));
    try {
      const destination = join(parent, "my agent");
      const args = [command, destination, "-y", "--json", "--no-git", "--no-web"];
      if (command === "bootstrap") args.push("--no-install", "--no-link");
      const options = parseArguments(args);
      const scenario = await loadScenario(options.template);
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      expect(await runCli(args)).toBe(0);
      expect(log).toHaveBeenCalledTimes(1);
      const result = JSON.parse(String(log.mock.calls[0]?.[0]));
      const expectedPlan = buildNextStepPlan(destination, scenario, options,
        command === "bootstrap" ? {
          destination, dependenciesInstalled: false, gitInitialized: false, linked: false, deployed: false,
        } : undefined);
      expect(result.nextStepPlan).toEqual(expectedPlan);
      expect(result.nextSteps).toEqual(nextSteps(expectedPlan));
      expect(Object.keys(result).sort()).toEqual(command === "create"
        ? ["command", "destination", "nextStepPlan", "nextSteps", "preflight", "status", "template"]
        : ["command", "dependenciesInstalled", "deployed", "destination", "gitInitialized", "linked", "nextStepPlan", "nextSteps", "preflight", "status"]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
