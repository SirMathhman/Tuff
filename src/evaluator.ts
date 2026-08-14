import type { AstNode } from "./ast";
import type { IntTypeName } from "./types";
import { Environment, deref, num, toNumber } from "./environment";
import type { Value } from "./environment";
import { Break, Continue, Yield, Return } from "./control-flow";
import { checkType } from "./type-checker";
import {
  evalLiteral,
  evalCollection,
  evalReference,
  evalStruct,
  evalOperator,
  resolveLValue,
  writeLValue,
  compareEqual,
  evalTupleAccess,
  evalMatch,
  resolveScopeField,
  evalModuleAccess,
} from "./eval-helpers";

/** Evaluate a function body, catching Yield/Return, returning Value. */
function evalFnBodyValue(body: AstNode, fnEnv: Environment): Value {
  try {
    return evalValue(body, fnEnv);
  } catch (e) {
    if (e instanceof Yield) return num(e.value);
    if (e instanceof Return) return num(e.value);
    throw e;
  }
}

/** Evaluate a function body, catching Yield/Return, returning number. */
function evalFnBodyNum(body: AstNode, fnEnv: Environment): number {
  try {
    return evaluate(body, fnEnv);
  } catch (e) {
    if (e instanceof Yield) return e.value;
    if (e instanceof Return) return e.value;
    throw e;
  }
}

/** Evaluate a node and return the raw Value instead of unwrapping to number. */
function evalValue(node: AstNode, env: Environment): Value {
  switch (node.type) {
    case "num":
    case "bool":
    case "char":
    case "string":
    case "null":
      return evalLiteral(node);
    case "this": {
      const typeName = env.getThisTypeName();
      if (typeName) {
        return { kind: "this", typeName, env };
      }
      return { kind: "scope", env };
    }
    case "this-type": {
      return { kind: "this", typeName: node.typeName, env };
    }
    case "id": {
      const v = env.get(node.name);
      if (v === undefined) throw new Error("Undefined variable: " + node.name);
      return v;
    }
    case "array-literal":
    case "array-index":
    case "range":
      return evalCollection(node, env, evaluate, evalValue);
    case "ref":
    case "deref":
      return evalReference(node, env, evalValue);
    case "struct-literal":
    case "struct-access":
      return evalStruct(node, env, evalValue);
    case "scope-access": {
      const scope = evalValue(node.scope, env);
      if (scope.kind === "this") {
        return resolveScopeField(scope, node.field);
      }
      if (scope.kind !== "scope")
        throw new Error("Cannot access scope on non-scope value");
      return resolveScopeField(scope, node.field);
    }
    case "module-access": {
      return num(evalModuleAccess(node.moduleName, node.fieldName, env));
    }
    case "tuple-literal": {
      const elements = node.elements.map((el) => evalValue(el, env));
      return { kind: "tuple", elements };
    }
    case "tuple-access":
      return evalTupleAccess(node, env, evalValue);
    case "binop":
    case "unop":
    case "cast":
      return evalOperator(node, env, evaluate, evalValue);
    case "fnref": {
      const fn = env.getFunction(node.name);
      if (fn === undefined) throw new Error("Undefined function: " + node.name);
      return { kind: "fnref", fn };
    }
    case "fn-def": {
      env.declareFunction(node.name, {
        params: node.params,
        body: node.body,
        returnType: node.returnType,
      });
      return {
        kind: "fnref",
        fn: {
          params: node.params,
          body: node.body,
          returnType: node.returnType,
        },
      };
    }
    case "lambda": {
      return {
        kind: "fnref",
        fn: {
          params: node.params,
          body: node.body,
          returnType: node.returnType ?? { kind: "name", name: "i32" },
        },
      };
    }
    case "fn-call": {
      const { fn, fnEnv } = setupFnCall(node, env);
      return evalFnBodyValue(fn.body, fnEnv);
    }
    case "this-fn-call": {
      const { fn, fnEnv } = setupThisFnCall(node, env);
      return evalFnBodyValue(fn.body, fnEnv);
    }
    case "method-call": {
      const { fn, fnEnv } = setupMethodCall(node, env);
      return evalFnBodyValue(fn.body, fnEnv);
    }
    case "block": {
      if (node.statements.length === 0) throw new Error("Empty block");
      const blockEnv = new Environment(env);
      let last: Value = num(0);
      let hasValue = false;
      for (const stmt of node.statements) {
        if (stmt.type !== "let") {
          hasValue = true;
        }
        try {
          if (stmt.type === "let") {
            last = num(evaluate(stmt, blockEnv));
          } else {
            last = evalValue(stmt, blockEnv);
          }
        } catch (e) {
          if (e instanceof Yield) return num(e.value);
          if (e instanceof Return) throw e;
          throw e;
        }
      }
      if (!hasValue) throw new Error("Block has no value");
      return last;
    }
    case "if-statement":
    case "if-expression":
    case "for-loop":
    case "while-loop":
    case "match":
    case "enum-access":
    case "type-check":
      return delegateToEvaluate(node, env);
    default:
      throw new Error(`evalValue does not handle node type: ${node.type}`);
  }
}

