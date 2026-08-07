import type { Ast, AstType, TypeEnv } from "./types";
import { suffixRanges } from "./typesystem";
import { typeEquals as typeEqualsCodegen } from "./asttype";

// Compiler — emits JS for a program, with `args` as a free variable.
// The test harness executes the emitted JS with `args` bound to runtime args.
// Mutable (`let mut`) bindings compile to `{ v }` cells so `&mut` references
// can write through them; immutable bindings stay plain values.

// True if the AST reads the `args` input (an identifier named "args").
export function referencesArgs(node: Ast): boolean {
  if (node.kind === "ident") return node.name === "args";
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) {
      if (v.some((x) => x && typeof x === "object" && "kind" in x && referencesArgs(x as Ast))) return true;
    } else if (v && typeof v === "object" && "kind" in v) {
      if (referencesArgs(v as Ast)) return true;
    }
  }
  return false;
}

// Compile a program into JS statements ending in `process.exit(<value>);`.
export function compileAst(ast: Ast, typeEnv?: TypeEnv): string {
  if (ast.kind === "block") {
    const stmts = ast.statements.filter((s) => s !== null);
    if (stmts.length === 0) return "process.exit(0);";
    // If the program has non-`args` `in let` inputs, defer the whole body
    // into an `__init__` function that binds them from the runtime args
    // object (mirrors the evaluator's moduleInputs). The `inlet` statement
    // case emits the binding; `args` stays a free variable, so it's excluded.
    const hasInlets = stmts.some(
      (s) => s.kind === "inlet" && s.name !== "args",
    );
    if (hasInlets) {
      const body = stmts.map((s) => genStatement(s!, typeEnv)).join("\n");
      return (
        "module.exports.__init__ = function(__args__) {\n" +
        body +
        "\n};\n" +
        "process.exit(0);"
      );
    }
    const body = stmts.slice(0, -1).map((s) => genStatement(s!, typeEnv));
    return body.join("\n") + "\nprocess.exit(" + toNumJs(genValue(stmts[stmts.length - 1]!, typeEnv)) + ");";
  }
  return "process.exit(" + toNumJs(genValue(ast, typeEnv)) + ");";
}

// Coerce a JS expression to a number (mirrors the evaluator's toNum).
// Unwraps suffixed-number objects ({ v, t }) to their numeric value.
function toNumJs(expr: string): string {
  return "Number((" + expr + " && typeof (" + expr + ") === 'object' && 'v' in (" + expr + ")) ? (" + expr + ").v : (" + expr + "))";
}

// Produce a JS expression for a node that may be a statement (block value).
function genValue(node: Ast, typeEnv?: TypeEnv): string {
  switch (node.kind) {
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
      // Statements as the block value: execute, then yield 0 (toNum(null) = 0).
      return "(function() { " + genStatement(node, typeEnv) + " return 0; })()";
    case "return":
    case "yield":
      // Control flow as the block value: execute (throw/return), then yield 0.
      return "(function() { " + genStatement(node, typeEnv) + " return 0; })()";
    case "break":
    case "continue":
      // Loop control as the block value: a statement-only block with flow.
      return "(function() { " + genStatement(node, typeEnv) + " return 0; })()";
    default:
      return genExpr(node, typeEnv);
  }
}

// Emit a `let` binding's value, propagating the annotation type to a
// plain-number literal (mirrors the evaluator's type propagation). For
// `let x : Bool | I32 = 100`, the union picks I32 and marks the value.
function genLetValue(node: Extract<Ast, { kind: "let" }>, typeEnv?: TypeEnv): string {
  const expr = genExpr(node.value, typeEnv);
  if (!node.typeAnnotation || node.value.kind !== "num" || node.value.suffix) {
    return expr;
  }
  const ann = resolveAstTypeName(typeEnv, node.typeAnnotation);
  // Suffixed primitive annotation → mark the literal.
  if (ann.kind === "primitive" && ann.name !== "number") {
    return "{ v: " + node.value.value + ", __t: " + JSON.stringify(ann.name) + " }";
  }
  // Union annotation → pick the suffixed primitive member that fits the value.
  if (ann.kind === "union") {
    const val = node.value.value;
    const member = ann.types.find((m) => {
      if (m.kind !== "primitive") return false;
      const resolved = resolveAstTypeName(typeEnv, m);
      if (resolved.kind !== "primitive") return false;
      const range = suffixRanges[resolved.name];
      return range !== undefined && val >= range[0] && val <= range[1];
    });
    if (member && member.kind === "primitive") {
      return "{ v: " + node.value.value + ", __t: " + JSON.stringify(member.name) + " }";
    }
  }
  return expr;
}

