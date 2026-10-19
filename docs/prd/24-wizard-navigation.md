# PRD: Revisable, validated terminal wizard

Issue: #24.

## Outcome and requirements

Users can backtrack without losing valid answers, edit any visible choice, and
confirm or cancel before file generation. Numbered text input remains the only
required terminal capability; colors are supplementary.

Explicit flags override defaults and skip their prompts. The final numbered Edit
menu can deliberately override those flags. Conditional questions are recomputed
after each answer; displayed totals describe the currently applicable questions
and may change when storage, scenario, or cloud choices change.

Capacity and connection questions appear only for relevant storage/deployment;
web questions require a web-capable scenario and identity prompts do not apply
to stdin workers. Azure provisioning fields remain conditional. Inline errors
retry the same question. Final cross-field validation reuses argument validation.

Confirmation is required before returning to the generator. Billable deployment
requires separate typed consent in interactive mode; explicit noninteractive
deployment flags retain their existing semantics. --yes never implies --force.
EOF/Ctrl+C cancel; non-TTY invocations fail promptly unless --yes or --dry-run
explicitly selects a noninteractive path.

## Verification

Scripted terminal tests cover numbered choices, invalid input, backtracking,
explicit flag editing, conditional totals, cloud URL retry, cancellation, and
deployment consent. CLI regressions verify noninteractive behavior and no files
on cancellation. No generated application content changes.
