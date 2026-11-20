import { expect, test } from "bun:test";
import { compileExpression, runCode } from "../code";
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
