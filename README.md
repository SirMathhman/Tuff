# Tuff

A small Kotlin project with a tiny interpreter and a basic quality toolchain.

## Build / test

- Run tests:
  - `gradle test`

## Lint

This project uses:

- **ktlint** for formatting/style
- **detekt** for static analysis, including a **custom rule set**

Common commands:

- Check formatting:
  - `gradle ktlintCheck`
- Auto-format:
  - `gradle ktlintFormat`
- Run detekt:
  - `gradle detekt`
- Run all verification tasks:
  - `gradle check`

## No-throw policy

The codebase is migrating toward a policy of avoiding `throw` in application code.
Instead, functions should return a `Result<T, E>` (see `src/main/kotlin/com/sirmathhman/tuff/Result.kt`).

Detekt enforces this via a custom rule in `detekt-rules`.
