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

export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001B\[[0-9;]*m/g, "");
}

export function visibleLength(text: string): number {
  return stripAnsi(text).length;
}

export const style = {
  bold: (value: string, enabled?: boolean) => color(1, value, enabled),
  dim: (value: string, enabled?: boolean) => color(2, value, enabled),
  underline: (value: string, enabled?: boolean) => color(4, value, enabled),
  inverse: (value: string, enabled?: boolean) => color(7, value, enabled),
  red: (value: string, enabled?: boolean) => color(31, value, enabled),
  green: (value: string, enabled?: boolean) => color(32, value, enabled),
  yellow: (value: string, enabled?: boolean) => color(33, value, enabled),
  blue: (value: string, enabled?: boolean) => color(34, value, enabled),
  magenta: (value: string, enabled?: boolean) => color(35, value, enabled),
  cyan: (value: string, enabled?: boolean) => color(36, value, enabled),
  white: (value: string, enabled?: boolean) => color(37, value, enabled),
  gray: (value: string, enabled?: boolean) => color(90, value, enabled),
};

export const symbols = {
  check: "✔",
  cross: "✖",
  info: "ℹ",
  warn: "⚠",
  step: "◆",
  pointer: "❯",
  bullet: "•",
  arrow: "›",
  sparkle: "✨",
};

export type BadgeType =
  | "default"
  | "recommended"
  | "production"
  | "local"
  | "muted"
  | "durable";

export function badge(
  text: string,
  type: BadgeType = "default",
  enabled = terminalColorsEnabled(),
): string {
  switch (type) {
    case "recommended":
      return style.yellow(`[${text}]`, enabled);
    case "production":
      return style.blue(`[${text}]`, enabled);
    case "durable":
      return style.green(`[${text}]`, enabled);
    case "local":
    case "muted":
      return style.dim(`[${text}]`, enabled);
    case "default":
    default:
      return style.cyan(`[${text}]`, enabled);
  }
}

export function box(
  lines: string | string[],
  title?: string,
  borderColor: (val: string, enabled?: boolean) => string = style.cyan,
  enabled = terminalColorsEnabled(),
): string {
  const lineArray = Array.isArray(lines) ? lines : lines.split("\n");
  const maxLineLength = Math.max(
    title ? visibleLength(title) + 6 : 0,
    ...lineArray.map((line) => visibleLength(line)),
    44,
  );
  const innerWidth = Math.min(Math.max(maxLineLength + 4, 48), 84);

  const topBorder = title
    ? `╭─ ${style.bold(title, enabled)} ${"─".repeat(Math.max(0, innerWidth - visibleLength(title) - 3))}╮`
    : `╭${"─".repeat(innerWidth)}╮`;
  const bottomBorder = `╰${"─".repeat(innerWidth)}╯`;

  const formattedLines = lineArray.map((line) => {
    const len = visibleLength(line);
    const padding = " ".repeat(Math.max(0, innerWidth - 4 - len));
    return `${borderColor("│", enabled)}  ${line}${padding}  ${borderColor("│", enabled)}`;
  });

  return [
    borderColor(topBorder, enabled),
    ...formattedLines,
    borderColor(bottomBorder, enabled),
  ].join("\n");
}

export function brandBanner(enabled = terminalColorsEnabled()): string {
  const width = 47;
  const row = (styledText: string, plainText: string) => {
    const trailing = Math.max(0, width - 3 - plainText.length);
    return `${style.cyan("   │", enabled)}   ${styledText}${" ".repeat(trailing)}${style.cyan("│", enabled)}`;
  };

  const stars = style.cyan("     ✦  ·  .  *  ·  .  *  .  ·  ✦", enabled);
  const top = style.cyan(`   ╭${"─".repeat(width)}╮`, enabled);
  const row1 = row(
    style.bold("A Z U R E   C O S M O S   D B", enabled),
    "A Z U R E   C O S M O S   D B",
  );
  const row2 = row(
    style.bold(style.cyan("COSMOS AGENT STARTER", enabled), enabled),
    "COSMOS AGENT STARTER",
  );
  const row3 = row(
    style.dim("local first -> Azure ready", enabled),
    "local first -> Azure ready",
  );
  const bottom = style.cyan(`   ╰${"─".repeat(width)}╯`, enabled);

  return [stars, top, row1, row2, row3, bottom].join("\n");
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
