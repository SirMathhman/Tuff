import { describe, expect, test } from "bun:test";
import { ErrorKind } from "../errors.ts";
import { checkProgram } from "./check.ts";
import { ExprType, StatementType } from "../ast/index.ts";
import {
  assignStmt,
  bin,
  bool,
  ident,
  ifStmt,
  letStmt,
  num,
  pos,
  prog,
  returnStmt,
} from "../ast/testAst.ts";

describe("checkProgram: bindings & undefined variables", () => {
  test("valid program passes", () => {
    const r = checkProgram(prog([letStmt("x", num(1)), returnStmt(ident("x"))]));
    expect(r.ok).toBe(true);
  });

  test("reassigning an immutable binding is a mutability error", () => {
    const r = checkProgram(prog([letStmt("x", num(1)), assignStmt(ident("x"), num(2))]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe(ErrorKind.Mutability);
      expect(r.error.message).toContain("x");
    }
  });

  test("reassigning a mutable binding passes", () => {
    const r = checkProgram(prog([letStmt("x", num(1), true), assignStmt(ident("x"), num(2))]));
    expect(r.ok).toBe(true);
  });

  test("undefined variable in expression is a runtime error", () => {
    const r = checkProgram(prog([returnStmt(ident("y"))]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe(ErrorKind.Runtime);
      expect(r.error.message).toContain("y");
    }
  });

  test("undefined variable in dead code is still reported", () => {
    const r = checkProgram(
      prog([
        ifStmt({ type: ExprType.Boolean, value: false, position: pos }, [letStmt("y", ident("z"))]),
      ]),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe(ErrorKind.Runtime);
      expect(r.error.message).toContain("z");
    }
  });
});

describe("checkProgram: conditions, references & division", () => {
  test("non-boolean if condition is a semantic error", () => {
    const r = checkProgram(prog([ifStmt(num(1), [])]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe(ErrorKind.Semantic);
      expect(r.error.message).toContain("boolean");
    }
  });

  test("deref of a non-reference is a semantic error", () => {
    const r = checkProgram(
      prog([
        letStmt("x", num(1)),
        letStmt("y", { type: ExprType.Deref, operand: ident("x"), position: pos }),
      ]),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe(ErrorKind.Semantic);
      expect(r.error.message).toContain("not a reference");
    }
  });

  test("reference to a non-identifier operand is a semantic error", () => {
    const r = checkProgram(
      prog([letStmt("y", { type: ExprType.Ref, mutable: false, operand: num(1), position: pos })]),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe(ErrorKind.Semantic);
      expect(r.error.message).toContain("reference");
    }
  });
});

describe("checkProgram: division & integer ranges", () => {
  test("division by a known zero literal is a runtime error", () => {
    const r = checkProgram(prog([returnStmt(bin("/", num(10), num(0)))]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe(ErrorKind.Runtime);
      expect(r.error.message).toContain("zero");
    }
  });

  test("division by a constant-folded zero is a runtime error", () => {
    const r = checkProgram(prog([returnStmt(bin("/", num(10), bin("-", num(1), num(1))))]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe(ErrorKind.Runtime);
      expect(r.error.message).toContain("zero");
    }
  });

  test("division by a zero binding is a runtime error", () => {
    const r = checkProgram(prog([letStmt("y", num(0)), returnStmt(bin("/", num(10), ident("y")))]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe(ErrorKind.Runtime);
      expect(r.error.message).toContain("zero");
    }
  });

  test("suffixed literal out of range is a semantic error", () => {
    const r = checkProgram(prog([returnStmt(num(256, "U8"))]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe(ErrorKind.Semantic);
      expect(r.error.message).toContain("U8");
    }
  });

  test("suffixed literal in range passes", () => {
    const r = checkProgram(prog([returnStmt(num(255, "U8"))]));
    expect(r.ok).toBe(true);
  });

  test("negative suffixed literal out of range is a semantic error", () => {
    const r = checkProgram(prog([returnStmt(num(-1, "U8"))]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe(ErrorKind.Semantic);
      expect(r.error.message).toContain("U8");
    }
  });

  test("boolean arithmetic operand is a semantic error", () => {
    const r = checkProgram(prog([returnStmt(bin("+", bool(true), num(1)))]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe(ErrorKind.Semantic);
      expect(r.error.message).toContain("numbers");
    }
  });

  test("non-array index target is a semantic error", () => {
    const r = checkProgram(
      prog([
        letStmt("x", num(1)),
        returnStmt({ type: ExprType.Index, array: ident("x"), index: num(0), position: pos }),
      ]),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe(ErrorKind.Semantic);
      expect(r.error.message).toContain("non-array");
    }
  });

  test("non-number array index is a semantic error", () => {
    const r = checkProgram(
      prog([
        letStmt("a", { type: ExprType.Array, elements: [num(1)], position: pos }),
        returnStmt({
          type: ExprType.Index,
          array: ident("a"),
          index: { type: ExprType.Boolean, value: true, position: pos },
          position: pos,
        }),
      ]),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe(ErrorKind.Semantic);
      expect(r.error.message).toContain("number");
    }
  });
});

describe("checkProgram: ranges, indexing & assignment", () => {
  test("assignment to an undefined target is a runtime error", () => {
    const r = checkProgram(prog([assignStmt(ident("x"), num(1))]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe(ErrorKind.Runtime);
      expect(r.error.message).toContain("x");
    }
  });

  test("assignment through an immutable reference is a mutability error", () => {
    const r = checkProgram(
      prog([
        letStmt("x", num(1), true),
        letStmt("y", { type: ExprType.Ref, mutable: false, operand: ident("x"), position: pos }),
        assignStmt({ type: ExprType.Deref, operand: ident("y"), position: pos }, num(2)),
      ]),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe(ErrorKind.Mutability);
      expect(r.error.message).toContain("immutable reference");
    }
  });

  test("block-scoped bindings do not leak", () => {
    const r = checkProgram(
      prog([
        { type: StatementType.Block, statements: [letStmt("x", num(1))], position: pos },
        returnStmt(ident("x")),
      ]),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe(ErrorKind.Runtime);
      expect(r.error.message).toContain("x");
    }
  });
});
