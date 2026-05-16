import { test, expect } from "bun:test";
import { compile, STD_IN, READ_TYPES, READ_PREFIX } from ".";

const INPUT_100 = "100";
const ARROW = ") => ";

test("run(empty string" + ARROW + "0", () => {
  const compiled = compile("");
  expect(new Function(STD_IN, compiled)("")).toBe(0);
});

function testReadType(type: string): void {
  const readExpr = READ_PREFIX + type + ">()";
  test('run("' + readExpr + '", "' + INPUT_100 + '"' + ARROW + "100", () => {
    const compiled = compile(readExpr);
    expect(new Function(STD_IN, compiled)(INPUT_100)).toBe(100);
  });
}

for (const type of READ_TYPES) testReadType(type);