function genStatement(node: Ast, typeEnv?: TypeEnv): string {
  const isMut = (name: string): boolean => typeEnv?.mutables.get(name) === true;
  switch (node.kind) {
    case "inlet":
      // `args` is a free variable provided by the runtime — declaration only.
      // Other `in let` inputs bind from the runtime args object (`__args__`),
      // which is in scope when the body is wrapped in `__init__`.
      return node.name === "args" ? "" : "var " + node.name + " = __args__." + node.name + ";";
    case "block":
      return "{ " + node.statements.filter((s) => s !== null).map((s) => genStatement(s!, typeEnv)).join(" ") + " }";
    case "let":
      // `var` allows redeclaration (the evaluator overwrites silently);
      // mutable bindings become cells so `&mut` can write through them.
      // Type annotations propagate to plain-number values (mirrors the
      // evaluator's type propagation: `let x : Bool | I32 = 100` → x is I32).
      // Exported (`out let`) bindings are also assigned to module.exports.
      {
        const decl = isMut(node.name)
          ? "var " + node.name + " = { v: " + genLetValue(node, typeEnv) + " };"
          : "var " + node.name + " = " + genLetValue(node, typeEnv) + ";";
        if (node.exported) {
          return decl + " module.exports." + node.name + " = " + (isMut(node.name) ? node.name + ".v" : node.name) + ";";
        }
        return decl;
      }
    case "assign":
      return (isMut(node.name) ? node.name + ".v" : node.name) + " = " + genExpr(node.value, typeEnv) + ";";
    case "augassign":
      return (isMut(node.name) ? node.name + ".v" : node.name) + " " + node.op + "= " + genExpr(node.value, typeEnv) + ";";
    case "refassign": {
      const target = genExpr({ kind: "ident", name: node.name }, typeEnv);
      return "(" + target + ").v = " + genExpr(node.value, typeEnv) + ";";
    }
    case "array_assign":
      return "(" + genExpr(node.target, typeEnv) + ")[" + genExpr(node.index, typeEnv) + "] = " + genExpr(node.value, typeEnv) + ";";
    case "fn": {
      const params = node.params.map((p) => p.name).join(", ");
      const decl =
        "function " +
        node.name +
        "(" +
        params +
        ") { try { return " +
        genExpr(node.body, typeEnv) +
        "; } catch (e) { if (e && e.__return) return e.value; throw e; } }";
      if (node.exported) {
        return decl + " module.exports." + node.name + " = " + node.name + ";";
      }
      return decl;
    }
    case "if_stmt": {
      const elseCode = node.elseBranch ? " else " + genStatement(node.elseBranch, typeEnv) : "";
      return "if (" + genExpr(node.cond, typeEnv) + ") " + genStatement(node.thenBranch, typeEnv) + elseCode;
    }
    case "while":
      return "while (" + genExpr(node.cond, typeEnv) + ") " + genStatement(node.body, typeEnv);
    case "for": {
      const isMutVar = typeEnv?.mutables.get(node.varName) === true;
      const v = isMutVar ? node.varName + ".v" : node.varName;
      return (
        "for (let " +
        node.varName +
        (isMutVar ? " = { v: (" : " = (") +
        genExpr(node.start, typeEnv) +
        ") }; " +
        v +
        " < (" +
        genExpr(node.end, typeEnv) +
        "); " +
        v +
        "++) " +
        genStatement(node.body, typeEnv)
      );
    }
    case "return":
      // Return unwinds to the fn boundary (bypasses surrounding expressions),
      // so it's emitted as a thrown sentinel caught by the fn wrapper.
      return "throw { __return: true, value: " + (node.value ? genExpr(node.value, typeEnv) : "0") + " };";
    case "yield":
      // Yield is block-local: return from the enclosing IIFE/block.
      return "return " + genExpr(node.value, typeEnv) + ";";
    case "break":
      return "break;";
    case "continue":
      return "continue;";
    case "typealias":
    case "structdef":
    case "enumdef":
      // Type declarations are erased at runtime.
      return "";
    default:
      return genExpr(node, typeEnv) + ";";
  }
}