/** Delegate to evaluate() and wrap result in num(). */
function delegateToEvaluate(node: AstNode, env: Environment): Value {
  return num(evaluate(node, env));
}

export function evaluateStatements(
  statements: AstNode[],
  env: Environment,
): number {
  let last = 0;
  for (const stmt of statements) {
    last = evaluate(stmt, env);
  }
  return last;
}

/** Evaluate literal nodes (num, bool, char, string) to a number. */
function evalLiteralNum(node: AstNode): number {
  switch (node.type) {
    case "num":
      return node.value;
    case "bool":
      return node.value ? 1 : 0;
    case "char":
      return node.value.charCodeAt(0);
    case "string":
      return 0;
    default:
      throw new Error(`Unexpected literal: ${node.type}`);
  }
}

/** Evaluate operator nodes (unop, binop) to a number. */
function evalOperatorNum(node: AstNode, env: Environment): number {
  switch (node.type) {
    case "unop":
      return -evaluate(node.operand, env);
    case "binop": {
      try {
        const leftVal = evalValue(node.left, env);
        const rightVal = evalValue(node.right, env);
        if (node.op === "==") return compareEqual(leftVal, rightVal) ? 1 : 0;
        if (node.op === "!=") return compareEqual(leftVal, rightVal) ? 0 : 1;
        const left = toNumber(leftVal);
        const right = toNumber(rightVal);
        const isFloat =
          (leftVal.kind === "number" && leftVal.isFloat) ||
          (rightVal.kind === "number" && rightVal.isFloat);
        switch (node.op) {
          case "+":
            return left + right;
          case "-":
            return left - right;
          case "*":
            return left * right;
          case "/":
            return isFloat ? left / right : Math.trunc(left / right);
          case "&&":
            return left && right;
          case "||":
            return left || right;
          case "<":
            return left < right ? 1 : 0;
          case "<=":
            return left <= right ? 1 : 0;
          case ">":
            return left > right ? 1 : 0;
          case ">=":
            return left >= right ? 1 : 0;
        }
        break;
      } catch (e) {
        if (e instanceof Return) throw e;
        throw e;
      }
    }
    default:
      throw new Error(`Unexpected operator: ${node.type}`);
  }
}

/** Evaluate assignment nodes (let, assign, compoundassign). */
function evalAssignment(node: AstNode, env: Environment): number {
  switch (node.type) {
    case "let": {
      if (
        node.value.type === "if-expression" &&
        (node.value.thenBranch.type === "block" ||
          node.value.elseBranch.type === "block")
      ) {
        throw new Error(
          "if/else with block branches cannot be used as expression",
        );
      }
      const value = evalValue(node.value, env);
      env.declare(node.name, value, node.mutable);
      return 0;
    }
    case "assign": {
      const value = evaluate(node.value, env);
      writeLValue(node.lvalue, env, num(value), evaluate);
      return value;
    }
    case "compoundassign": {
      const current = toNumber(
        resolveLValue(node.lvalue, env, false, evaluate),
      );
      const rhs = evaluate(node.value, env);
      const compoundValue = node.op === "+" ? current + rhs : current - rhs;
      writeLValue(node.lvalue, env, num(compoundValue), evaluate);
      return compoundValue;
    }
    default:
      throw new Error(`Unexpected assignment: ${node.type}`);
  }
}

