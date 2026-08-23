import { describe, expect, test } from "bun:test";
import { evaluateProgram } from "./eval.ts";
import {
  array,
  assignStmt,
  bin,
  bool,
  deref,
  ident,
  ifStmt,
  index,
  letStmt,
  num,
  pos,
  prog,
  ref,
  returnStmt,
  whileStmt,
} from "./testAst.ts";

describe("evaluateProgram: values & errors", () => {
  test("empty program returns 0", () => {
    expect(evaluateProgram(prog([]))).toEqual({ ok: true, value: 0 });
  });

  test("arithmetic with precedence", () => {
    expect(evaluateProgram(prog([returnStmt(bin("+", num(1), bin("*", num(2), num(3))))]))).toEqual(
      {
        ok: true,
        value: 7,
      },
    );
  });

  test("division truncates", () => {
    expect(evaluateProgram(prog([returnStmt(bin("/", num(10), num(3)))]))).toEqual({
      ok: true,
      value: 3,
    });
  });

  test("runtime division by zero", () => {
    const r = evaluateProgram(prog([returnStmt(bin("/", num(10), bin("-", num(1), num(1))))]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("runtime");
      expect(r.error.message).toContain("zero");
    }
  });

  test("boolean return coerces to 1/0", () => {
    expect(evaluateProgram(prog([returnStmt(bool(true))]))).toEqual({ ok: true, value: 1 });
    expect(evaluateProgram(prog([returnStmt(bool(false))]))).toEqual({ ok: true, value: 0 });
  });

  test("returning a reference is a semantic error", () => {
    const r = evaluateProgram(
      prog([letStmt("x", num(1)), letStmt("y", ref(ident("x"))), returnStmt(ident("y"))]),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("semantic");
      expect(r.error.message).toContain("reference");
    }
  });

  test("returning an array is a semantic error", () => {
    const r = evaluateProgram(prog([returnStmt(array([num(1)]))]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("semantic");
      expect(r.error.message).toContain("array");
    }
  });

  test("boolean arithmetic operand is a semantic error", () => {
    const r = evaluateProgram(prog([returnStmt(bin("+", bool(true), num(1)))]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("semantic");
      expect(r.error.message).toContain("numbers");
    }
  });
});

describe("evaluateProgram: references, arrays & control flow", () => {
  test("deref through a reference chain", () => {
    const r = evaluateProgram(
      prog([
        letStmt("x", num(5)),
        letStmt("a", ref(ident("x"))),
        letStmt("b", ref(ident("a"))),
        returnStmt(deref(ident("b"))),
      ]),
    );
    expect(r).toEqual({ ok: true, value: 5 });
  });

  test("assignment through a mutable reference", () => {
    const r = evaluateProgram(
      prog([
        letStmt("x", num(0), true),
        letStmt("y", ref(ident("x"), true)),
        assignStmt(deref(ident("y")), num(1)),
        returnStmt(ident("x")),
      ]),
    );
    expect(r).toEqual({ ok: true, value: 1 });
  });

  test("array indexing", () => {
    const r = evaluateProgram(
      prog([
        letStmt("a", array([num(1), num(2), num(3)])),
        returnStmt(bin("+", index(ident("a"), num(0)), index(ident("a"), num(2)))),
      ]),
    );
    expect(r).toEqual({ ok: true, value: 4 });
  });

  test("index out of range is a runtime error", () => {
    const r = evaluateProgram(
      prog([letStmt("a", array([num(1)])), returnStmt(index(ident("a"), num(3)))]),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("runtime");
      expect(r.error.message).toContain("out of range");
    }
  });

  test("if/else selects the taken branch", () => {
    const r = evaluateProgram(
      prog([
        letStmt("x", num(0), true),
        ifStmt(bool(false), [assignStmt(ident("x"), num(1))], [assignStmt(ident("x"), num(2))]),
        returnStmt(ident("x")),
      ]),
    );
    expect(r).toEqual({ ok: true, value: 2 });
  });

  test("while loop runs until the condition is false", () => {
    const r = evaluateProgram(
      prog([
        letStmt("x", num(0), true),
        whileStmt(bin("<", ident("x"), num(4)), [
          assignStmt(ident("x"), bin("+", ident("x"), num(1))),
        ]),
        returnStmt(ident("x")),
      ]),
    );
    expect(r).toEqual({ ok: true, value: 4 });
  });

  test("return stops evaluation of later statements", () => {
    const r = evaluateProgram(
      prog([letStmt("x", num(0), true), returnStmt(num(1)), assignStmt(ident("x"), num(2))]),
    );
    expect(r).toEqual({ ok: true, value: 1 });
  });

  test("unary minus", () => {
    const r = evaluateProgram(
      prog([returnStmt({ type: "unary", op: "-", operand: num(5), position: pos })]),
    );
    expect(r).toEqual({ ok: true, value: -5 });
  });
});
