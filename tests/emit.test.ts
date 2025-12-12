import { describe, expect, test } from "bun:test";
import { compile } from "./helpers";

describe("emit", () => {
  test("emits union variant constructors", () => {
    const { js, diagnostics } = compile(`
      type Option<T> = Some<T> | None;
      let x = Some(42);
    `);
    expect(diagnostics.some((d) => d.severity === "error")).toBe(false);
    expect(js).toContain("export const Some");
    expect(js).toContain("export const None");
  });

  test("emits match on .tag", () => {
    const { js } = compile(`
      type Option<T> = Some<T> | None;
      let x = match (Some(1)) { Some => 10, _ => 0 };
    `);
    expect(js).toContain("switch (__v.tag ?? __v)");
    expect(js).toContain('case "Some"');
  });

  test("emits this snapshot fields in class fn", () => {
    const { js, diagnostics } = compile(`
      class fn Point(x: I32, y: I32) => { }
      let p = Point(1, 2);
    `);
    expect(diagnostics.some((d) => d.severity === "error")).toBe(false);
    // should return { x: x, y: y } (or include other names)
    expect(js).toContain("return { x: x, y: y");
  });
});