/** Evaluate control flow nodes (if, while, for, break, continue). */
function evalControlFlow(node: AstNode, env: Environment): number {
  switch (node.type) {
    case "if-statement":
    case "if-expression": {
      const condition = evaluate(node.condition, env);
      if (condition !== 0) {
        try {
          return evaluate(node.thenBranch, env);
        } catch (e) {
          if (e instanceof Yield || e instanceof Return) throw e;
          throw e;
        }
      }
      return evaluate(node.elseBranch, env);
    }
    case "while-loop": {
      while (evaluate(node.condition, env)) {
        try {
          evaluate(node.body, env);
        } catch (e) {
          if (e instanceof Break) break;
          if (e instanceof Continue) continue;
          throw e;
        }
      }
      return 0;
    }
    case "for-loop": {
      const iterableVal = evalValue(node.iterable, env);
      const elements: Value[] =
        iterableVal.kind === "range"
          ? Array.from(
              { length: iterableVal.end - iterableVal.start },
              (_, i) => num(iterableVal.start + i),
            )
          : iterableVal.kind === "array"
            ? iterableVal.elements
            : [];
      for (const elem of elements) {
        try {
          env.declare(node.variable, elem, false);
          evaluate(node.body, env);
        } catch (e) {
          if (e instanceof Break) break;
          if (e instanceof Continue) continue;
          throw e;
        }
      }
      return 0;
    }
    case "break":
      throw new Break();
    case "continue":
      throw new Continue();
    case "yield":
      throw new Yield(evaluate(node.value, env));
    case "return":
      throw new Return(evaluate(node.value, env));
    default:
      throw new Error(`Unexpected control flow: ${node.type}`);
  }
}

/** Evaluate type operation nodes (cast, type-check, type-alias). */
function evalTypeOp(node: AstNode, env: Environment): number {
  switch (node.type) {
    case "cast": {
      const value = evalValue(node.expression, env);
      const numValue = value.kind === "number" ? value.value : toNumber(value);
      return toNumber(
        num(numValue, node.typeName.toLowerCase() as IntTypeName),
      );
    }
    case "type-check": {
      const val = evalValue(node.operand, env);
      return checkType(val, node.typeNode, env, evaluate, num) ? 1 : 0;
    }
    case "type-alias": {
      env.declareTypeAlias(node.name, node.typeNode);
      return 0;
    }
    default:
      throw new Error(`Unexpected type operation: ${node.type}`);
  }
}

/** Evaluate struct/array nodes to a number. */
function evalCollectionNum(node: AstNode, env: Environment): number {
  switch (node.type) {
    case "array-literal":
      return 0;
    case "array-index": {
      const arrayVal = evalValue(node.array, env);
      const index = evaluate(node.index, env);
      if (arrayVal.kind !== "array")
        throw new Error("Cannot index non-array value");
      const result = arrayVal.elements[index];
      if (result === undefined)
        throw new Error(`Array index out of bounds: ${index}`);
      return toNumber(result);
    }
    case "struct-literal":
      return 0;
    case "struct-access": {
      const structVal = evalValue(node.struct, env);
      if (structVal.kind === "this") {
        return toNumber(resolveScopeField(structVal, node.field));
      }
      if (node.field === "length" && structVal.kind === "array") {
        return structVal.elements.length;
      }
      if (structVal.kind !== "struct")
        throw new Error("Cannot access field on non-struct value");
      const field = structVal.fields[node.field];
      if (field === undefined)
        throw new Error(`Field not found: ${node.field}`);
      return toNumber(field);
    }
    case "scope-access": {
      const scopeVal = evalValue(node.scope, env);
      if (scopeVal.kind === "this") {
        return toNumber(resolveScopeField(scopeVal, node.field));
      }
      if (scopeVal.kind !== "scope")
        throw new Error("Cannot access scope on non-scope value");
      return toNumber(resolveScopeField(scopeVal, node.field));
    }
    default:
      throw new Error(`Unexpected collection: ${node.type}`);
  }
}

/** Evaluate function nodes (fn-def, fnref, fn-call). */
function evalFunction(node: AstNode, env: Environment): number {
  switch (node.type) {
    case "fn-def": {
      env.declareFunction(node.name, {
        params: node.params,
        returnType: node.returnType,
        body: node.body,
        env,
      });
      return 0;
    }
    case "fnref":
      return 0;
    case "fn-call": {
      const { fn, fnEnv } = setupFnCall(node, env);
      return evalFnBodyNum(fn.body, fnEnv);
    }
    case "this-fn-call": {
      const { fn, fnEnv } = setupThisFnCall(node, env);
      return evalFnBodyNum(fn.body, fnEnv);
    }
    case "method-call": {
      const { fn, fnEnv } = setupMethodCall(node, env);
      return evalFnBodyNum(fn.body, fnEnv);
    }
    default:
      throw new Error(`Unexpected function: ${node.type}`);
  }
}

/** Resolve a function call and return the function def + environment. */
function setupFnCall(
  node: import("./ast").FnCall,
  env: Environment,
): { fn: import("./environment").FnDef; fnEnv: Environment } {
  const calleeVal = env.get(node.name);
  let fn: import("./environment").FnDef;
  if (calleeVal?.kind === "fnref") {
    fn = calleeVal.fn;
  } else {
    const namedFn = env.getFunction(node.name);
    if (namedFn === undefined)
      throw new Error("Undefined function: " + node.name);
    fn = namedFn;
  }
  return createFnEnv(fn, node.name, node.args, env);
}