function genExpr(node: Ast, typeEnv?: TypeEnv): string {
  const isMut = (name: string): boolean => typeEnv?.mutables.get(name) === true;
  switch (node.kind) {
    case "num":
      // Suffixed literals preserve their type at runtime so `is` checks work
      // (e.g. `if (c) 100U8 else 100U16; x is U8`). Unsuffixed stay plain.
      return node.suffix ? `{ v: ${node.value}, __t: ${JSON.stringify(node.suffix)} }` : String(node.value);
    case "bool":
      return node.value ? "true" : "false";
    case "char":
      return JSON.stringify(node.value) + ".charCodeAt(0)";
    case "string":
      return JSON.stringify(node.value);
    case "null":
      return "0";
    case "ident":
      return isMut(node.name) ? node.name + ".v" : node.name;
    case "inlet":
      return node.name === "args" ? "args" : "0";
    case "binop": {
      const l = genExpr(node.left, typeEnv);
      const r = genExpr(node.right, typeEnv);
      const ln = toNumJs(l);
      const rn = toNumJs(r);
      // == / !=: compare raw values (===), unwrapping suffixed-number objects.
      if (node.op === "==") return "(Number((" + l + ") === (" + r + ")))";
      if (node.op === "!=") return "(Number((" + l + ") !== (" + r + ")))";
      // < <= > >=: the evaluator compares strings lexicographically, else
      // numerically — JS < does exactly that, unwrapped for suffixed numbers.
      if (node.op === "<" || node.op === "<=" || node.op === ">" || node.op === ">=")
        return "(Number((" + l + ") " + node.op + " (" + r + ")))";
      // + - * / %: numeric (unwrapped suffixed-number objects).
      return "((" + ln + ") " + node.op + " (" + rn + "))";
    }
    case "unary": {
      const operand = genExpr(node.operand, typeEnv);
      if (node.op === "-" || node.op === "!") return "(" + node.op + "(" + operand + "))";
      // &mut x — alias the cell itself so `*y = v` writes through.
      if (node.op === "&mut") {
        return node.operand.kind === "ident" && isMut(node.operand.name)
          ? "(" + node.operand.name + ")"
          : "(" + operand + ")";
      }
      // &x / *y — references alias their target's value.
      return "(" + operand + ")";
    }
    case "index": {
      const target = genExpr(node.target, typeEnv);
      const idx = genExpr(node.index, typeEnv);
      // String indexing yields the char code; array/tuple yields the element.
      return '((typeof (' + target + ')[' + idx + '] === "string") ? (' + target + ')[' + idx + '].charCodeAt(0) : (' + target + ')[' + idx + '])';
    }
    case "length":
      return "((" + genExpr(node.target, typeEnv) + ").length)";
    case "property_access":
      return "((" + genExpr(node.target, typeEnv) + ")." + node.property + ")";
    case "namespace": {
      // Enum variant: Color::Red encodes as "Color::Red" (string compare).
      return JSON.stringify(node.segments.join("::"));
    }
    case "typecheck":
      return genTypecheck(node, typeEnv);
    case "paren":
      return "(" + genExpr(node.expr, typeEnv) + ")";
    case "array":
      return "[" + node.elements.map((e) => genExpr(e, typeEnv)).join(", ") + "]";
    case "tuple":
      return "[" + node.elements.map((e) => genExpr(e, typeEnv)).join(", ") + "]";
    case "record":
      return "({" + node.fields.map((f) => f.key + ": " + genExpr(f.value, typeEnv)).join(", ") + "})";
    case "structliteral": {
      // Named struct literals carry a `__t` marker so `is` checks work at
      // runtime (e.g. `if (c) A {} else B {}; x is A`).
      const fields = node.fields.map((f) => f.key + ": " + genExpr(f.value, typeEnv));
      return "({ __t: " + JSON.stringify(node.typeName) + ", " + fields.join(", ") + "})";
    }
    case "call": {
      const target = node.target ? genExpr(node.target, typeEnv) : node.name;
      return "(" + target + ")(" + node.args.map((a) => genExpr(a, typeEnv)).join(", ") + ")";
    }
    case "if_expr":
      return "(" + genExpr(node.cond, typeEnv) + " ? " + genExpr(node.thenBranch, typeEnv) + " : " + genExpr(node.elseBranch, typeEnv) + ")";
    case "match": {
      const matchVal = genExpr(node.expr, typeEnv);
      let js = "0";
      for (let i = node.cases.length - 1; i >= 0; i--) {
        const c = node.cases[i]!;
        const cond = c.pattern.kind === "wildcard" ? "true" : "((" + genExpr(c.pattern, typeEnv) + ") === (" + matchVal + "))";
        js = "(" + cond + " ? " + genExpr(c.body, typeEnv) + " : " + js + ")";
      }
      return js;
    }
    case "block": {
      const stmts = node.statements.filter((s) => s !== null);
      if (stmts.length === 0) return "0";
      const body = stmts.slice(0, -1).map((s) => genStatement(s!, typeEnv));
      return "(function() { " + body.join(" ") + " return " + genValue(stmts[stmts.length - 1]!, typeEnv) + "; })()";
    }
    case "fn": {
      const params = node.params.map((p) => p.name).join(", ");
      return (
        "(function " +
        node.name +
        "(" +
        params +
        ") { try { return " +
        genExpr(node.body, typeEnv) +
        "; } catch (e) { if (e && e.__return) return e.value; throw e; } })"
      );
    }
    default:
      throw new Error("cannot compile " + node.kind + " in args-dependent code");
  }
}

