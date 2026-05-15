import { test, expect } from "bun:test";
import { compileTuffToTS } from ".";
import * as ts from "typescript";

function executeTuff(tuffSourceCode: string, stdIn: string = ""): number {
  const compiledTSCode = compileTuffToTS(tuffSourceCode);
  const compiledJSCode = ts.transpile(compiledTSCode);
  const result = new Function("stdIn", compiledJSCode)(stdIn);
  if (typeof result !== "number") {
    throw new Error("Not a number!");
  }
  return result;
}
