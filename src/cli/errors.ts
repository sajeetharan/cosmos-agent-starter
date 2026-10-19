export class CliError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly suggestions: string[],
  ) {
    super(message);
    this.name = "CliError";
  }
}

function distance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1]! + 1,
        previous[column]! + 1,
        previous[column - 1]! + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length]!;
}

export function suggest(value: string, candidates: string[]): string[] {
  if (value.length > 100) return [];
  return candidates.map((candidate) => ({
    candidate, distance: distance(value.toLowerCase(), candidate.toLowerCase()),
  }))
    .filter((item) => item.distance <= (value.length > 6 ? 3 : 2))
    .sort((a, b) => a.distance - b.distance || a.candidate.localeCompare(b.candidate))
    .slice(0, 3)
    .map((item) => item.candidate);
}

export function invalidChoice(name: string, value: string, choices: string[]): CliError {
  const matches = suggest(value, choices);
  return new CliError("CLI_INVALID_VALUE",
    `Unsupported ${name}. Use ${choices.join(", ")}.`,
    matches.length ? matches.map((match) => `Use ${match}.`) : [`Choose one of: ${choices.join(", ")}.`]);
}

export function redactError(message: string): string {
  return message
    .replace(/(Bearer\s+)\S+/gi, "$1[REDACTED]")
    .replace(/((?:api[-_]?key|accountkey|password|secret|token)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s;,"']+)/gi, "$1[REDACTED]")
    .replace(/(https?:\/\/)[^/\s@]+@/gi, "$1[REDACTED]@")
    .slice(0, 2000);
}
