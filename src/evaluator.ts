import type { Ast, Scope, Value } from "./types";
import { isControlFlow } from "./types";
import { applyBinOp, bool, eq, notOp, num, toNum, truthy } from "./values";
import { checkSuffix, defineTypeAlias, resolveAstType, resolveType, suffixRanges } from "./typesystem";

// Evaluator — walks AST with scope
export function evalAst(
  ast: Ast,
  scopes: Scope[],
  mutables: Scope["mutable"][],
): Value {
  function lookup(name: string): Value {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (name in scopes[i]!.vars) return scopes[i]!.vars[name]!;
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
      case "let": {
        let v = visit(node.value);
        if (v === null) throw new Error("block has no value");
        if (node.typeAnnotation) {
          const resolvedAnn = resolveAstType(node.typeAnnotation);
          if (resolvedAnn.kind === "array") {
            const innerType = resolveAstType(resolvedAnn.elementType);
            const length = resolvedAnn.length;
            if (v.tag !== "array") throw new Error(`expected array, got ${v.tag}`);
            if (v.values.length !== length) throw new Error(`array length mismatch: expected ${length}, got ${v.values.length}`);
            // Validate each element's type
            for (let i = 0; i < v.values.length; i++) {
              const elem = v.values[i]!;
              if (innerType.kind === "primitive" && suffixRanges[innerType.name] && elem.tag === "number") {
                checkSuffix(innerType.name, elem.num);
              }
            }
          } else if (resolvedAnn.kind === "primitive" && suffixRanges[resolvedAnn.name]) {
            checkSuffix(resolvedAnn.name, toNum(v));
            // Check type compatibility using the value's tracked type
            if (v.tag === "number" && v.type && suffixRanges[resolveType(v.type)]) {
              const valRange = suffixRanges[resolveType(v.type)]!;
              const annRange = suffixRanges[resolvedAnn.name]!;
              if (valRange[0] < annRange[0] || valRange[1] > annRange[1]) {
                throw new Error(`cannot assign ${v.type} to ${node.typeAnnotation}`);
              }
            }
          }
          // Propagate type annotation to the stored value
          if (v.tag === "number" && resolvedAnn.kind === "primitive") {
            v = num(v.num, resolvedAnn.name);
          }
        }
        scopes[scopes.length - 1]!.vars[node.name] = v;
        if (node.mutable) mutables[mutables.length - 1]![node.name] = true;
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
      case "yield": {
        const v = visit(node.value);
        if (v === null) throw new Error("yield has no value");
        throw { kind: "yield", value: v };
      }
      case "return": {
        const v = visit(node.value);
        if (v === null) throw new Error("return has no value");
        throw { kind: "return", value: v };
      }
      case "fn": {
        scopes[scopes.length - 1]!.vars[node.name] = {
          tag: "fn",
          params: node.params,
          body: node.body,
          scopes: [...scopes],
          mutables: [...mutables],
        };
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
          fnScopes[fnScopes.length - 1]!.vars[p.name] = argValues[i]!;
        });
        try {
          return evalAst(fn.body, fnScopes, fnMutables);
        } catch (e) {
          if (isControlFlow(e) && e.kind === "return") return e.value;
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
        const resolvedType = resolveAstType(node.type);
        if (resolvedType.kind === "primitive") {
          const typeName = resolvedType.name.toLowerCase();
          if (v.tag === "number" && v.type) {
            const resolvedValueType = resolveType(v.type);
            return bool(resolvedValueType === resolvedType.name);
          }
          const tagMap: Record<string, string> = {
            bool: "bool",
            string: "string",
            tuple: "tuple",
            array: "array",
            record: "record",
            null: "null",
            fn: "fn",
            ref: "ref",
          };
          const tagName = tagMap[typeName];
          if (tagName) return bool(v.tag === tagName);
          return bool(v.tag === "number" && !v.type && resolvedType.name === "number");
        }
        if (resolvedType.kind === "array") {
          if (v.tag !== "array") return bool(false);
          if (v.values.length !== resolvedType.length) return bool(false);
          const innerType = resolveAstType(resolvedType.elementType);
          for (let i = 0; i < v.values.length; i++) {
            const elem = v.values[i]!;
            if (innerType.kind === "primitive") {
              if (innerType.name.toLowerCase() === "number") {
                if (elem.tag !== "number") return bool(false);
              } else if (suffixRanges[innerType.name]) {
                if (elem.tag !== "number" || !elem.type) return bool(false);
                if (resolveType(elem.type) !== innerType.name) return bool(false);
              } else {
                const tagMap: Record<string, string> = {
                  bool: "bool", string: "string", tuple: "tuple",
                  array: "array", record: "record", null: "null", fn: "fn", ref: "ref",
                };
                const tagName = tagMap[innerType.name.toLowerCase()];
                if (tagName && elem.tag !== tagName) return bool(false);
              }
            }
          }
          return bool(true);
        }
        return bool(false);
      }
      case "typealias": {
        defineTypeAlias(node.name, node.baseType);
        return null;
      }
    }
  }
  return visit(ast) ?? num(0);
}
