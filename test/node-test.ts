// Node test entry point. Imports the bun:test shim, then the real test suite.
// Run with: node --import tsx --test test/node-test.ts
import "./bun-test-shim";
import "../index.test";
