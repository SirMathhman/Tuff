import { expect, test } from "bun:test";
import type { Result, TuffError } from "../errors";
import { compileExpression, compileProgram } from "../code";
import { runCode } from "../run";
import { interpretTuff } from "../index";

// Expressions with no variables: the compiled path must match interpretTuff exactly.
const SOURCES = [
  "1 + 2 * 3",
  "(2 + 3) * 4",
  "-(2 + 3) * 4",
  "7 / 2",
  "1 / 0",
  "true + 1",
  "2 < 3",
  "1 < 2 < 3",
  "5 - -2",
  "2 * -3",
  "true",
  "(1 + 2",
];

for (const source of SOURCES) {
  test(`compiled "${source}" matches interpretTuff`, () => {
    const compiled = compileExpression(source);
    const actual = compiled.ok ? runCode(compiled.value, new Map()) : compiled;
    expect(actual).toEqual(interpretTuff(source));
  });
}

// Runs a program through the compiled path; undefined when the compiled path does not handle it.
function runProgram(source: string): Result<number, TuffError> | undefined {
  const compiled = compileProgram(source);
  if (compiled === undefined) return undefined;
  return compiled.ok ? runCode(compiled.value, new Map()) : compiled;
}

// Programs with let, assignment, and an expression: the compiled path must match interpretTuff.
const PROGRAMS = [
  "let x = 1; x + 2",
  "let x = 1",
  "let mut x = 0; x = 5; x",
  "let mut x = 1; x += 2; x",
  "let x = 1; x = 2; x",
  "let mut x = 0; x = true; x",
  "y + 1",
  "let x = 1 y",
  "let x = 1; let y = x * 3; y",
  "let x = ; x",
];

for (const source of PROGRAMS) {
  test(`compiled program "${source}" matches interpretTuff`, () => {
    const actual = runProgram(source);
    expect(actual).toEqual(interpretTuff(source));
  });
}

// Signs must sit directly before their operand, as the grammar requires.
const SIGN_SOURCES = ["- 2", "1 - - 2", "-true"];

for (const source of SIGN_SOURCES) {
  test(`compiled "${source}" matches interpretTuff`, () => {
    const compiled = compileExpression(source);
    const actual = compiled.ok ? runCode(compiled.value, new Map()) : compiled;
    expect(actual).toEqual(interpretTuff(source));
  });
}

// Braced if-else: the compiled path must match interpretTuff.
const IF_PROGRAMS = [
  "if (false) { 2 } else { 3 }",
  "if (true) { 2 } else { 3 }",
  "if (false) { let x = 0; x = 1; x } else { 3 }",
  "if (false) { 1 / { let x = 0; x } } else { 1 }",
  "if (true) { 1 } else { true + true }",
  "if (1) { 1 } else { 2 }",
  "if (true) { 1 } else { 2 } + 10",
  "if (true) { 1 } else { 2 }; 3",
  "let mut x = 0; let y = if (true) { x = 5; 1 } else { x = 7; 2 }; x + y",
  "let x = 1; let y = if (x > 0) { x + 1 } else { 0 }; y",
  "if (true) 1 else 2",
  "if (false) 1 else 2",
  "if (true) 1 else 2 + 3",
  "if (false) 1 else 2 * 3 + 1",
  "1 + if (true) 2 else 3",
  "if (true) 1 else { 2 } + 3",
  "if (true) { 1 } else 2",
  "if (false) 1 else -2",
  "if (true) -1 else 2",
  "if (1) 1 else 2",
];

for (const source of IF_PROGRAMS) {
  test(`compiled if program "${source}" matches interpretTuff`, () => {
    const actual = runProgram(source);
    expect(actual).toEqual(interpretTuff(source));
  });
}

// Programs with blocks used as values: the compiled path must match interpretTuff.
const BLOCK_PROGRAMS = [
  "let q = { 1 + 2 }; q",
  "let x = 1; let q = { let x = 5; x }; q + x",
  "let x = { let y = 2; y * 3 }; x",
  "let q = { let x = 1; }; q",
  "1 + { let x = 2; }",
  "let mut x = 0; let y = { x = 3; 4 }; x + y",
  "let x = 1; let y = { let x = 9; x }; x + y",
  "let q = { }; q",
];

for (const source of BLOCK_PROGRAMS) {
  test(`compiled block program "${source}" matches interpretTuff`, () => {
    const actual = runProgram(source);
    expect(actual).toEqual(interpretTuff(source));
  });
}
