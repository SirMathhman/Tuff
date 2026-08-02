import { test, expect } from "bun:test";
import { compileTuffToJS } from ".";

function evalute(tuffSource: string, args: string[]) {
  const generatedJS = compileTuffToJS("in let args : &[&Str]; " + tuffSource);
  const wrappedJS =
    "let __exit__ = 0; let process = { exit(code) => { __exit__ = code; } }; " +
    generatedJS +
    " ; return __exit__;";

  try {
    return new Function("args", wrappedJS)(args);
  } catch (e) {
    throw new Error("Failed to execute generated JS: '" + wrappedJS + "'");
  }
}
