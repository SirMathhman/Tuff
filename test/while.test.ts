import { describe, it, expect } from "vitest";
import { interpret } from "../src/interpret";

describe("interpret (while loop smoke tests)", () => {
  it("supports braced block statements", () => {
    expect(interpret("let mut x = 0; { x += 1 }; x")).toEqual({
      ok: true,
      value: 1,
    });
  });

  it("does not execute while(false)", () => {
    expect(interpret("let mut x = 0; while (false) { x += 1 }; x")).toEqual({
      ok: true,
      value: 0,
    });
  });

  it("executes while loop until condition fails", () => {
    expect(interpret("let mut x = 0; while (x < 1) { x += 1 }; x")).toEqual({
      ok: true,
      value: 1,
    });
  });

  it("supports direct += on mutable binding", () => {
    expect(interpret("let mut x = 0; x += 1; x")).toEqual({
      ok: true,
      value: 1,
    });
  });
});
