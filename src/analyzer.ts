import type { Ast, AstType, TypeEnv, Value } from "./types";
import { checkSuffix, checkValueAgainstType } from "./typesystem";

// Semantic analysis — walks the AST once before evaluation, validating
// declarations and recording type information. Does NOT execute anything.
// The evaluator and codegen consume the resulting TypeEnv instead of
// re-deriving type state at runtime.

export function newTypeEnv(): TypeEnv {
  return {
    structs: new Map(),
    enums: new Map(),
    aliases: new Map(),
    inferred: new Map(),
  };
}

// Detect alias cycles eagerly so invalid programs fail before evaluation.
function detectCycle(aliases: Map<string, string>, name: string): void {
  const seen = new Set<string>();
  let current = name;
  while (aliases.has(current)) {
    current = aliases.get(current)!;
    if (seen.has(current)) throw new Error(`circular type alias: ${current}`);
    seen.add(current);
  }
}

function resolveTypeName(aliases: Map<string, string>, name: string): string {
  let current = name;
  while (aliases.has(current)) current = aliases.get(current)!;
  return current;
}

// Resolve an AstType's alias references in place (used to keep inferred
// types canonical).
function resolveAstType(aliases: Map<string, string>, t: AstType): AstType {
  if (t.kind === "primitive") return { kind: "primitive", name: resolveTypeName(aliases, t.name) };
  if (t.kind === "array")
    return { kind: "array", elementType: resolveAstType(aliases, t.elementType), length: t.length };
  if (t.kind === "slice") return { kind: "slice", elementType: resolveAstType(aliases, t.elementType) };
  if (t.kind === "struct")
    return {
      kind: "struct",
      fields: t.fields.map((f) => ({ name: f.name, type: resolveAstType(aliases, f.type) })),
    };
  if (t.kind === "union")
    return { kind: "union", types: t.types.map((m) => resolveAstType(aliases, m)) };
  if (t.kind === "ref") return { kind: "ref", targetType: resolveAstType(aliases, t.targetType) };
  return t;
}

export function analyze(ast: Ast, typeEnv: TypeEnv): void {
  switch (ast.kind) {
    case "num":
      if (ast.suffix) checkSuffix(ast.suffix, ast.value);
      break;
    case "block":
      for (const stmt of ast.statements) if (stmt) analyze(stmt, typeEnv);
      break;
    case "let":
      analyze(ast.value, typeEnv);
      if (ast.typeAnnotation) {
        typeEnv.inferred.set(ast.name, resolveAstType(typeEnv.aliases, ast.typeAnnotation));
      } else {
        // No annotation — record the literal's type when statically known.
        const t = literalType(ast.value);
        if (t) typeEnv.inferred.set(ast.name, t);
      }
      break;
    case "inlet":
      if (ast.typeAnnotation) {
        typeEnv.inferred.set(ast.name, resolveAstType(typeEnv.aliases, ast.typeAnnotation));
      }
      break;
    case "unary": {
      // References can only be taken of identifiers (structural check).
      if (ast.op === "&" || ast.op === "&mut") {
        if (ast.operand.kind !== "ident") {
          throw new Error("can only take reference of identifier");
        }
      }
      analyze(ast.operand, typeEnv);
      break;
    }
    case "yield":
      // `yield` always requires a value (structural check).
      if (ast.value === undefined) throw new Error("yield has no value");
      analyze(ast.value, typeEnv);
      break;
    case "fn":
      for (const p of ast.params) {
        typeEnv.inferred.set(p.name, resolveAstType(typeEnv.aliases, p.type));
      }
      analyze(ast.body, typeEnv);
      break;
    case "typealias": {
      typeEnv.aliases.set(ast.name, ast.baseType);
      detectCycle(typeEnv.aliases, ast.name);
      break;
    }
    case "structdef":
      typeEnv.structs.set(ast.name, ast.fields);
      break;
    case "enumdef":
      typeEnv.enums.set(ast.name, ast.variants);
      break;
    case "structliteral": {
      // Validate fields when the struct is known locally. Unknown names may
      // be module instantiation (`lib { x : 100 }`) resolved at runtime, so
      // only throw for field issues, not unknown structs.
      const def = typeEnv.structs.get(ast.typeName);
      if (def) {
        for (const f of ast.fields) {
          analyze(f.value, typeEnv);
          const fieldDef = def.find((d) => d.name === f.key);
          if (!fieldDef) throw new Error(`unknown field ${f.key} on struct ${ast.typeName}`);
          // Check literal values against the field type at analysis time.
          const lit = literalValue(f.value);
          if (lit !== undefined) {
            checkValueAgainstType(lit, fieldDef.type, "assign", f.key);
          }
        }
      } else {
        for (const f of ast.fields) analyze(f.value, typeEnv);
      }
      break;
    }
    default:
      // Walk generic Ast children so nested expressions are analyzed.
      for (const v of Object.values(ast)) {
        if (Array.isArray(v)) {
          for (const x of v) {
            if (x && typeof x === "object" && "kind" in x) analyze(x as Ast, typeEnv);
          }
        } else if (v && typeof v === "object" && "kind" in v) {
          analyze(v as Ast, typeEnv);
        }
      }
      break;
  }
}

// Statically known literal type for a value expression, if any.
function literalType(node: Ast): AstType | undefined {
  switch (node.kind) {
    case "num":
      return { kind: "primitive", name: node.suffix ?? "number" };
    case "bool":
      return { kind: "primitive", name: "bool" };
    case "char":
      return { kind: "primitive", name: "number" };
    case "string":
      return { kind: "primitive", name: "string" };
    case "null":
      return { kind: "primitive", name: "null" };
    default:
      return undefined;
  }
}

// Convert a static literal AST to its runtime Value, or undefined if the
// expression isn't a literal (analysis-time type checks only apply to literals).
function literalValue(node: Ast): Value | undefined {
  switch (node.kind) {
    case "num":
      return { tag: "number", num: node.value, type: node.suffix };
    case "bool":
      return { tag: "bool", val: node.value };
    case "char":
      return { tag: "number", num: node.value.charCodeAt(0) };
    case "string":
      return { tag: "string", value: node.value };
    case "null":
      return { tag: "null" };
    default:
      return undefined;
  }
}
