import { expect, test } from "bun:test";
import { compileExpression, compileProgram, runCode } from "../code";
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
    const compiled = compileProgram(source);
    const actual = compiled.ok ? runCode(compiled.value, new Map()) : compiled;
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
