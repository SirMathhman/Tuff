import { test, expect, describe } from "bun:test";
import {
  valueMatchesType,
  valueToType,
  matchesAnyVariant,
} from "../src/core/matcher";
import type { Value } from "../src/eval/value";
import type { Type } from "../src/core/types";
import {
  pointer,
  arrayType,
  structType,
  tupleType,
  unionType,
  numeric,
  voidType,
  bool,
  nullType,
} from "../src/core/types";

type NumericType = { kind: "numeric"; prefix: string; bits: number };
type PointerType = { kind: "pointer"; inner: Type; mutable: boolean };
type MatcherArrayType = { kind: "array"; inner: Type; length: number };
type MatcherTupleType = { kind: "tuple"; elements: Type[] };
type MatcherStructType = {
  kind: "struct";
  name: string;
  typeParams?: string[];
  fields: { name: string; type: Type; mutable?: boolean }[];
};

describe("valueToType", () => {
  test("number with type", () => {
    const value: Value = { kind: "number", value: 42, type: numeric("I", 32) };
    const result = valueToType(value, new Map());
    expect(result.kind).toBe("numeric");
    expect((result as NumericType).prefix).toBe("I");
    expect((result as NumericType).bits).toBe(32);
  });

  test("number without type falls back to I32", () => {
    const value: Value = { kind: "number", value: 42 };
    const result = valueToType(value, new Map());
    expect(result.kind).toBe("numeric");
    expect((result as NumericType).prefix).toBe("I");
    expect((result as NumericType).bits).toBe(32);
  });

  test("boolean", () => {
    const value: Value = { kind: "boolean", value: true };
    const result = valueToType(value, new Map());
    expect(result.kind).toBe("bool");
  });

  test("null", () => {
    const value: Value = { kind: "null" };
    const result = valueToType(value, new Map());
    expect(result.kind).toBe("null");
  });

  test("void", () => {
    const value: Value = { kind: "void" };
    const result = valueToType(value, new Map());
    expect(result.kind).toBe("void");
  });

  test("pointer with target type", () => {
    const target: Value = { kind: "number", value: 1, type: numeric("I", 32) };
    const env = new Map<string, Value>();
    env.set("x", target);
    const value: Value = { kind: "pointer", target: "x" };
    const result = valueToType(value, env);
    expect(result.kind).toBe("pointer");
    expect((result as PointerType).inner.kind).toBe("numeric");
  });

  test("pointer without target falls back to void", () => {
    const value: Value = { kind: "pointer", target: "missing" };
    const result = valueToType(value, new Map());
    expect(result.kind).toBe("pointer");
    expect((result as PointerType).inner.kind).toBe("void");
  });

  test("array with type", () => {
    const value: Value = {
      kind: "array",
      elements: [{ kind: "number", value: 1 }],
      type: arrayType(numeric("I", 32), 1),
    };
    const result = valueToType(value, new Map());
    expect(result.kind).toBe("array");
  });

  test("array without type falls back to void", () => {
    const value: Value = {
      kind: "array",
      elements: [{ kind: "number", value: 1 }],
    };
    const result = valueToType(value, new Map());
    expect(result.kind).toBe("array");
    expect((result as MatcherArrayType).inner.kind).toBe("void");
  });

  test("struct with type", () => {
    const value: Value = {
      kind: "struct",
      fields: new Map(),
      type: structType("Point", []),
    };
    const result = valueToType(value, new Map());
    expect(result.kind).toBe("struct");
    expect((result as unknown as MatcherStructType).name).toBe("Point");
  });

  test("struct without type falls back to unknown", () => {
    const value: Value = {
      kind: "struct",
      fields: new Map(),
    };
    const result = valueToType(value, new Map());
    expect(result.kind).toBe("struct");
    expect((result as unknown as MatcherStructType).name).toBe("unknown");
  });

  test("tuple with type", () => {
    const value: Value = {
      kind: "tuple",
      elements: [
        { kind: "number", value: 1 },
        { kind: "number", value: 2 },
      ],
      type: tupleType([numeric("I", 32), numeric("I", 32)]),
    };
    const result = valueToType(value, new Map());
    expect(result.kind).toBe("tuple");
  });

  test("tuple without type falls back to void", () => {
    const value: Value = {
      kind: "tuple",
      elements: [{ kind: "number", value: 1 }],
    };
    const result = valueToType(value, new Map());
    expect(result.kind).toBe("tuple");
    expect((result as MatcherTupleType).elements[0]?.kind).toBe("void");
  });

  test("enum", () => {
    const value: Value = { kind: "enum", enum: "Color", variant: "Red" };
    const result = valueToType(value, new Map());
    expect(result.kind).toBe("enum");
    expect(
      (result as { kind: "enum"; name: string; variant: string }).name,
    ).toBe("Color");
  });
});

