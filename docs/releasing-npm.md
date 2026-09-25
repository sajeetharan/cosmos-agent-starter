# Releasing `create-cosmos-agent` to npm

Production npm releases must use the Microsoft ESRP Release pipeline in
[`azure-pipelines/npm-release.yml`](../azure-pipelines/npm-release.yml). Do not publish or stage a
release directly from a developer machine or GitHub Actions.

The package intentionally keeps its existing unscoped name, `create-cosmos-agent`, to avoid breaking
current installation and `npx` commands. Onboard it as an existing unscoped npm package.

## One-time Microsoft onboarding

Complete these steps before enabling the pipeline:

1. Register the release in the Open Source Portal and obtain CELA and management approval.
2. Complete the Microsoft open-source release checklist. The repository contains `LICENSE`,
   `README.md`, `SECURITY.md`, and `CONTRIBUTING.md`.
3. Onboard the publishing identity to ESRP Release:
   - use a managed identity;
   - register the identity in the ESRP Portal;
   - configure the TSS signing certificate in Azure Key Vault;
   - install and authorize the ESRP Release Azure DevOps extension.
4. In the npm package settings:
   - invite `microsoft1es` and `microsoft-oss-releases`;
   - grant both accounts read/write collaborator access;
   - select **Require two-factor authentication or a granular access token with bypass 2FA
     enabled**.
5. Email `npmjs-admin@microsoft.com` and `esrpreldri@microsoft.com` to have the collaborator
   invitations accepted.

Do not disable 2FA for individual npm accounts. The package policy permits ESRP's granular
publishing token to bypass interactive 2FA.

## Azure DevOps configuration

Create an Azure DevOps pipeline from `azure-pipelines/npm-release.yml`.

Create the variable group `esrp-npm-release` and authorize it for this pipeline:

| Variable                  | Value                                            |
| ------------------------- | ------------------------------------------------ |
| `ESRP_SERVICE_CONNECTION` | ESRP Release service connection name             |
| `ESRP_KEY_VAULT_NAME`     | Key Vault containing the TSS signing certificate |
| `ESRP_SIGN_CERT_NAME`     | TSS signing certificate name                     |
| `ESRP_CLIENT_ID`          | ESRP-onboarded managed identity client ID        |
| `ESRP_OWNER`              | Individual Microsoft owner alias                 |
| `ESRP_APPROVER`           | Different individual Microsoft approver alias    |

Owners and approvers must be individual `@microsoft.com` aliases. Distribution lists and security
groups are not supported.

Create the Azure DevOps Environment `npm-production`. Add an **Approval** check with release
maintainers as approvers. This gate is required because the ESRP npm task itself is auto-approved
and publishes immediately.

Restrict permission to run the pipeline and approve `npm-production` to the release maintainers.
Do not enable continuous integration or scheduled triggers.

## Release process

1. Update `package.json`, `package-lock.json`, generated `azure.yaml` metadata, and the README
   tarball example to the release version.
2. Run:

   ```powershell
   npm ci
   npm run validate
   npm run lint
   npm pack --dry-run
   ```

3. Merge the release pull request into `main`.
4. Create an annotated `v<version>` tag on the merge commit and push it.
5. Manually run the Azure DevOps pipeline from `main` with **Publish the tagged package to npm
   through ESRP** enabled.
6. Approve the `npm-production` Environment check after reviewing the exact commit and generated
   package artifact.
7. Wait for `EsrpRelease@12` to complete.
8. Run the GitHub **Verify npm package** workflow with the published version.

The pipeline fails closed unless:

- it runs from `main`;
- the commit has the matching `v<version>` tag;
- the package is not private;
- exactly one `.tgz` file is produced;
- the tarball version matches `package.json`;
- all ESRP configuration is present;
- owner and approver are different individual Microsoft aliases.

## Transition from the retired publisher

Version `0.5.0` was staged by the retired GitHub publishing workflow and must be rejected before ESRP
onboarding:

```powershell
npm login --registry=https://registry.npmjs.org/
npm stage reject 5fd7bba2-e703-4dd7-8e2f-88fe46b80987 `
  --registry=https://registry.npmjs.org/
```

Do not approve that staged release. After rejection and ESRP onboarding, run the official pipeline
for a new `0.5.1` release. Do not move or recreate the existing `v0.5.0` tag: it predates this ESRP
pipeline, and release tags are immutable.

## Support and recovery

- ESRP incident: <https://aka.ms/createIncidentOnESRPRelease>
- ESRP Release UI: <https://aka.ms/releaseui>
- Microsoft open-source release guidance: <https://docs.opensource.microsoft.com/releasing/>
- npm unpublishing policy: <https://docs.npmjs.com/policies/unpublish>

Tag changes, removal, unpublishing, and deprecation require the approved ESRP/npm process. Do not
attempt to repair an incorrect production release from a local npm client.
