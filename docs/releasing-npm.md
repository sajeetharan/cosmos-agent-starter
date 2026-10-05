# Releasing `create-cosmos-agent` to npm

Production npm releases use the manual GitHub **Publish to npm** workflow in
[`publish-npm.yml`](../.github/workflows/publish-npm.yml). The package is published to the
maintainer's personal npm account as the existing unscoped `create-cosmos-agent` package.

Do not publish from a developer machine. The workflow uses the repository's `NPM_TOKEN` secret,
validates the immutable release tag, and emits npm provenance.

## One-time configuration

1. Create a granular npm access token with read/write access to `create-cosmos-agent`.
2. Configure the repository Actions secret `NPM_TOKEN` with that token.
3. Require two-factor authentication for the npm account and limit the token to this package.

## Release process

1. Update `package.json`, `package-lock.json`, the changelog, and versioned documentation.
2. Run:

   ```powershell
   npm ci
   npm run validate
   npm run lint
   npm pack --dry-run
   ```

3. Merge the release commit into `main`.
4. Create and push an annotated `v<version>` tag on the release commit.
5. Run the GitHub **Publish to npm** workflow from `main` and enter the immutable release tag.
6. Wait for publication to complete.
7. Run the GitHub **Verify npm package** workflow with the published version.

The workflow fails closed unless the requested tag matches both the checked-out commit and the
version in `package.json`.

## Publishing to GitHub Packages

The npmjs.com package remains unscoped as `create-cosmos-agent`. To make the same release visible
in this repository's **Packages** section, run the GitHub **Publish GitHub package** workflow from
`main` and enter the same immutable release tag.

That workflow temporarily scopes the package as `@sajeetharan/create-cosmos-agent` and publishes it
to GitHub Packages with `GITHUB_TOKEN`. It does not modify the checked-in package name.

## Support and recovery

Tag changes, removal, unpublishing, and deprecation must follow
[npm's package policies](https://docs.npmjs.com/policies). Do not move an existing release tag or
attempt to overwrite a published package version.