describe("valueMatchesType", () => {
  test("number matches same type", () => {
    const value: Value = { kind: "number", value: 42, type: numeric("I", 32) };
    expect(valueMatchesType(value, numeric("I", 32), new Map())).toBe(true);
  });

  test("number does not match different type", () => {
    const value: Value = { kind: "number", value: 42, type: numeric("I", 32) };
    expect(valueMatchesType(value, numeric("U", 8), new Map())).toBe(false);
  });

  test("boolean matches", () => {
    const value: Value = { kind: "boolean", value: true };
    expect(valueMatchesType(value, bool(), new Map())).toBe(true);
  });

  test("null matches", () => {
    const value: Value = { kind: "null" };
    expect(valueMatchesType(value, { kind: "null" }, new Map())).toBe(true);
  });

  test("void matches", () => {
    const value: Value = { kind: "void" };
    expect(valueMatchesType(value, voidType(), new Map())).toBe(true);
  });

  test("pointer matches with compatible inner type", () => {
    const target: Value = { kind: "number", value: 1, type: numeric("I", 32) };
    const env = new Map<string, Value>();
    env.set("x", target);
    const value: Value = { kind: "pointer", target: "x" };
    expect(valueMatchesType(value, pointer(numeric("I", 32)), env)).toBe(true);
  });

  test("pointer does not match different inner type", () => {
    const target: Value = { kind: "number", value: 1, type: numeric("I", 32) };
    const env = new Map<string, Value>();
    env.set("x", target);
    const value: Value = { kind: "pointer", target: "x" };
    expect(valueMatchesType(value, pointer(numeric("U", 8)), env)).toBe(false);
  });

  test("array matches with same length and inner type", () => {
    const value: Value = {
      kind: "array",
      elements: [{ kind: "number", value: 1 }],
      type: arrayType(numeric("I", 32), 1),
    };
    expect(
      valueMatchesType(value, arrayType(numeric("I", 32), 1), new Map()),
    ).toBe(true);
  });

  test("array does not match different length", () => {
    const value: Value = {
      kind: "array",
      elements: [{ kind: "number", value: 1 }],
      type: arrayType(numeric("I", 32), 1),
    };
    expect(
      valueMatchesType(value, arrayType(numeric("I", 32), 2), new Map()),
    ).toBe(false);
  });

  test("struct matches same name", () => {
    const value: Value = {
      kind: "struct",
      fields: new Map(),
      type: structType("Point", []),
    };
    expect(valueMatchesType(value, structType("Point", []), new Map())).toBe(
      true,
    );
  });

  test("struct does not match different name", () => {
    const value: Value = {
      kind: "struct",
      fields: new Map(),
      type: structType("Point", []),
    };
    expect(valueMatchesType(value, structType("Circle", []), new Map())).toBe(
      false,
    );
  });

  test("tuple matches same elements", () => {
    const value: Value = {
      kind: "tuple",
      elements: [
        { kind: "number", value: 1 },
        { kind: "number", value: 2 },
      ],
      type: tupleType([numeric("I", 32), numeric("I", 32)]),
    };
    expect(
      valueMatchesType(
        value,
        tupleType([numeric("I", 32), numeric("I", 32)]),
        new Map(),
      ),
    ).toBe(true);
  });

  test("tuple does not match different length", () => {
    const value: Value = {
      kind: "tuple",
      elements: [{ kind: "number", value: 1 }],
      type: tupleType([numeric("I", 32)]),
    };
    expect(
      valueMatchesType(
        value,
        tupleType([numeric("I", 32), numeric("I", 32)]),
        new Map(),
      ),
    ).toBe(false);
  });

  test("different kinds never match", () => {
    const value: Value = { kind: "number", value: 42, type: numeric("I", 32) };
    expect(valueMatchesType(value, bool(), new Map())).toBe(false);
  });
});

describe("matchesAnyVariant", () => {
  test("matches first variant", () => {
    const source = numeric("I", 32);
    const union = unionType([numeric("I", 32), bool()]);
    expect(matchesAnyVariant(source, union, (a, b) => a.kind === b.kind)).toBe(
      true,
    );
  });

  test("matches second variant", () => {
    const source = bool();
    const union = unionType([numeric("I", 32), bool()]);
    expect(matchesAnyVariant(source, union, (a, b) => a.kind === b.kind)).toBe(
      true,
    );
  });

  test("does not match any variant", () => {
    const source = nullType();
    const union = unionType([numeric("I", 32), bool()]);
    expect(matchesAnyVariant(source, union, (a, b) => a.kind === b.kind)).toBe(
      false,
    );
  });

  test("non-union returns false", () => {
    const source = numeric("I", 32);
    expect(matchesAnyVariant(source, bool(), (a, b) => a.kind === b.kind)).toBe(
      false,
    );
  });
});
