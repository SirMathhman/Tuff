import { describe, it, expect } from "vitest";
import { interpret } from "../src/core/interpret";

describe("interpret (while loop basic)", () => {
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

  it("supports break inside while to exit early", () => {
    expect(
      interpret("let mut x = 0; while (x < 4) { x += 1; break; }; x")
    ).toEqual({ ok: true, value: 1 });
  });
});

describe("interpret (while loop continue tests)", () => {
  it("continue: basic skip of remaining body", () => {
    expect(
      interpret(
        "let mut i = 0; let mut x = 0; while (i < 4) { i += 1; if (i == 2) continue; x += 1; }; x"
      )
    ).toEqual({ ok: true, value: 3 });
  });

  it("continue: inside nested braced block propagates", () => {
    expect(
      interpret(
        "let mut i = 0; let mut x = 0; while (i < 3) { { i += 1; if (i == 2) continue; } x += 1; }; x"
      )
    ).toEqual({ ok: true, value: 2 });
  });

  it("continue: skipping later statements in the same iteration", () => {
    expect(
      interpret(
        "let mut i = 0; while (i < 2) { i += 1; continue; i += 10; }; i"
      )
    ).toEqual({ ok: true, value: 2 });
  });

  it("supports direct += on mutable binding", () => {
    expect(interpret("let mut x = 0; x += 1; x")).toEqual({
      ok: true,
      value: 1,
    });
  });
});
