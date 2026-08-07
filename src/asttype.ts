import type { AstType } from "./types";

// Shared structural-equality and description helpers for AstType.
// These are used by both the analyzer and the codegen, so they live in one
// place to avoid duplicating the recursive type-walking logic.

// Structural equality for AstType (after alias resolution).
export function typeEquals(a: AstType, b: AstType): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "primitive":
      return a.name === (b as Extract<AstType, { kind: "primitive" }>).name;
    case "array":
      return a.length === (b as Extract<AstType, { kind: "array" }>).length && typeEquals(a.elementType, (b as Extract<AstType, { kind: "array" }>).elementType);
    case "slice":
      return typeEquals(a.elementType, (b as Extract<AstType, { kind: "slice" }>).elementType);
    case "tuple":
      return (
        a.elements.length === (b as Extract<AstType, { kind: "tuple" }>).elements.length &&
        a.elements.every((e, i) => typeEquals(e, (b as Extract<AstType, { kind: "tuple" }>).elements[i]!))
      );
    case "struct": {
      const bf = (b as Extract<AstType, { kind: "struct" }>).fields;
      return (
        a.fields.length === bf.length &&
        a.fields.every((f, i) => f.name === bf[i]!.name && typeEquals(f.type, bf[i]!.type))
      );
    }
    case "union": {
      const bt = (b as Extract<AstType, { kind: "union" }>).types;
      return (
        a.types.length === bt.length &&
        a.types.every((m, i) => typeEquals(m, bt[i]!))
      );
    }
    case "ref":
      return typeEquals(a.targetType, (b as Extract<AstType, { kind: "ref" }>).targetType);
    case "fn": {
      const bf = b as Extract<AstType, { kind: "fn" }>;
      return (
        a.params.length === bf.params.length &&
        a.params.every((p, i) => typeEquals(p, bf.params[i]!)) &&
        typeEquals(a.returnType, bf.returnType)
      );
    }
  }
}

// Human-readable name for an AstType (for error messages).
export function describeType(t: AstType): string {
  switch (t.kind) {
    case "primitive":
      return t.name;
    case "array":
      return `[${describeType(t.elementType)}; ${t.length}]`;
    case "slice":
      return `[${describeType(t.elementType)}]`;
    case "struct":
      return "record";
    case "union":
      return t.types.map(describeType).join(" | ");
    case "ref":
      return `&${describeType(t.targetType)}`;
    case "tuple":
      return `(${t.elements.map(describeType).join(", ")})`;
    case "fn":
      return `(${t.params.map(describeType).join(", ")}) => ${describeType(t.returnType)}`;
  }
}
