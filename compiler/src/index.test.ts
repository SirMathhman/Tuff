import { compile } from ".";
import { Ok } from "./result";
import { expect } from "bun:test";

function run(source: string, stdIn = "") {
  const compiledJS = compile(source);
  if (compiledJS instanceof Ok) {
    return new Function("stdIn", compiledJS.value)(stdIn);
  } else {
    expect(compiledJS.error).toBeUndefined();
  }
}