// Substitute a value expression into a `$0` template without regex replace
// (plain split/join — immune to any `$` escaping quirks).
function sub(template: string, value: string): string {
  return template.split("$0").join(value);
}

// Compile an `is` type check. Folds when the value's type is statically known
// (literal suffix or inferred binding); otherwise falls back to tag checks.
function genTypecheck(node: Extract<Ast, { kind: "typecheck" }>, typeEnv?: TypeEnv): string {
  const resolvedType = resolveAstTypeName(typeEnv, node.type);
  if (resolvedType.kind === "union") {
    // Fold when the value's inferred type is a subset of the checked union
    // (e.g. x's inferred U8 | U16 against `is U8 | U16`).
    if (node.value.kind === "ident") {
      const inferred = typeEnv?.inferred.get(node.value.name);
      if (inferred) {
        const resolved = resolveAstTypeName(typeEnv, inferred);
        if (resolved.kind === "union") {
          const subset = resolved.types.every((m) =>
            resolvedType.types.some((c) => typeEqualsCodegen(m, c)),
          );
          if (subset) return "1";
          const overlap = resolved.types.some((m) =>
            resolvedType.types.some((c) => typeEqualsCodegen(m, c)),
          );
          if (!overlap) return "0";
        }
      }
    }
    // Union type: the value matches if it matches any member.
    const memberChecks = resolvedType.types.map((m) =>
      genTypecheck({ ...node, type: m }, typeEnv),
    );
    // OR of member checks, coercing to 0/1.
    return memberChecks.reduce(
      (acc, c) => "(Number(" + acc + " !== 0 || " + c + " !== 0))",
      "0",
    );
  }
  const t = resolveType(typeEnv, node.type);
  const value = node.value;
  if (value.kind === "num" && value.suffix) {
    return value.suffix === t ? "1" : "0";
  }
  if (value.kind === "num" && !value.suffix) {
    return t === "number" ? "1" : "0";
  }
  if (value.kind === "bool") {
    return t === "bool" ? "1" : "0";
  }
  if (value.kind === "string") {
    return t === "string" ? "1" : "0";
  }
  if (value.kind === "null") {
    return t === "null" ? "1" : "0";
  }
  if (value.kind === "tuple") {
    return t === "tuple" ? "1" : "0";
  }
  if (value.kind === "record" || value.kind === "structliteral") {
    return t === "record" ? "1" : "0";
  }
  if (value.kind === "array") {
    return t === "array" ? "1" : "0";
  }
  if (value.kind === "ident") {
    const inferred = typeEnv?.inferred.get(value.name);
    if (inferred) {
      const resolved = resolveAstTypeName(typeEnv, inferred);
      // Union value type: fold when it's a subset of the checked type
      // (e.g. `x is U8 | U16` where x's inferred type is U8 | U16).
      if (resolved.kind === "union") {
        const resUnion = resolved;
        const subset = resUnion.types.every((m) => typeEqualsCodegen(m, resolvedType));
        if (subset) return "1";
        // Disjoint: no overlap → the value can never match.
        const overlap = resUnion.types.some((m) => typeEqualsCodegen(m, resolvedType));
        if (!overlap) return "0";
      } else {
        // Single inferred type.
        const r = describeResolved(resolved);
        if (r === t) return "1";
        if (r !== undefined && r !== "number") return "0";
      }
    }
  }
  const v = genExpr(value, typeEnv);
  const tagChecks: Record<string, string> = {
    bool: '((typeof ($0) === "boolean") ? 1 : 0)',
    string: '((typeof ($0) === "string") ? 1 : 0)',
    array: "((Array.isArray($0)) ? 1 : 0)",
    tuple: "((Array.isArray($0)) ? 1 : 0)",
    record: '((typeof ($0) === "object" && $0 !== null && !Array.isArray($0) && $0.__t === undefined) ? 1 : 0)',
    null: "(($0 === null) ? 1 : 0)",
    number: '((typeof ($0) === "number") ? 1 : 0)',
  };
  // Tag checks are keyed lowercase (bool, string, ...), matching the
  // evaluator's valueMatchesType which lowercases the type name.
  const tag = tagChecks[t.toLowerCase()];
  if (tag) return sub(tag, v);
  // Typed value (named struct, suffixed number, enum): check the `__t` marker.
  // A value only matches if it was produced by a literal of that exact type.
  return sub("((($0) && typeof ($0) === 'object' && ($0).__t === " + JSON.stringify(t) + ") ? 1 : 0)", v);
}

