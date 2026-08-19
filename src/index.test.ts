import { evaluate } from "./index.js";

describe("evaluate", () => {
  it("returns an EmptyProgram error for an empty string", () => {
    expect(evaluate("")).toEqual({ ok: false, error: { kind: "EmptyProgram" } });
  });
  it('returns 1 for "return 1;"', () => {
    expect(evaluate("return 1;")).toEqual({ ok: true, value: 1 });
  });
  it('returns 1 for "let x = 1; return x;"', () => {
    expect(evaluate("let x = 1; return x;")).toEqual({ ok: true, value: 1 });
  });
  it('returns 1 for "let mut x = 0; x = 1; return x;"', () => {
    expect(evaluate("let mut x = 0; x = 1; return x;")).toEqual({ ok: true, value: 1 });
  });
  it('returns 1 for "let mut x = 0; { x = 1; } return x;"', () => {
    expect(evaluate("let mut x = 0; { x = 1; } return x;")).toEqual({ ok: true, value: 1 });
  });
  it('returns 1 for "let x = true; return x;"', () => {
    expect(evaluate("let x = true; return x;")).toEqual({ ok: true, value: 1 });
  });
  it("returns an ImmutableAssignment error when assigning to a non-mut variable", () => {
    expect(evaluate("let x = 0; x = 1; return x;")).toEqual({
      ok: false,
      error: { kind: "ImmutableAssignment", name: "x", index: 1 },
    });
  });
  it("returns an UnknownIdentifier error for an undeclared variable", () => {
    expect(evaluate("return y;")).toEqual({
      ok: false,
      error: { kind: "UnknownIdentifier", name: "y", index: 0 },
    });
  });
  it("returns an UnexpectedStatement error for unrecognized input", () => {
    expect(evaluate("garbage")).toEqual({
      ok: false,
      error: { kind: "UnexpectedStatement", statement: "garbage", index: 0 },
    });
  });
  it("returns a MissingReturn error when no return statement is present", () => {
    expect(evaluate("let x = 1;")).toEqual({ ok: false, error: { kind: "MissingReturn" } });
  });
});
