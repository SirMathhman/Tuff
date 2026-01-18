# Development Notes

- Minimal `compile` implementation currently in `src/app.ts` that returns `0` for empty source so the simple unit test (`tests/app.test.ts`) passes.
- Next steps:
  - Implement full compiler logic and add tests for non-empty programs.
  - Add CI to run tests on every PR.