// Resolve a type's alias references (mirrors analyzer's resolveAstType).
function resolveAstTypeName(typeEnv: TypeEnv | undefined, t: AstType): AstType {
  const aliases = typeEnv?.aliases;
  if (aliases === undefined) return t;
  if (t.kind === "primitive") {
    let name = t.name;
    while (aliases.has(name)) name = aliases.get(name)!;
    return { kind: "primitive", name };
  }
  if (t.kind === "array") return { kind: "array", elementType: resolveAstTypeName(typeEnv, t.elementType), length: t.length };
  if (t.kind === "slice") return { kind: "slice", elementType: resolveAstTypeName(typeEnv, t.elementType) };
  if (t.kind === "struct") return { kind: "struct", fields: t.fields.map((f) => ({ name: f.name, type: resolveAstTypeName(typeEnv, f.type) })) };
  if (t.kind === "union") return { kind: "union", types: t.types.map((m) => resolveAstTypeName(typeEnv, m)) };
  if (t.kind === "ref") return { kind: "ref", targetType: resolveAstTypeName(typeEnv, t.targetType) };
  if (t.kind === "tuple") return { kind: "tuple", elements: t.elements.map((e) => resolveAstTypeName(typeEnv, e)) };
  if (t.kind === "fn")
    return { kind: "fn", params: t.params.map((p) => resolveAstTypeName(typeEnv, p)), returnType: resolveAstTypeName(typeEnv, t.returnType) };
  return t;
}

function resolveType(typeEnv: TypeEnv | undefined, t: AstType): string {
  const r = resolveAstTypeName(typeEnv, t);
  if (r.kind === "primitive") return r.name;
  if (r.kind === "array") return "array";
  if (r.kind === "slice") return "array";
  if (r.kind === "tuple") return "tuple";
  if (r.kind === "struct") return "record";
  if (r.kind === "union") return "union";
  if (r.kind === "ref") return "ref";
  return "number";
}

function describeResolved(t: AstType): string | undefined {
  if (t.kind === "primitive") return t.name;
  if (t.kind === "array" || t.kind === "slice") return "array";
  if (t.kind === "tuple") return "tuple";
  if (t.kind === "struct") return "record";
  if (t.kind === "union") return "union";
  if (t.kind === "ref") return "ref";
  return undefined;
}
