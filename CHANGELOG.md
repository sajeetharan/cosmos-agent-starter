# Changelog

Notable changes to `create-cosmos-agent` are documented here. The project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.6.0] - 2026-10-19

### Added

- Scenario-aware preflight checks before generation, with platform-specific
  remediation and structured JSON findings (#23).
- Focused command help, typo suggestions, stable CLI error codes, and redacted
  actionable diagnostics (#26).
- Detailed validation-stage results, durations, reproduction commands, and
  explicit unavailable/skipped checks in JSON output (#28).
- Wizard backtracking, editable final confirmation, inline validation, conditional
  questions, explicit-option precedence, and separate deployment consent (#24).
- Journaled bootstrap recovery through `resume-bootstrap`, preserving source,
  environment values, and Git history without automatic deployment retries (#25).
- Read-only `local-status` configuration inspection with opt-in bounded health
  and connectivity checks for scenario-specific local services (#27).

### Changed

- Create/bootstrap next steps now share a scenario-aware model with correct shell
  quoting, dependency state, API/web/worker instructions, and optional billable
  deployment labeling (#29).
- Restored guarded, tag-based publishing for the maintainer-owned npm package with npm provenance.

### Compatibility

- JSON output retains existing fields and adds preflight findings, structured
  next-step plans, validation stages, and actionable error codes where applicable.
- Interactive setup requires a TTY; automation must explicitly use `--yes` or
  `--dry-run`. `--yes` does not permit overwrites or implicit deployment.
- Declared scenario tests now run during generated-project validation. Live
  integration remains opt-in.

## [0.5.4] - 2026-10-05

### Added

- A 60-second bootstrap quickstart and copy-paste commands for every starter.
- Live adoption links and a community project showcase submission form.
- Consistent package, repository, release, media, and issue links.
- Documentation of the telemetry-free usage measurement policy.
- An on-demand Cosmos DB best-practices Agent Skill, based on the Azure Cosmos DB Agent Kit, in
  every generated project.

### Changed

- Expanded npm keywords for Azure AI, Cosmos DB, agent, LLM, OpenAI, and TypeScript starter
  discovery.

## [0.5.3] - 2026-10-04

### Added

- GitHub Packages publishing as `@sajeetharan/create-cosmos-agent`.
- Updated product overview and end-to-end demonstration material.

### Changed

- Package metadata now points to the canonical GitHub repository.
- Improved generated Cosmos DB client and emulator initialization behavior.

[Unreleased]: https://github.com/sajeetharan/cosmos-agent-starter/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/sajeetharan/cosmos-agent-starter/compare/v0.5.4...v0.6.0
[0.5.4]: https://github.com/sajeetharan/cosmos-agent-starter/compare/v0.5.3...v0.5.4
[0.5.3]: https://github.com/sajeetharan/cosmos-agent-starter/releases/tag/v0.5.3
