import { describe, expect, it } from "vitest";
import {
  badge,
  box,
  brandBanner,
  statusTag,
  stripAnsi,
  style,
  symbols,
  terminalColorsEnabled,
  visibleLength,
} from "../../src/cli/style.js";

describe("CLI styling", () => {
  it("uses color only when the terminal supports it", () => {
    expect(terminalColorsEnabled({
      isTTY: true,
      environment: { TERM: "xterm-256color" },
    })).toBe(true);
    expect(terminalColorsEnabled({
      isTTY: false,
      environment: {},
    })).toBe(false);
    expect(terminalColorsEnabled({
      isTTY: true,
      environment: { NO_COLOR: "" },
    })).toBe(false);
    expect(terminalColorsEnabled({
      isTTY: false,
      environment: { FORCE_COLOR: "1" },
    })).toBe(true);
  });

  it("keeps plain output readable and emits ANSI styling when enabled", () => {
    expect(style.green("ready", false)).toBe("ready");
    expect(style.green("ready", true)).toContain("\u001B[32m");
    expect(statusTag("error", false)).toBe("[error]");
    expect(brandBanner(false)).toContain("local first -> Azure ready");
  });

  it("provides symbols, badges, and box formatting for CLI UI", () => {
    expect(symbols.check).toBe("✔");
    expect(symbols.pointer).toBe("❯");
    expect(badge("default", "default", false)).toBe("[default]");
    expect(badge("recommended", "recommended", false)).toBe("[recommended]");

    const renderedBox = box(["Line 1", "Line 2"], "My Box", (s) => s, false);
    expect(renderedBox).toContain("╭─ My Box");
    expect(renderedBox).toContain("Line 1");
    expect(renderedBox).toContain("Line 2");
    expect(renderedBox).toContain("╰");

    expect(stripAnsi(style.cyan("text", true))).toBe("text");
    expect(visibleLength(style.bold("bold", true))).toBe(4);
  });
});
