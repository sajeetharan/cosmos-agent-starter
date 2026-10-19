import { afterEach, describe, expect, it, vi } from "vitest";
import { parseArguments } from "../../src/cli/arguments.js";
import { completeInteractiveOptions, runWizard } from "../../src/cli/prompts.js";

afterEach(() => vi.restoreAllMocks());

function terminal(answers: string[]) {
  const output: string[] = [];
  return {
    output,
    write: (value: string) => output.push(value),
    close: vi.fn(),
    question: vi.fn(async (prompt: string) => {
      output.push(prompt);
      if (!answers.length) throw new Error("Unexpected question: " + prompt);
      return answers.shift()!;
    }),
  };
}

describe("wizard navigation", () => {
  it("skips explicit flags and irrelevant capacity/web questions", async () => {
    const options = parseArguments(["wizard", "agent", "--template", "event-agent-ts", "--provider", "mock", "--storage", "in-memory", "--no-git"]);
    const io = terminal(["1"]);
    expect(await runWizard(options, io)).toMatchObject(options);
    expect(io.question).toHaveBeenCalledTimes(1);
    expect(io.output.join("\n")).not.toContain("Azure capacity");
    expect(io.output.join("\n")).not.toContain("Include React");
    expect(io.output.join("\n")).not.toContain("Development identity");
  });

  it("retries invalid input and preserves prior answers on back", async () => {
    const options = parseArguments(["wizard", "agent", "--template", "event-agent-ts", "--storage", "in-memory"]);
    const io = terminal(["1oops", "openai", "back", "ollama", "no", "confirm"]);
    const result = await runWizard(options, io);
    expect(result.provider).toBe("ollama");
    expect(result.initializeGit).toBe(false);
    expect(io.output.join("\n")).toContain("Choose a listed");
  });

  it("allows explicitly supplied flags to be overridden through final edit", async () => {
    const options = parseArguments(["wizard", "agent", "--template", "event-agent-ts", "--provider", "mock", "--storage", "in-memory", "--no-git"]);
    const io = terminal(["edit", "3", "ollama", "confirm"]);
    expect((await runWizard(options, io)).provider).toBe("ollama");
  });

  it("updates visible totals for conditional storage questions", async () => {
    const options = parseArguments(["wizard", "agent", "--template", "event-agent-ts", "--provider", "mock", "--no-git"]);
    const io = terminal(["cosmos", "emulator", "autoscale", "confirm"]);
    const result = await runWizard(options, io);
    expect(result).toMatchObject({ storage: "cosmos", capacity: "autoscale" });
    expect(io.output).toContain("Step 1 of 1: Development storage (in-memory resets on restart)");
    expect(io.output).toContain("Step 2 of 3: Cosmos connection");
  });

  it("retries invalid required Azure values in place", async () => {
    const options = parseArguments(["wizard", "agent", "--template", "event-agent-ts", "--provider", "azure-openai", "--storage", "in-memory", "--no-git"]);
    const io = terminal(["existing", "http://bad", "https://example.openai.azure.com", "", "chat", "confirm"]);
    expect((await runWizard(options, io)).azureOpenAIChatDeployment).toBe("chat");
    expect(io.output.join("\n")).toContain("must be an HTTPS URL");
    expect(io.output.join("\n")).toContain("is required");
  });

  it("requires separate consent for explicit deployment", async () => {
    const options = parseArguments(["bootstrap", "agent", "--template", "event-agent-ts", "--provider", "mock", "--storage", "in-memory", "--no-git", "--no-install", "--link", "--environment", "dev", "--deploy"]);
    const io = terminal(["serverless", "confirm", ""]);
    await expect(runWizard(options, io)).rejects.toMatchObject({ code: "CLI_CANCELLED" });
    expect(io.output.join("\n")).toContain("Billable deployment");
  });

  it("cancels from a question or final confirmation", async () => {
    await expect(runWizard(parseArguments(["wizard", "agent"]), terminal(["cancel"])))
      .rejects.toMatchObject({ code: "CLI_CANCELLED" });
    const options = parseArguments(["wizard", "agent", "--template", "event-agent-ts", "--provider", "mock", "--storage", "in-memory", "--no-git"]);
    await expect(runWizard(options, terminal(["cancel"]))).rejects.toMatchObject({ code: "CLI_CANCELLED" });
  });

  it("rejects non-TTY setup promptly but honors explicit default consent", async () => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      await expect(completeInteractiveOptions(parseArguments(["agent"])))
        .rejects.toMatchObject({ code: "CLI_NON_INTERACTIVE" });
    }
    const options = parseArguments(["agent", "-y"]);
    expect(await completeInteractiveOptions(options)).toBe(options);
    expect(options.force).toBe(false);
  });
});
