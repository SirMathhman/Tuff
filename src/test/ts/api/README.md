# API (in-memory) test suite

These tests exercise the selfhost compiler through the **in-memory API** wrappers in
`src/test/ts/compiler_api_wrapper.ts`.

Goals:

- Keep tests fast (no staging `.dist/` projects, no temp dirs, no module copying).
- Test compiler/analyzer behavior using `compileCode()` / `lintCode()`.
- Execute emitted code without writing files via `importEsmFromSource()` or
  `importEsmFromOutputs()`.

## Common helpers

From `../compiler_api_wrapper`:

- `compileCode(entryCode, modules)`
- `lintCode(entryCode, modules)`
- `importEsmFromSource(js)` (single-module output)
- `importEsmFromOutputs(outRelPaths, jsOutputs)` (multi-module output)

Lint option toggles:

- `setFluffOptions(unusedLocalsSeverity, unusedParamsSeverity)`
- `setFluffComplexityOptions(complexitySeverity, threshold)`
- `setFluffFileSizeOptions(severity, threshold)`

## Notes

Some lints/config behavior is still covered by **integration** tests (filesystem + stage2 tools)
to ensure `build.json` discovery and CLI output formatting don’t regress.
