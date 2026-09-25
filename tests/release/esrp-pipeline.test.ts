import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("ESRP npm release pipeline", () => {
  it("is manual, gated, managed-identity based, and configured for npm", async () => {
    const pipeline = await readFile(
      new URL("../../azure-pipelines/npm-release.yml", import.meta.url),
      "utf8",
    );

    expect(pipeline).toMatch(/^trigger: none$/m);
    expect(pipeline).toMatch(/^pr: none$/m);
    expect(pipeline).toContain("environment: npm-production");
    expect(pipeline).toContain("task: EsrpRelease@12");
    expect(pipeline).toContain("usemanagedidentity: true");
    expect(pipeline).toContain("intent: PackageDistribution");
    expect(pipeline).toContain("contenttype: npm");
    expect(pipeline).toContain("mainpublisher: ESRPRELPACMAN");
    expect(pipeline).toContain("domaintenantid: 975f013f-7f24-47e8-a7d3-abc4752bf346");
  });

  it("does not retain a direct GitHub npm publishing workflow", async () => {
    await expect(
      access(new URL("../../.github/workflows/publish-npm.yml", import.meta.url)),
    ).rejects.toThrow();
  });

  it("keeps the public package publishable", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { name: string; private?: boolean };

    expect(packageJson).toMatchObject({ name: "create-cosmos-agent" });
    expect(packageJson.private).not.toBe(true);
  });
});
