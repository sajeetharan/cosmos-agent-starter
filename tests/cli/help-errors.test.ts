import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../../src/cli/run.js";
import { parseArguments } from "../../src/cli/arguments.js";
import { formatHelp, helpCommands } from "../../src/cli/output.js";
import { redactError, suggest } from "../../src/cli/errors.js";

afterEach(() => vi.restoreAllMocks());

describe("focused help and actionable errors", () => {
  it.each(helpCommands)("shows focused %s help without setup", async (command) => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(await runCli([command, "--help"])).toBe(0);
    expect(log).toHaveBeenCalledTimes(1);
    const output = String(log.mock.calls[0]?.[0]);
    expect(output).toContain(`Usage:\n  create-cosmos-agent ${command}`);
    expect(output).toContain("Example:");
    if (!["create", "bootstrap", "wizard"].includes(command)) {
      expect(output).not.toContain("--provider");
    }
    expect(output).not.toContain("Commands:");
  });

  it("distinguishes create and bootstrap options", () => {
    expect(formatHelp("create")).toContain("Scaffold files only");
    expect(formatHelp("create")).not.toContain("--no-install");
    expect(formatHelp("bootstrap")).toContain("--no-install");
    expect(formatHelp("bootstrap")).toContain("billable");
  });

  it.each([
    [["demo", "--templat", "--json"], "CLI_UNKNOWN_OPTION", "--template"],
    [["demo", "--provider", "olama", "--json", "-y"], "CLI_INVALID_VALUE", "ollama"],
    [["demo", "--template", "chat-agnt-ts", "--json", "-y"], "CLI_UNKNOWN_TEMPLATE", "chat-agent-ts"],
    [["demo", "--template", "--json"], "CLI_MISSING_VALUE", "--template"],
    [["doctro", "demo", "--json"], "CLI_POSITIONAL_ARGUMENT", "doctor"],
    [["completion", "powrshell", "--json"], "CLI_INVALID_VALUE", "powershell"],
  ] as const)("returns clean structured failure for %j", async (args, code, suggestion) => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await runCli([...args])).toBe(1);
    expect(log).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    const result = JSON.parse(String(error.mock.calls[0]?.[0]));
    expect(Object.keys(result).sort()).toEqual(["code", "message", "status", "suggestions"]);
    expect(result).toMatchObject({ status: "error", code });
    expect(result.suggestions.join(" ")).toContain(suggestion);
  });

  it("preserves directory names resembling commands", () => {
    expect(parseArguments(["doctro", "-y"]).destination).toBe("doctro");
    expect(parseArguments(["create", "doctor", "-y"]).destination).toBe("doctor");
  });

  it("does not disclose invalid enum values or secret assignments", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await runCli(["demo", "--provider", "private-value", "-y", "--json"])).toBe(1);
    expect(String(error.mock.calls[0]?.[0])).not.toContain("private-value");
    const redacted = redactError("token=abc API_KEY=def AccountKey=ghi; Bearer xyz https://user:pwd@example.com");
    for (const secret of ["abc", "def", "ghi", "xyz", "user:pwd"]) expect(redacted).not.toContain(secret);
    expect(redactError("x".repeat(3000))).toHaveLength(2000);
    expect(suggest("unrelated-value", ["mock"])).toEqual([]);
  });
});
