// Node loader that maps the `bun:test` specifier to our shim.
// Usage: node --import tsx --loader ./test/bun-test-loader.ts --test test/node-test.ts
import { fileURLToPath } from "node:url";

const shimPath = fileURLToPath(new URL("./bun-test-shim.ts", import.meta.url));

export async function resolve(specifier: string, context: unknown, nextResolve: unknown) {
  if (specifier === "bun:test") {
    return {
      url: pathToFileURL(shimPath).href,
      shortCircuit: true,
    };
  }
  return (nextResolve as (s: string, c: unknown) => Promise<{ url: string }>)(specifier, context);
}

function pathToFileURL(p: string) {
  return new URL(`file://${p.replace(/\\/g, "/")}`);
}
