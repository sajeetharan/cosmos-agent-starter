import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("npm release workflow", () => {
  it("publishes an explicitly tagged release with provenance", async () => {
    const workflow = await readFile(
      new URL("../../.github/workflows/publish-npm.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("ref: ${{ inputs.tag }}");
    expect(workflow).toContain('registry-url: https://registry.npmjs.org/');
    expect(workflow).toContain('test "$RELEASE_TAG" = "v$package_version"');
    expect(workflow).toContain("npm publish --access public --provenance");
    expect(workflow).toContain("NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}");
  });

  it("keeps the public package publishable", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { name: string; private?: boolean };

    expect(packageJson).toMatchObject({ name: "create-cosmos-agent" });
    expect(packageJson.private).not.toBe(true);
  });
});
