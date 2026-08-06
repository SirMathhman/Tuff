import type { Ast, Scope, Value } from "./types";
import { isControlFlow } from "./types";
import { applyBinOp, bool, eq, notOp, num, toNum, truthy } from "./values";
import { checkSuffix, checkValueAgainstType, defineEnum, defineStruct, defineTypeAlias, getEnumVariants, getStructFields, resolveAstType, suffixRanges, valueMatchesType } from "./typesystem";

// Evaluator — walks AST with scope
export function evalAst(
  ast: Ast,
  scopes: Scope[],
  mutables: Scope["mutable"][],
  exports?: Record<string, Value>,
  moduleLoader?: (name: string, inputs?: Record<string, Value>) => Value | null,
  moduleInputs?: Record<string, Value>,
): Value {
  function lookup(name: string): Value {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (name in scopes[i]!.vars) return scopes[i]!.vars[name]!;
    }
    if (moduleLoader) {
      const loaded = moduleLoader(name);
      if (loaded !== null) return loaded;
    }
    throw new Error(`undeclared variable: ${name}`);
  }
  function isMutable(name: string): boolean {
    for (let i = mutables.length - 1; i >= 0; i--) {
      if (name in mutables[i]!) return mutables[i]![name]!;
    }
    return false;
  }
  function setVar(name: string, value: Value): void {
    if (!isMutable(name))
      throw new Error(`cannot assign to immutable variable: ${name}`);
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (name in scopes[i]!.vars) {
        scopes[i]!.vars[name] = value;
        return;
      }
    }
  }

  // Evaluate an optional value expression and throw a control-flow signal.
  // `kind` is "return" or "yield". A missing value yields null for return.
  function throwControlFlow(
    kind: "return" | "yield",
    node: Extract<Ast, { kind: "return" | "yield" }>,
  ): never {
    if (node.value === undefined) {
      if (kind === "return") throw { kind: "return", value: { tag: "null" } };
      throw new Error("yield has no value");
    }
    const v = visit(node.value);
    if (v === null) throw new Error(`${kind} has no value`);
    throw { kind, value: v };
  }

  function visit(node: Ast): Value | null {
    switch (node.kind) {
      case "num": {
        if (node.suffix) checkSuffix(node.suffix, node.value);
        return num(node.value, node.suffix);
      }
      case "bool":
        return bool(node.value);
      case "ident":
        return lookup(node.name);
      case "namespace": {
        const name = node.segments.join("::");
        if (moduleLoader) {
          const loaded = moduleLoader(name);
          if (loaded !== null) return loaded;
        }
        // Enum variant: Color::Red
        if (node.segments.length === 2) {
          const [enumName, variant] = node.segments;
          const variants = getEnumVariants(enumName!);
          if (variants && variants.includes(variant!)) {
            return { tag: "enum", typeName: enumName!, variant: variant! };
          }
        }
        throw new Error(`undeclared namespace: ${name}`);
      }
      case "unary": {
        const v = visit(node.operand)!;
        if (node.op === "!") return notOp(v);
        if (node.op === "-") {
          const negated = -toNum(v);
          // If operand is a suffixed literal, validate the negated value
          if (node.operand.kind === "num" && node.operand.suffix) {
            checkSuffix(node.operand.suffix, negated);
          }
          return num(negated, v.tag === "number" ? v.type : undefined);
        }
        if (node.op === "&") {
          // Create a reference to the operand
          if (node.operand.kind === "ident") {
            const scope = scopes[scopes.length - 1]!;
            return {
              tag: "ref",
              scope,
              name: node.operand.name,
              mutable: false,
            };
          }
          throw new Error("can only take reference of identifier");
        }
        if (node.op === "&mut") {
          // Create a mutable reference to the operand
          if (node.operand.kind === "ident") {
            const scope = scopes[scopes.length - 1]!;
            return {
              tag: "ref",
              scope,
              name: node.operand.name,
              mutable: true,
            };
          }
          throw new Error("can only take reference of identifier");
        }
        if (node.op === "*") {
          // Dereference
          if (v.tag === "ref") return v.scope.vars[v.name]!;
          throw new Error("cannot dereference non-reference");
        }
        return v;
      }
      case "binop": {
        const l = visit(node.left)!;
        const r = visit(node.right)!;
        return applyBinOp(node.op, l, r);
      }
      case "inlet": {
        // Bind an input value provided at module instantiation.
        const inputVal = moduleInputs?.[node.name];
        if (inputVal === undefined)
          throw new Error(`missing input: ${node.name}`);
        if (node.typeAnnotation)
          checkValueAgainstType(inputVal, node.typeAnnotation, "pass", node.name);
        scopes[scopes.length - 1]!.vars[node.name] = inputVal;
        return null;
      }
      case "let": {
        let v = visit(node.value);
        if (v === null) throw new Error("block has no value");
        if (node.typeAnnotation) {
          const resolvedAnn = resolveAstType(node.typeAnnotation);
          checkValueAgainstType(v, node.typeAnnotation, "assign");
          // Propagate type annotation to the stored value
          if (v.tag === "number" && resolvedAnn.kind === "primitive") {
            v = num(v.num, resolvedAnn.name);
          } else if (v.tag === "number" && resolvedAnn.kind === "union") {
            // Propagate the matched union member's type
            const numVal = v.num;
            const member = resolvedAnn.types.find(
              (t) => t.kind === "primitive" && suffixRanges[t.name] && numVal >= suffixRanges[t.name]![0] && numVal <= suffixRanges[t.name]![1],
            );
            if (member && member.kind === "primitive") {
              v = num(v.num, member.name);
            }
          }
        }
        scopes[scopes.length - 1]!.vars[node.name] = v;
        if (node.mutable) mutables[mutables.length - 1]![node.name] = true;
        if (node.exported && exports) exports[node.name] = v;
        return null;
      }
      case "assign": {
        const v = visit(node.value);
        if (v === null) throw new Error("block has no value");
        setVar(node.name, v);
        return null;
      }
      case "array_assign": {
        const target = visit(node.target);
        if (target === null)
          throw new Error("array assign target has no value");
        if (target.tag !== "array")
          throw new Error("cannot assign to non-array");
        const idx = toNum(visit(node.index)!);
        const v = visit(node.value);
        if (v === null) throw new Error("array assign value has no value");
        target.values[idx] = v;
        return null;
      }
      case "refassign": {
        const ref = lookup(node.name);
        if (ref.tag !== "ref") throw new Error("not a reference");
        if (!ref.mutable)
          throw new Error("cannot assign through immutable reference");
        const v = visit(node.value);
        if (v === null) throw new Error("block has no value");
        ref.scope.vars[ref.name] = v;
        return null;
      }
      case "augassign": {
        const v = visit(node.value);
        if (v === null) throw new Error("block has no value");
        const existing = lookup(node.name);
        setVar(node.name, applyBinOp(node.op, existing, v));
        return null;
      }
      case "block": {
        scopes.push({ vars: {}, mutable: {} });
        mutables.push({});
        let value: Value | null = null;
        try {
          for (const stmt of node.statements) {
            if (stmt) value = visit(stmt);
          }
        } catch (e) {
          if (isControlFlow(e) && e.kind === "yield") {
            scopes.pop();
            mutables.pop();
            return e.value;
          }
          throw e;
        }
        scopes.pop();
        mutables.pop();
        return value;
      }
      case "paren":
        return visit(node.expr);
      case "if_expr": {
        const cond = visit(node.cond)!;
        if (truthy(cond)) return visit(node.thenBranch);
        return visit(node.elseBranch);
      }
      case "if_stmt": {
        const cond = visit(node.cond)!;
        if (truthy(cond)) return visit(node.thenBranch);
        return node.elseBranch ? visit(node.elseBranch) : num(0);
      }
      case "while": {
        let iterations = 0;
        while (true) {
          if (iterations++ > 10000) throw new Error("infinite loop detected");
          try {
            if (!truthy(visit(node.cond)!)) break;
            visit(node.body);
          } catch (e) {
            if (isControlFlow(e)) {
              if (e.kind === "continue") continue;
              if (e.kind === "break") break;
            }
            throw e;
          }
        }
        return null;
      }
      case "for": {
        const startVal = toNum(visit(node.start)!);
        const endVal = toNum(visit(node.end)!);
        scopes.push({ vars: {}, mutable: {} });
        mutables.push({});
        scopes[scopes.length - 1]!.vars[node.varName] = num(0);
        mutables[mutables.length - 1]![node.varName] = true;
        let iterations = 0;
        try {
          for (let i = startVal; i < endVal; i++) {
            if (iterations++ > 10000) throw new Error("infinite loop detected");
            scopes[scopes.length - 1]!.vars[node.varName] = num(i);
            try {
              visit(node.body);
            } catch (e) {
              if (isControlFlow(e)) {
                if (e.kind === "continue") continue;
                if (e.kind === "break") break;
              }
              throw e;
            }
          }
        } finally {
          scopes.pop();
          mutables.pop();
        }
        return null;
      }
      case "continue":
        throw { kind: "continue" };
      case "break":
        throw { kind: "break" };
      case "yield":
        throwControlFlow("yield", node);
        break;
      case "return":
        throwControlFlow("return", node);
        break;
      case "fn": {
        const fnValue = {
          tag: "fn" as const,
          params: node.params,
          body: node.body,
          scopes: [...scopes],
          mutables: [...mutables],
        };
        scopes[scopes.length - 1]!.vars[node.name] = fnValue;
        if (node.exported && exports) exports[node.name] = fnValue;
        return null;
      }
      case "call": {
        const fnVal = node.target ? visit(node.target) : lookup(node.name);
        if (fnVal === null) throw new Error("call target has no value");
        if (fnVal.tag !== "fn") throw new Error("not a function");
        const fn = fnVal;
        const fnScopes = [...fn.scopes, { vars: {}, mutable: {} }];
        const fnMutables = [...fn.mutables, {}];
        const argValues = node.args.map((a) => {
          const v = visit(a);
          if (v === null) throw new Error("argument has no value");
          return v;
        });
        fn.params.forEach((p, i) => {
          const arg = argValues[i]!;
          checkValueAgainstType(arg, p.type, "pass", p.name);
          fnScopes[fnScopes.length - 1]!.vars[p.name] = arg;
        });
        try {
          return evalAst(fn.body, fnScopes, fnMutables);
        } catch (e) {
          if (isControlFlow(e) && e.kind === "return")
            return e.value ?? { tag: "null" };
          throw e;
        }
      }
      case "wildcard":
        return num(0);
      case "null":
        return { tag: "null" };
      case "char":
        return num(node.value.charCodeAt(0));
      case "match": {
        const matchVal = visit(node.expr)!;
        for (const c of node.cases) {
          if (c.pattern.kind === "wildcard") {
            return visit(c.body);
          }
          const patternVal = visit(c.pattern)!;
          if (toNum(eq(matchVal, patternVal)) === 1) {
            return visit(c.body);
          }
        }
        return num(0);
      }
      case "tuple": {
        const values = node.elements.map((e) => {
          const v = visit(e);
          if (v === null) throw new Error("tuple element has no value");
          return v;
        });
        return { tag: "tuple", values };
      }
      case "index": {
        const target = visit(node.target);
        if (target === null) throw new Error("index target has no value");
        if (target.tag !== "tuple") throw new Error("cannot index non-tuple");
        return target.values[node.index]!;
      }
      case "array": {
        const values = node.elements.map((e) => {
          const v = visit(e);
          if (v === null) throw new Error("array element has no value");
          return v;
        });
        return { tag: "array", values };
      }
      case "array_index": {
        const target = visit(node.target);
        if (target === null) throw new Error("array target has no value");
        if (target.tag !== "array") throw new Error("cannot index non-array");
        const idx = toNum(visit(node.index)!);
        return target.values[idx]!;
      }
      case "string":
        return { tag: "string", value: node.value };
      case "string_index": {
        const target = visit(node.target);
        if (target === null) throw new Error("string target has no value");
        if (target.tag !== "string") throw new Error("cannot index non-string");
        const idx = toNum(visit(node.index)!);
        const ch = target.value[idx];
        if (ch === undefined) return num(0);
        return num(ch.charCodeAt(0));
      }
      case "property_access": {
        const target = visit(node.target);
        if (target === null)
          throw new Error("property access target has no value");
        if (target.tag === "record") {
          const val = target.fields[node.property];
          if (val === undefined) throw new Error(`field ${node.property} not found`);
          return val;
        }
        if (target.tag === "struct") {
          const val = target.fields[node.property];
          if (val === undefined) throw new Error(`field ${node.property} not found`);
          return val;
        }
        throw new Error(`cannot access property ${node.property} on ${target.tag}`);
      }
      case "length": {
        const target = visit(node.target);
        if (target === null) throw new Error("length target has no value");
        switch (target.tag) {
          case "string":
            return num(target.value.length);
          case "array":
            return num(target.values.length);
          default:
            throw new Error(`cannot get length of ${target.tag}`);
        }
      }
      case "record": {
        const fields: Record<string, Value> = {};
        for (const f of node.fields) {
          const v = visit(f.value);
          if (v === null) throw new Error("record field has no value");
          fields[f.key] = v;
        }
        return { tag: "record", fields };
      }
      case "typecheck": {
        const v = visit(node.value);
        if (v === null) throw new Error("typecheck value has no value");
        return bool(valueMatchesType(v, node.type));
      }
      case "typealias": {
        defineTypeAlias(node.name, node.baseType);
        return null;
      }
      case "structdef": {
        defineStruct(node.name, node.fields);
        return null;
      }
      case "structliteral": {
        // Module instantiation: lib { x : 100 } — load the module with inputs.
        const structDef = getStructFields(node.typeName);
        if (!structDef && moduleLoader) {
          const inputs: Record<string, Value> = {};
          for (const f of node.fields) {
            const v = visit(f.value);
            if (v === null) throw new Error("struct field has no value");
            inputs[f.key] = v;
          }
          const loaded = moduleLoader(node.typeName, inputs);
          if (loaded !== null) return loaded;
        }
        const fields: Record<string, Value> = {};
        const def = getStructFields(node.typeName);
        if (!def) throw new Error(`unknown struct: ${node.typeName}`);
        for (const f of node.fields) {
          const v = visit(f.value);
          if (v === null) throw new Error("struct field has no value");
          const fieldDef = def.find((d) => d.name === f.key);
          if (!fieldDef) throw new Error(`unknown field ${f.key} on struct ${node.typeName}`);
          checkValueAgainstType(v, fieldDef.type, "assign", f.key);
          fields[f.key] = v;
        }
        return { tag: "struct", typeName: node.typeName, fields };
      }
      case "enumdef": {
        defineEnum(node.name, node.variants);
        return null;
      }
    }
  }
  return visit(ast) ?? num(0);
}