/** Resolve a `this` function call and return the function def + environment. */
function setupThisFnCall(
  node: import("./ast").ThisFnCall,
  env: Environment,
): { fn: import("./environment").FnDef; fnEnv: Environment } {
  const fn = env.getFunction(node.name);
  if (!fn) throw new Error("Undefined function: " + node.name);
  return createFnEnv(fn, node.name, node.args, env);
}

/** Resolve a method call on a scope/this receiver. */
function setupMethodCall(
  node: import("./ast").MethodCall,
  env: Environment,
): { fn: import("./environment").FnDef; fnEnv: Environment } {
  const receiver = evalValue(node.receiver, env);
  if (receiver.kind !== "this" && receiver.kind !== "scope")
    throw new Error("Cannot call method on non-scope value");
  const fn = receiver.env.getFunction(node.name);
  if (!fn) throw new Error("Undefined function: " + node.name);
  return createFnEnv(fn, node.name, node.args, receiver.env);
}

/** Create a function environment with bound arguments. */
function createFnEnv(
  fn: import("./environment").FnDef,
  fnName: string,
  args: AstNode[],
  env: Environment,
): { fn: import("./environment").FnDef; fnEnv: Environment } {
  const fnEnv = new Environment(fn.env ?? env);
  fnEnv.setThisTypeName(fnName);
  if (fn.params.length !== args.length)
    throw new Error(
      `Function expects ${fn.params.length} arguments, got ${args.length}`,
    );
  for (let i = 0; i < fn.params.length; i++) {
    fnEnv.declare(fn.params[i]!.name, evalValue(args[i]!, env), false);
  }
  return { fn, fnEnv };
}

export function evaluate(node: AstNode, env: Environment): number {
  switch (node.type) {
    case "num":
    case "bool":
    case "char":
      return evalLiteralNum(node);
    case "id": {
      const value = env.get(node.name);
      if (value === undefined)
        throw new Error("Undefined variable: " + node.name);
      if (value.kind === "ref") return deref(value.ref);
      return toNumber(value);
    }
    case "unop":
    case "binop":
      return evalOperatorNum(node, env);
    case "let":
    case "assign":
    case "compoundassign":
      return evalAssignment(node, env);
    case "if-statement":
    case "if-expression":
    case "while-loop":
    case "for-loop":
    case "break":
    case "continue":
    case "yield":
    case "return":
      return evalControlFlow(node, env);
    case "cast":
    case "type-check":
    case "type-alias":
      return evalTypeOp(node, env);
    case "array-literal":
    case "array-index":
    case "struct-literal":
    case "struct-access":
    case "scope-access":
      return evalCollectionNum(node, env);
    case "fn-def":
    case "fnref":
    case "fn-call":
    case "this-fn-call":
    case "method-call":
      return evalFunction(node, env);
    case "deref":
      return evaluate(node.operand, env);
    case "ref":
      return 0;
    case "this":
    case "this-type":
      return 0;
    case "block": {
      if (node.statements.length === 0) throw new Error("Empty block");
      const blockEnv = new Environment(env);
      let last = 0;
      let hasValue = false;
      for (const stmt of node.statements) {
        if (stmt.type !== "let") {
          hasValue = true;
        }
        try {
          last = evaluate(stmt, blockEnv);
        } catch (e) {
          if (e instanceof Yield) return e.value;
          if (e instanceof Return) throw e;
          throw e;
        }
      }
      if (!hasValue) throw new Error("Block has no value");
      return last;
    }
    case "range":
      return 0;
    case "enum-def": {
      env.declareEnum(node.name, node.variants);
      return 0;
    }
    case "enum-access": {
      const variants = env.getEnum(node.enumName);
      if (!variants) {
        throw new Error(`Unknown enum: ${node.enumName}`);
      }
      const idx = variants.indexOf(node.variant);
      if (idx === -1) {
        throw new Error(`Unknown variant: ${node.variant}`);
      }
      return idx;
    }
    case "module-access":
      return evalModuleAccess(node.moduleName, node.fieldName, env);
    case "match":
      return evalMatch(node, env, evaluate, evalValue);
    case "tuple-literal":
      return 0;
    case "tuple-access":
      return toNumber(evalTupleAccess(node, env, evalValue));
    default:
      return 0;
  }
}
