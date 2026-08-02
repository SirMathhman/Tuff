import { test, expect } from "bun:test";
import { compileTuffToJS } from "../src";

function evalute(tuffSource: string, args: string[] = []): number {
  const generatedJS = compileTuffToJS("in let args : &[&Str]; " + tuffSource);
  const wrappedJS =
    "let __exit__ = 0; let process = { exit: (code) => { __exit__ = code; } }; " +
    generatedJS +
    " ; return __exit__;";

  try {
    return new Function("args", wrappedJS)(["mock_program_name", ...args]);
  } catch (e) {
    throw new Error("Failed to execute generated JS: '" + wrappedJS + "'");
  }
}

test("evaluate empty program returns exit code 0", () => {
  expect(evalute("")).toBe(0);
});

test("evaluate whitespace-only program returns exit code 0", () => {
  expect(evalute(" ")).toBe(0);
});

test("evaluate args.length returns number of args as exit code", () => {
  expect(evalute("args.length")).toBe(1);
});

test("evaluate let declaration assigns then reads length", () => {
  expect(evalute("let temp = args; temp.length")).toBe(1);
});

test("evaluate number literal with U8 suffix returns its value", () => {
  expect(evalute("100U8")).toBe(100);
});

test("compile U8 literal out of range throws an error", () => {
  expect(() => compileTuffToJS("256U8")).toThrow();
});

test("compile negative U8 literal throws an error", () => {
  expect(() => compileTuffToJS("-100U8")).toThrow();
});

test("evaluate unary minus on a variable returns its negation", () => {
  expect(evalute("let x = 100; -x")).toBe(-100);
});

test("evaluate typed U8 variable declaration returns its value", () => {
  expect(evalute("let x : U8 = 100U8; x")).toBe(100);
});

test("evaluate program with only a declaration returns exit code 0", () => {
  expect(evalute("let x : U8 = 100U8;")).toBe(0);
});

test("evaluate widening U8 literal to U16 variable returns exit code 0", () => {
  expect(evalute("let x : U16 = 100U8;")).toBe(0);
});

test("compile narrowing U16 literal to U8 variable throws an error", () => {
  expect(() => compileTuffToJS("let x : U8 = 100U16;")).toThrow();
});

test("compile assigning inferred U16 variable to U8 variable throws an error", () => {
  expect(() => compileTuffToJS("let x = 100U16; let y : U8 = x;")).toThrow();
});

test("evaluate mutable variable reassignment returns the new value", () => {
  expect(evalute("let mut x = 0; x = 1; x")).toBe(1);
});
