import { test, expect, describe } from "bun:test";
import {
  extractNarrowing,
  computeNegativeType,
  narrowedScope,
} from "../src/core/narrowing";
import type { Scope } from "../src/analyzer/analyzer";
import type { AstNode } from "../src/core/ast";
import type { Type } from "../src/core/types";
import {
  pointer,
  nullType,
  unionType,
  numeric,
  bool,
  isUnion,
} from "../src/core/types";

type VarDecl = { kind: "var"; type: Type; mutable: boolean };

function makeScope(declarations: Map<string, VarDecl>): Scope {
  return { declarations, typeParams: new Map() };
}

describe("extractNarrowing", () => {
  test("typecheck on identifier produces narrowing", () => {
    const scope = makeScope(
      new Map([
        [
          "ptr",
          {
            kind: "var",
            type: unionType([pointer(numeric("I", 32)), nullType()]),
            mutable: false,
          },
        ],
      ]),
    );
    const node: AstNode = {
      kind: "typecheck",
      value: { kind: "identifier", name: "ptr" },
      type: pointer(numeric("I", 32)),
    };
    const result = extractNarrowing(node, scope);
    expect(result).toBeDefined();
    expect(result!.variable).toBe("ptr");
    expect(result!.positiveType.kind).toBe("pointer");
    expect(result!.negativeType.kind).toBe("null");
  });

  test("typecheck on non-identifier returns undefined", () => {
    const scope = makeScope(new Map());
    const node: AstNode = {
      kind: "typecheck",
      value: { kind: "number", value: 42 },
      type: numeric("I", 32),
    };
    expect(extractNarrowing(node, scope)).toBeUndefined();
  });

  test("typecheck on unknown variable returns undefined", () => {
    const scope = makeScope(new Map());
    const node: AstNode = {
      kind: "typecheck",
      value: { kind: "identifier", name: "unknown" },
      type: numeric("I", 32),
    };
    expect(extractNarrowing(node, scope)).toBeUndefined();
  });

  test("non-typecheck returns undefined", () => {
    const scope = makeScope(new Map());
    const node: AstNode = { kind: "number", value: 42 };
    expect(extractNarrowing(node, scope)).toBeUndefined();
  });

  test("typecheck on non-union variable returns narrowing with original negative", () => {
    const scope = makeScope(
      new Map([
        ["x", { kind: "var", type: numeric("I", 32), mutable: false }],
      ]),
    );
    const node: AstNode = {
      kind: "typecheck",
      value: { kind: "identifier", name: "x" },
      type: numeric("I", 32),
    };
    const result = extractNarrowing(node, scope);
    expect(result).toBeDefined();
    expect(result!.negativeType.kind).toBe("numeric");
  });
});

describe("computeNegativeType", () => {
  test("removes matching variant from union", () => {
    const original = unionType([pointer(numeric("I", 32)), nullType()]);
    const positive = pointer(numeric("I", 32));
    const result = computeNegativeType(original, positive);
    expect(result.kind).toBe("null");
  });

  test("returns single variant when one remains", () => {
    const original = unionType([pointer(numeric("I", 32)), nullType()]);
    const positive = nullType();
    const result = computeNegativeType(original, positive);
    expect(result.kind).toBe("pointer");
  });

  test("returns union when multiple variants remain", () => {
    const original = unionType([
      pointer(numeric("I", 32)),
      nullType(),
      bool(),
    ]);
    const positive = bool();
    const result = computeNegativeType(original, positive);
    expect(result.kind).toBe("union");
    if (isUnion(result)) {
      expect(result.variants.length).toBe(2);
    }
  });

  test("returns dynamic when all variants removed", () => {
    const original = unionType([pointer(numeric("I", 32))]);
    const positive = pointer(numeric("I", 32));
    const result = computeNegativeType(original, positive);
    expect(result.kind).toBe("dynamic");
  });

  test("returns original for non-union type", () => {
    const original = numeric("I", 32);
    const positive = numeric("I", 32);
    const result = computeNegativeType(original, positive);
    expect(result.kind).toBe("numeric");
  });
});

describe("narrowedScope", () => {
  test("creates new scope with narrowed variable", () => {
    const base = makeScope(
      new Map([
        ["ptr", { kind: "var", type: unionType([pointer(numeric("I", 32)), nullType()]), mutable: false }],
      ]),
    );
    const result = narrowedScope(base, "ptr", pointer(numeric("I", 32)));
    const decl = result.declarations.get("ptr") as VarDecl;
    expect(decl).toBeDefined();
    expect(decl.type.kind).toBe("pointer");
  });

  test("does not mutate base scope", () => {
    const base = makeScope(
      new Map([
        ["ptr", { kind: "var", type: unionType([pointer(numeric("I", 32)), nullType()]), mutable: false }],
      ]),
    );
    narrowedScope(base, "ptr", pointer(numeric("I", 32)));
    const decl = base.declarations.get("ptr") as VarDecl;
    expect(decl.type.kind).toBe("union");
  });

  test("preserves other declarations", () => {
    const base = makeScope(
      new Map([
        ["ptr", { kind: "var", type: pointer(numeric("I", 32)), mutable: false }],
        ["x", { kind: "var", type: numeric("I", 32), mutable: false }],
      ]),
    );
    const result = narrowedScope(base, "ptr", numeric("I", 32));
    const xDecl = result.declarations.get("x") as VarDecl;
    expect(xDecl.type.kind).toBe("numeric");
  });
});
