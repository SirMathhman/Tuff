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
    mutables: new Map(),
    exports: new Map(),
    inputs: new Map(),
    fns: new Map(),
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
  if (t.kind === "tuple") return { kind: "tuple", elements: t.elements.map((e) => resolveAstType(aliases, e)) };
  return t;
}

export function analyze(
  ast: Ast,
  typeEnv: TypeEnv,
  opts?: { moduleNames?: Set<string>; moduleEnvs?: Map<string, TypeEnv> },
): void {
  // Static scope stack mirroring the evaluator's runtime scopes.
  // Each scope is the set of declared names; lookups walk backward.
  const scopes: Set<string>[] = [new Set()];
  const moduleNames = opts?.moduleNames;
  const moduleEnvs = opts?.moduleEnvs;
  const declared = (name: string): boolean =>
    scopes.some((s) => s.has(name)) ||
    name === "args" ||
    (moduleNames !== undefined && moduleNames.has(name));
  analyzeNode(ast, typeEnv, scopes, declared, moduleNames, moduleEnvs);
}

function analyzeNode(
  ast: Ast,
  typeEnv: TypeEnv,
  scopes: Set<string>[],
  declared: (name: string) => boolean,
  moduleNames?: Set<string>,
  moduleEnvs?: Map<string, TypeEnv>,
): void {
  switch (ast.kind) {
    case "num":
      if (ast.suffix) checkSuffix(ast.suffix, ast.value);
      break;
    case "block":
      scopes.push(new Set());
      for (const stmt of ast.statements)
        if (stmt) analyzeNode(stmt, typeEnv, scopes, declared, moduleNames, moduleEnvs);
      scopes.pop();
      break;
    case "let":
      // RHS is analyzed before the name enters scope (order-sensitive).
      analyzeNode(ast.value, typeEnv, scopes, declared, moduleNames, moduleEnvs);
      // A block with a statement-only body has no value (e.g. { let y = 100; }).
      if (ast.value.kind === "block" && !blockHasValue(ast.value)) {
        throw new Error("block has no value");
      }
      typeEnv.mutables.set(ast.name, ast.mutable);
      scopes[scopes.length - 1]!.add(ast.name);
      if (ast.typeAnnotation) {
        typeEnv.inferred.set(ast.name, resolveAstType(typeEnv.aliases, ast.typeAnnotation));
        // Validate literal values against the annotation at analysis time.
        const lit = literalValue(ast.value);
        if (lit !== undefined) {
          checkValueAgainstType(lit, ast.typeAnnotation, "assign", ast.name);
        }
      } else {
        // No annotation — record the value's type when statically known.
        const t = literalType(ast.value) ?? staticType(ast.value, typeEnv);
        if (t) typeEnv.inferred.set(ast.name, t);
      }
      if (ast.exported) {
        typeEnv.exports.set(ast.name, typeEnv.inferred.get(ast.name) ?? { kind: "primitive", name: "number" });
      }
      break;
    case "inlet":
      typeEnv.mutables.set(ast.name, false);
      scopes[scopes.length - 1]!.add(ast.name);
      if (ast.typeAnnotation) {
        typeEnv.inferred.set(ast.name, resolveAstType(typeEnv.aliases, ast.typeAnnotation));
        typeEnv.inputs.set(ast.name, resolveAstType(typeEnv.aliases, ast.typeAnnotation));
      }
      break;
    case "assign": {
      analyzeNode(ast.value, typeEnv, scopes, declared, moduleNames, moduleEnvs);
      // Assigning requires a mutable binding (scope-insensitive by name).
      if (!typeEnv.mutables.get(ast.name)) {
        throw new Error(`cannot assign to immutable variable: ${ast.name}`);
      }
      break;
    }
    case "augassign": {
      analyzeNode(ast.value, typeEnv, scopes, declared, moduleNames, moduleEnvs);
      if (!typeEnv.mutables.get(ast.name)) {
        throw new Error(`cannot assign to immutable variable: ${ast.name}`);
      }
      break;
    }
    case "ident":
      if (!declared(ast.name)) {
        throw new Error(`undeclared variable: ${ast.name}`);
      }
      break;
    case "unary": {
      // References can only be taken of identifiers (structural check).
      if (ast.op === "&" || ast.op === "&mut") {
        if (ast.operand.kind !== "ident") {
          throw new Error("can only take reference of identifier");
        }
      }
      analyzeNode(ast.operand, typeEnv, scopes, declared, moduleNames, moduleEnvs);
      // Negating a suffixed literal must stay in range (e.g. -100U8 errors).
      if (ast.op === "-" && ast.operand.kind === "num" && ast.operand.suffix) {
        checkSuffix(ast.operand.suffix, -ast.operand.value);
      }
      // Dereference requires a ref-typed operand when statically known.
      if (ast.op === "*") {
        const t = staticType(ast.operand, typeEnv);
        if (t && t.kind !== "ref") {
          throw new Error("cannot dereference non-reference");
        }
      }
      break;
    }
    case "index": {
      analyzeNode(ast.target, typeEnv, scopes, declared, moduleNames, moduleEnvs);
      analyzeNode(ast.index, typeEnv, scopes, declared, moduleNames, moduleEnvs);
      // Indexing requires an array/slice/string/tuple/ref target when known.
      const t = staticType(ast.target, typeEnv);
      if (t) {
        const ok =
          t.kind === "array" ||
          t.kind === "slice" ||
          t.kind === "tuple" ||
          t.kind === "ref" ||
          (t.kind === "primitive" && t.name === "string");
        if (!ok) throw new Error(`cannot index ${describeType(t)}`);
      }
      break;
    }
    case "length": {
      analyzeNode(ast.target, typeEnv, scopes, declared, moduleNames, moduleEnvs);
      const t = staticType(ast.target, typeEnv);
      if (t) {
        const ok =
          t.kind === "array" ||
          t.kind === "slice" ||
          t.kind === "ref" ||
          (t.kind === "primitive" && t.name === "string");
        if (!ok) throw new Error(`cannot get length of ${describeType(t)}`);
      }
      break;
    }
    case "yield":
      // `yield` always requires a value (structural check).
      if (ast.value === undefined) throw new Error("yield has no value");
      analyzeNode(ast.value, typeEnv, scopes, declared, moduleNames, moduleEnvs);
      break;
    case "fn":
      // The fn name binds in the enclosing scope (before the body runs),
      // enabling recursion. Params are immutable bindings in a nested scope;
      // the body also sees the enclosing scopes (closures capture them).
      scopes[scopes.length - 1]!.add(ast.name);
      typeEnv.mutables.set(ast.name, false);
      typeEnv.fns.set(ast.name, { params: ast.params });
      if (ast.exported) {
        typeEnv.exports.set(ast.name, { kind: "primitive", name: "fn" });
      }
      scopes.push(new Set());
      for (const p of ast.params) {
        typeEnv.mutables.set(p.name, false);
        typeEnv.inferred.set(p.name, resolveAstType(typeEnv.aliases, p.type));
        scopes[scopes.length - 1]!.add(p.name);
      }
      analyzeNode(ast.body, typeEnv, scopes, declared, moduleNames, moduleEnvs);
      scopes.pop();
      break;
    case "for":
      // Loop variable is mutable in a nested scope.
      scopes.push(new Set());
      typeEnv.mutables.set(ast.varName, true);
      scopes[scopes.length - 1]!.add(ast.varName);
      analyzeNode(ast.start, typeEnv, scopes, declared, moduleNames, moduleEnvs);
      analyzeNode(ast.end, typeEnv, scopes, declared, moduleNames, moduleEnvs);
      analyzeNode(ast.body, typeEnv, scopes, declared, moduleNames, moduleEnvs);
      scopes.pop();
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
    case "namespace": {
      // Enum variant: Color::Red. If the full path is neither a known
      // module nor an enum variant, it's an undeclared namespace.
      const name = ast.segments.join("::");
      const isModule = moduleNames !== undefined && moduleNames.has(name);
      const isEnum =
        ast.segments.length === 2 && typeEnv.enums.has(ast.segments[0]!);
      if (!isModule && !isEnum) {
        throw new Error(`undeclared namespace: ${name}`);
      }
      break;
    }
    case "property_access": {
      analyzeNode(ast.target, typeEnv, scopes, declared, moduleNames, moduleEnvs);
      // Module field access: lib.x — validate x is exported by lib.
      if (
        ast.target.kind === "ident" &&
        moduleNames !== undefined &&
        moduleNames.has(ast.target.name) &&
        moduleEnvs !== undefined
      ) {
        const moduleEnv = moduleEnvs.get(ast.target.name);
        if (moduleEnv && !moduleEnv.exports.has(ast.property)) {
          throw new Error(`field ${ast.property} not found`);
        }
      }
      break;
    }
    case "structliteral": {
      // Validate fields when the struct is known locally. Unknown names that
      // aren't modules are unknown structs; module instantiation (`lib { x : 100 }`)
      // is resolved at runtime.
      const def = typeEnv.structs.get(ast.typeName);
      if (def) {
        for (const f of ast.fields) {
          analyzeNode(f.value, typeEnv, scopes, declared, moduleNames, moduleEnvs);
          const fieldDef = def.find((d) => d.name === f.key);
          if (!fieldDef) throw new Error(`unknown field ${f.key} on struct ${ast.typeName}`);
          // Check literal values against the field type at analysis time.
          const lit = literalValue(f.value);
          if (lit !== undefined) {
            checkValueAgainstType(lit, fieldDef.type, "assign", f.key);
          }
        }
      } else {
        const isModule = moduleNames !== undefined && moduleNames.has(ast.typeName);
        if (!isModule) {
          throw new Error(`unknown struct: ${ast.typeName}`);
        }
        // Module instantiation: validate provided inputs against the module's
        // declared `in let` variables.
        const moduleEnv = moduleEnvs !== undefined ? moduleEnvs.get(ast.typeName) : undefined;
        if (moduleEnv) {
          for (const f of ast.fields) {
            if (!moduleEnv.inputs.has(f.key)) {
              throw new Error(`unknown input ${f.key} on module ${ast.typeName}`);
            }
          }
        }
        for (const f of ast.fields) analyzeNode(f.value, typeEnv, scopes, declared, moduleNames, moduleEnvs);
      }
      break;
    }
    case "call": {
      for (const a of ast.args) analyzeNode(a, typeEnv, scopes, declared, moduleNames, moduleEnvs);
      // Validate literal args against the target fn's param types.
      const fnName = ast.target && ast.target.kind === "ident" ? ast.target.name : !ast.target ? ast.name : undefined;
      if (fnName !== undefined && typeEnv.fns.has(fnName)) {
        const fn = typeEnv.fns.get(fnName)!;
        fn.params.forEach((p, i) => {
          const arg = ast.args[i];
          if (arg) {
            const lit = literalValue(arg);
            if (lit !== undefined) {
              checkValueAgainstType(lit, p.type, "pass", p.name);
            }
          }
        });
      }
      break;
    }
    default:
      // Walk generic Ast children so nested expressions are analyzed.
      for (const v of Object.values(ast)) {
        if (Array.isArray(v)) {
          for (const x of v) {
            if (x && typeof x === "object" && "kind" in x) analyzeNode(x as Ast, typeEnv, scopes, declared, moduleNames, moduleEnvs);
          }
        } else if (v && typeof v === "object" && "kind" in v) {
          analyzeNode(v as Ast, typeEnv, scopes, declared, moduleNames, moduleEnvs);
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

// Compute an expression's type when statically known (literals, inferred
// variables, and composites of those). Returns undefined when not determinable.
function staticType(node: Ast, typeEnv: TypeEnv): AstType | undefined {
  switch (node.kind) {
    case "num":
    case "bool":
    case "char":
    case "string":
    case "null":
      return literalType(node);
    case "ident": {
      const t = typeEnv.inferred.get(node.name);
      if (t) return resolveAstType(typeEnv.aliases, t);
      return undefined;
    }
    case "unary":
      // Deref of a known ref yields the target type.
      if (node.op === "*") {
        const t = staticType(node.operand, typeEnv);
        if (t && t.kind === "ref") return t.targetType;
      }
      return undefined;
    case "array":
      return { kind: "slice", elementType: staticType(node.elements[0]!, typeEnv) ?? { kind: "primitive", name: "number" } };
    case "record":
      return {
        kind: "struct",
        fields: node.fields.map((f) => ({
          name: f.key,
          type: staticType(f.value, typeEnv) ?? { kind: "primitive", name: "number" },
        })),
      };
    case "paren":
      return staticType(node.expr, typeEnv);
    case "if_expr": {
      // When both branches have the same static type, that's the result type.
      const thenT = staticType(node.thenBranch, typeEnv);
      const elseT = staticType(node.elseBranch, typeEnv);
      if (thenT && elseT && typeEquals(thenT, elseT)) return thenT;
      return undefined;
    }
    case "match": {
      // If every case body has the same static type, that's the result type.
      const bodies = node.cases.map((c) => staticType(c.body, typeEnv));
      const first = bodies[0];
      if (first && bodies.every((b) => b && typeEquals(b, first))) return first;
      return undefined;
    }
    default:
      return undefined;
  }
}

// Structural equality for AstType (after alias resolution).
function typeEquals(a: AstType, b: AstType): boolean {
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
  }
}

// Human-readable name for an AstType (for error messages).
function describeType(t: AstType): string {
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
  }
}

// True if a block's last statement produces a value (not null/flow control).
function blockHasValue(node: Ast): boolean {
  if (node.kind !== "block") return true;
  const stmts = node.statements.filter((s) => s !== null);
  if (stmts.length === 0) return false;
  const last = stmts[stmts.length - 1]!;
  switch (last.kind) {
    case "let":
    case "assign":
    case "augassign":
    case "refassign":
    case "array_assign":
    case "fn":
    case "inlet":
    case "typealias":
    case "structdef":
    case "enumdef":
    case "while":
    case "for":
    case "break":
    case "continue":
      return false;
    default:
      return true;
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
