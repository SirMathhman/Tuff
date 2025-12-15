import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Many tests rebuild and run the selfhost compiler, which can exceed Vitest's
    // default 5s per-test timeout on slower machines / under parallel load.
    testTimeout: 20_000,
    // Suppress stdout/stderr from tests to reduce noise in the terminal.
    // Tests that need to capture output can do so explicitly using wrappers
    // like captureStdout() to intercept process.stdout.write().
    silent: true,
    // Only run the TypeScript tests. The .tuff integration tests compile into
    // ".dist/tuff-tests/**/*.test.mjs" which must NOT be collected by Vitest.
    include: ["src/test/ts/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/.dist/**",
      "**/selfhost/**",
      "**/rt/**",
    ],
  },
});
