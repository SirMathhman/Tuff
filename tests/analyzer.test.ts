import { describe, expect, test } from "bun:test";
import { compile } from "./helpers";

describe("analyzer", () => {
  test("disallows shadowing in nested scopes", () => {
    const { diagnostics } = compile(`
      let x = 1;
      { let x = 2; }
    `);
    expect(
      diagnostics.some(
        (d) =>
          d.severity === "error" && d.message.includes("Cannot declare 'x'")
      )
    ).toBe(true);
  });

  test("disallows assignment to immutable variable", () => {
    const { diagnostics } = compile(`
      let x = 1;
      x = 2;
    `);
    expect(
      diagnostics.some(
        (d) => d.severity === "error" && d.message.includes("immutable")
      )
    ).toBe(true);
  });

  test("loop expression requires break with value", () => {
    const { diagnostics } = compile(`
      let x = loop { break; };
    `);
    expect(
      diagnostics.some(
        (d) =>
          d.severity === "error" &&
          d.message.includes("Loop expression does not produce a value")
      )
    ).toBe(true);
  });
});
