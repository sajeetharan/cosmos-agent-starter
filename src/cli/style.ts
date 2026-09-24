import { stdout } from "node:process";

const escape = "\u001B[";

export interface ColorSupport {
  isTTY?: boolean;
  environment?: NodeJS.ProcessEnv;
}

export function terminalColorsEnabled({
  isTTY = stdout.isTTY,
  environment = process.env,
}: ColorSupport = {}): boolean {
  if ("NO_COLOR" in environment) return false;
  if (environment.FORCE_COLOR === "0") return false;
  if (environment.FORCE_COLOR !== undefined) return true;
  return Boolean(isTTY) && environment.TERM !== "dumb";
}

function color(code: number, value: string, enabled = terminalColorsEnabled()): string {
  return enabled ? `${escape}${code}m${value}${escape}0m` : value;
}

export const style = {
  bold: (value: string, enabled?: boolean) => color(1, value, enabled),
  dim: (value: string, enabled?: boolean) => color(2, value, enabled),
  cyan: (value: string, enabled?: boolean) => color(36, value, enabled),
  blue: (value: string, enabled?: boolean) => color(34, value, enabled),
  green: (value: string, enabled?: boolean) => color(32, value, enabled),
  yellow: (value: string, enabled?: boolean) => color(33, value, enabled),
  red: (value: string, enabled?: boolean) => color(31, value, enabled),
};

export function brandBanner(enabled = terminalColorsEnabled()): string {
  const orbit = [
    "       *       .       *",
    "          .-\"\"\"-.",
    "        .'  .-.  '.",
    "       /   (   )   \\",
    "       \\    `-'    /",
    "        '._     _.'",
    "           '---'",
  ].map((line) => style.cyan(line, enabled)).join("\n");
  return `${orbit}\n${style.bold("       COSMOS AGENT", enabled)}\n` +
    `${style.dim("   local first -> Azure ready", enabled)}`;
}

export function statusTag(
  severity: "error" | "warning" | "info" | "success",
  enabled = terminalColorsEnabled(),
): string {
  if (severity === "error") return style.red("[error]", enabled);
  if (severity === "warning") return style.yellow("[warn]", enabled);
  if (severity === "success") return style.green("[done]", enabled);
  return style.cyan("[info]", enabled);
}
