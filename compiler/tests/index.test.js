import { describe, test, expect } from "@jest/globals";
import { compile } from "../src";

export function run(source, stdIn) {
  const compiled = compile(source);
  return new Function("stdIn", compile)(stdIn);
}
