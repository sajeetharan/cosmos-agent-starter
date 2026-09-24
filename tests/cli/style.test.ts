import { describe, expect, it } from "vitest";
import {
  brandBanner,
  statusTag,
  style,
  terminalColorsEnabled,
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
});
