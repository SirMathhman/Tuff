---
name: coverage-inspector
description: "Use when: debugging test coverage gaps, finding uncovered lines in LCOV reports, deciding between dead code removal vs adding tests, or improving coverage to meet thresholds. Invokes: show-uncovered.ts script to inspect LCOV files with pretty-printed source."
---

# Coverage Inspector

Inspect uncovered code paths from LCOV coverage reports and decide whether to add tests or remove dead code.

## Workflow

1. **Generate coverage**: Run `bun test --coverage` to produce `coverage/lcov.info`
2. **Find gaps**: Use the script to inspect uncovered lines in a specific range:
   ```bash
   bun scripts/show-uncovered.ts coverage/lcov.info <file> <startLine> <endLine>
   ```
3. **Classify each uncovered line**:
   - **Dead code**: Analyzer catches the error at type-check time, so the evaluator path is unreachable. Remove it.
   - **Missing test**: The path is reachable but no test triggers it. Add a targeted test.
   - **Structural**: Closing braces, unreachable fallback returns after exhaustive switches. Leave as-is or refactor.
4. **Fix**: Remove dead code or add tests, then re-run coverage.
5. **Repeat** until all files meet the threshold in `bunfig.toml`.

## Classification Heuristics

| Pattern | Likely Cause | Action |
|---------|-------------|--------|
| Error throw in evaluator that analyzer already catches | Dead code | Remove |
| `break` after exhaustive switch | Structural | Add `break` or leave |
| Fallback return after `throw` | Unreachable | Remove or refactor |
| Unused function parameter | Dead code | Remove parameter |
| Valid error path with no test | Missing coverage | Add test |

## Tips

- Read uncovered lines with source context before deciding — don't guess from line numbers alone
- When in doubt, try to write a test first. If you can't trigger the path, it's dead code
- Use `...` separators in output to identify non-contiguous uncovered regions
