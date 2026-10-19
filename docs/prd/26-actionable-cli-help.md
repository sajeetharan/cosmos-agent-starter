# PRD: Focused help and actionable errors

Issue: #26. Priority: second onboarding foundation; independent of #23.

## Outcome

Developers see relevant help and a concrete correction without having guessed
commands executed on their behalf.

## Requirements and behavior

- Support `--help` and `-h` for create, bootstrap, wizard, list, doctor,
  prepare-azure, validate, and completion, including a scoped example.
- Explain that create scaffolds while bootstrap can install and link; deployment
  needs explicit intent and may incur charges.
- Offer bounded edit-distance suggestions for unknown flags, template IDs,
  invalid enum values, and completion shells.
- Preserve bare command-like directory names. If multiple positional arguments
  suggest a mistyped command, show suggestions and explain explicit create.
- Do not echo invalid enum/template values, raw process environments, or obvious
  secret assignments. Bound and redact runtime error messages.

## JSON compatibility

Errors retain `status: "error"` and `message` on stderr with exit 1. Add `code`
and `suggestions: string[]`. Stable specific codes are `CLI_UNKNOWN_OPTION`,
`CLI_MISSING_VALUE`, `CLI_INVALID_VALUE`, `CLI_POSITIONAL_ARGUMENT`, and
`CLI_UNKNOWN_TEMPLATE`. Other existing failures use `CLI_ERROR`. These codes
describe categories, not localized message text. Suggestions are informational,
never executed. Successful output contracts are unchanged.

## Verification

Tests cover all command help, typo/mismatch suggestions, valid directory names,
nonzero error exits, JSON parsing/stream cleanliness, and secret redaction.
Existing argument, completion, and CLI tests remain applicable.
