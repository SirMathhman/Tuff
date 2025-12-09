#!/usr/bin/env bun
import { interpret } from "./interpret";

const input = process.argv.slice(2).join(" ");

try {
  const out = interpret(input);
  console.log(out);
} catch (err) {
  console.error("interpret error:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
