import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function readLocalEnvironment(root: string): Promise<Record<string, string>> {
  let content: string;
  try {
    content = await readFile(join(root, ".env"), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
  const values: Record<string, string> = Object.create(null);
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) throw new Error(`Invalid .env assignment at line ${index + 1}; values are not displayed.`);
    let value = match[2]!;
    if (value.startsWith('"') || value.startsWith("'") || value.startsWith("`")) {
      const quote = value[0]!;
      let end = value.indexOf(quote, 1);
      while (end < 0 && index + 1 < lines.length) {
        value += `\n${lines[++index]}`;
        end = value.indexOf(quote, 1);
      }
      if (end < 0 || !/^\s*(?:#.*)?$/.test(value.slice(end + 1))) {
        throw new Error(`Invalid .env quoted value near line ${index + 1}; values are not displayed.`);
      }
      value = value.slice(1, end);
      if (quote === '"') value = value.replaceAll("\\n", "\n").replaceAll("\\r", "\r");
    } else value = value.split("#", 1)[0]!.trim();
    values[match[1]!] = value;
  }
  return values;
}
