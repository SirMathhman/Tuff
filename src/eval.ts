/* eslint-disable max-lines */
import {
  parseOperandAt,
  splitTopLevelStatements,
  findMatchingClosingParen,
  parseCommaSeparatedArgs,
} from "./parser";
import {
  validateAnnotation,
  parseFnComponents,
  findMatchingParen,
} from "./interpret_helpers";

export function isTruthy(val: any): boolean {
  if (val && (val as any).boolValue !== undefined)
    return !!(val as any).boolValue;
  if (val && (val as any).valueBig !== undefined)
    return (val as any).valueBig !== 0n;
  if (typeof val === "number") return val !== 0;
  if (val && (val as any).isFloat) return (val as any).floatValue !== 0;
  return false;
}

// Top-level range-check helper for integer suffix arithmetic
export function checkRange(kind: string, bits: number, sum: bigint) {
  if (kind === "u") {
    const max = (1n << BigInt(bits)) - 1n;
    if (sum < 0n || sum > max)
      throw new Error(`value out of range for U${bits}`);
  } else {
    const min = -(1n << BigInt(bits - 1));
    const max = (1n << BigInt(bits - 1)) - 1n;
    if (sum < min || sum > max)
      throw new Error(`value out of range for I${bits}`);
  }
}

// Exported helper to apply a binary arithmetic operator to two operands using the same rules
export function applyBinaryOp(op: string, left: any, right: any): any {
  if (op === "||") {
    if (isTruthy(left)) return { boolValue: true };
    return { boolValue: isTruthy(right) };
  }
  if (op === "&&") {
    if (!isTruthy(left)) return { boolValue: false };
    return { boolValue: isTruthy(right) };
  }

  const leftHasKind = left && (left as any).kind !== undefined;
  const rightHasKind = right && (right as any).kind !== undefined;
  if (leftHasKind || rightHasKind) {
    const ref = leftHasKind ? left : right;
    const kind = (ref as any).kind as string;
    const bits = (ref as any).bits as number;
    if (leftHasKind && rightHasKind) {
      if (
        (left as any).kind !== (right as any).kind ||
        (left as any).bits !== (right as any).bits
      )
        throw new Error("mismatched suffixes in binary operation");
    }
    if (!leftHasKind && (left as any).isFloat)
      throw new Error("mixed suffix and float not allowed");
    if (!rightHasKind && (right as any).isFloat)
      throw new Error("mixed suffix and float not allowed");

    let lBig: bigint;
    if (leftHasKind) lBig = (left as any).valueBig as bigint;
    else if (typeof left === "number") lBig = BigInt(left as number);
    else lBig = (left as any).valueBig as bigint;

    let rBig: bigint;
    if (rightHasKind) rBig = (right as any).valueBig as bigint;
    else if (typeof right === "number") rBig = BigInt(right as number);
    else rBig = (right as any).valueBig as bigint;

    let resBig: bigint;
    if (op === "+") resBig = lBig + rBig;
    else if (op === "-") resBig = lBig - rBig;
    else if (op === "*") resBig = lBig * rBig;
    else if (op === "/") {
      if (rBig === 0n) throw new Error("division by zero");
      resBig = lBig / rBig;
    } else if (op === "%") {
      if (rBig === 0n) throw new Error("modulo by zero");
      resBig = lBig % rBig;
    } else throw new Error("unsupported operator");

    checkRange(kind, bits, resBig);
    return { valueBig: resBig, kind: kind, bits };
  }

  const leftIsBool = left && (left as any).boolValue !== undefined;
  const rightIsBool = right && (right as any).boolValue !== undefined;
  const lNum =
    typeof left === "number"
      ? left
      : (left as any).isFloat
      ? (left as any).floatValue
      : leftIsBool
      ? (left as any).boolValue
        ? 1
        : 0
      : Number((left as any).valueBig);
  const rNum =
    typeof right === "number"
      ? right
      : (right as any).isFloat
      ? (right as any).floatValue
      : rightIsBool
      ? (right as any).boolValue
        ? 1
        : 0
      : Number((right as any).valueBig);
  if (op === "+") return lNum + rNum;
  if (op === "-") return lNum - rNum;
  if (op === "*") return lNum * rNum;
  if (op === "/") return lNum / rNum;
  if (op === "%") return lNum % rNum;
  if (op === "<") return { boolValue: lNum < rNum };
  if (op === ">") return { boolValue: lNum > rNum };
  if (op === "<=") return { boolValue: lNum <= rNum };
  if (op === ">=") return { boolValue: lNum >= rNum };
  if (op === "==") return { boolValue: lNum == rNum };
  if (op === "!=") return { boolValue: lNum != rNum };
  throw new Error("unsupported operator");
}

/**
 * Resolve a function from either a function operand or an identifier name
 */
function resolveFunctionFromOperand(
  operand: any,
  localEnv: Record<string, any>
): any {
  if (operand && (operand as any).fn) {
    return (operand as any).fn;
  } else if (typeof operand === "object" && (operand as any).ident) {
    const name = (operand as any).ident as string;
    if (!(name in localEnv)) throw new Error(`unknown identifier ${name}`);
    const binding = localEnv[name] as any;
    if (!binding || !binding.fn) throw new Error("not a function");
    return binding.fn;
  } else {
    throw new Error("cannot call non-function");
  }
}

/**
 * Execute a function body and return the result
 * Handles both block bodies (executed via interpret) and expression bodies
 */
function executeFunctionBody(fn: any, callEnv: Record<string, any>): any {
  if (fn.isBlock) {
    const inner = fn.body.replace(/^\{\s*|\s*\}$/g, "");
    const v = (globalThis as any).interpret
      ? (globalThis as any).interpret(inner, callEnv)
      : (function () {
          // fallback if interpret is not globally available (module-local call)
          // eslint-disable-next-line no-undef
          const mod = require("./interpret");
          return mod.interpret(inner, callEnv);
        })();
    if (Number.isInteger(v)) return { valueBig: BigInt(v) };
    return { floatValue: v, isFloat: true };
  } else {
    return evaluateReturningOperand(fn.body, callEnv);
  }
}

export function evaluateReturningOperand(
  exprStr: string,
  localEnv: Record<string, any>
): any {
  // Support an 'if' expression: if (condition) trueBranch else falseBranch
  const sTrim = exprStr.trimStart();
  if (/^if\b/.test(sTrim)) {
    // parse: if (cond) trueBranch else falseBranch
    const condStart = sTrim.indexOf("(");
    if (condStart === -1) throw new Error("invalid if syntax: missing (");
    const condEnd = findMatchingParen(sTrim, condStart, "(", ")");
    if (condEnd === -1)
      throw new Error("invalid if syntax: unbalanced parentheses");
    const condStr = sTrim.slice(condStart + 1, condEnd).trim();
    const condVal = evaluateReturningOperand(condStr, localEnv);
    const isTruthy = (() => {
      if (condVal && (condVal as any).boolValue !== undefined)
        return !!(condVal as any).boolValue;
      if (condVal && (condVal as any).valueBig !== undefined)
        return (condVal as any).valueBig !== 0n;
      if (typeof condVal === "number") return condVal !== 0;
      if (condVal && (condVal as any).isFloat)
        return (condVal as any).floatValue !== 0;
      return false;
    })();

    // rest after condition
    let rest = sTrim.slice(condEnd + 1).trim();
    // else could be preceded by braced trueBranch
    let trueBranch = "";
    let falseBranch = "";

    if (rest.startsWith("{")) {
      const bEnd = findMatchingParen(sTrim, sTrim.indexOf(rest), "{", "}");
      if (bEnd === -1) throw new Error("unbalanced braces in if");
      trueBranch = sTrim.slice(sTrim.indexOf(rest), bEnd + 1);
      rest = sTrim.slice(bEnd + 1).trim();
    } else {
      // find the else keyword
      const elseIdx = rest.indexOf(" else ");
      if (elseIdx === -1) throw new Error("if without else");
      trueBranch = rest.slice(0, elseIdx).trim();
      rest = rest.slice(elseIdx + 6).trim(); // " else "
    }

    falseBranch = rest;
    if (!falseBranch) throw new Error("missing else branch");

    return evaluateReturningOperand(
      isTruthy ? trueBranch : falseBranch,
      localEnv
    );
  }

  // Support a 'match' expression: match (<expr>) { case <pat> => <expr>; ... default => <expr>; }
  if (/^match\b/.test(sTrim)) {
    // after 'match', parse the target expression which may be parenthesized or bare
    let afterMatch = sTrim.slice("match".length).trimStart();
    let targetExpr = "";
    let rest = "";
    if (afterMatch.startsWith("(")) {
      const startParen = sTrim.indexOf("(", 0);
      const endParen = findMatchingParen(sTrim, startParen, "(", ")");
      if (endParen === -1) throw new Error("unbalanced parentheses in match");
      targetExpr = sTrim.slice(startParen + 1, endParen).trim();
      rest = sTrim.slice(endParen + 1).trimStart();
    } else {
      // take everything up to the first '{' as the target expression
      const braceIdx = afterMatch.indexOf("{");
      if (braceIdx === -1) throw new Error("invalid match syntax");
      targetExpr = afterMatch.slice(0, braceIdx).trim();
      rest = afterMatch.slice(braceIdx).trimStart();
    }

    const targetOp = evaluateReturningOperand(targetExpr, localEnv);

    if (!rest.startsWith("{")) throw new Error("invalid match block");
    const startBrace = sTrim.indexOf(
      "{",
      sTrim.indexOf(targetExpr) + (targetExpr.length || 0)
    );
    const endBrace = findMatchingParen(sTrim, startBrace, "{", "}");
    if (endBrace === -1) throw new Error("unbalanced braces in match");
    const inner = sTrim.slice(startBrace + 1, endBrace);

    const parts = splitTopLevelStatements(inner)
      .map((p) => p.trim())
      .filter(Boolean);

    let defaultBody: string | null = null;
    for (const part of parts) {
      const caseMatch = part.match(/^case\s+([\s\S]+?)\s*=>\s*([\s\S]*)$/);
      if (caseMatch) {
        const patStr = caseMatch[1].trim();
        const bodyStr = caseMatch[2].trim();
        const patOp = evaluateReturningOperand(patStr, localEnv);
        const eq = applyBinaryOp("==", targetOp, patOp);
        if (eq && (eq as any).boolValue) {
          return evaluateReturningOperand(bodyStr, localEnv);
        } // no match -> continue to next case
        continue;
      }
      const defMatch = part.match(/^default\s*=>\s*([\s\S]*)$/);
      if (defMatch) {
        defaultBody = defMatch[1].trim();
        continue;
      }
      throw new Error("invalid match case");
    }
    if (defaultBody !== null) {
      return evaluateReturningOperand(defaultBody, localEnv);
    }
    return { valueBig: 0n };
  }

  // Support an inline function expression: fn name(...) => ... or fn name(...) { ... }
  if (/^fn\b/.test(sTrim)) {
    const parsed = parseFnComponents(sTrim);
    const { name, params, body, isBlock, resultAnnotation } = parsed;
    const fnObj: any = {
      params,
      body,
      isBlock,
      resultAnnotation,
      closureEnv: null,
    };
    const wrapper = { fn: fnObj };
    fnObj.closureEnv = { ...localEnv };
    // expose named binding inside closure for recursion
    fnObj.closureEnv[name] = wrapper;
    return wrapper;
  }
  const exprTokens: { op?: string; operand?: any }[] = [];
  let pos = 0;
  const L = exprStr.length;
  function skip() {
    while (pos < L && exprStr[pos] === " ") pos++;
  }
  skip();
  const firstMatch = parseOperandAt(exprStr, pos);
  if (!firstMatch) throw new Error("invalid expression");
  exprTokens.push({ operand: firstMatch.operand });
  pos += firstMatch.len;
  skip();
  while (pos < L) {
    skip();
    // Check for function application (e.g., `func()(args)`)
    if (exprStr[pos] === "(") {
      const endIdx = findMatchingClosingParen(exprStr, pos);
      if (endIdx === -1) throw new Error("unbalanced parentheses in call");
      const inner = exprStr.slice(pos + 1, endIdx);
      const args = parseCommaSeparatedArgs(inner);
      exprTokens.push({ op: "call", operand: { callApp: args } });
      pos = endIdx + 1;
      skip();
      continue;
    }
    // Check for field access (e.g., `expr.field`)
    if (exprStr[pos] === ".") {
      pos++;
      // Parse field name
      const fieldMatch = exprStr.slice(pos).match(/^([a-zA-Z_]\w*)/);
      if (!fieldMatch)
        throw new Error("invalid field access: expected field name after .");
      const fieldName = fieldMatch[1];
      // For field access, we use a special "operator" that stores the field name
      // The operand will be added as an empty placeholder to maintain the token structure
      exprTokens.push({ op: `.${fieldName}`, operand: undefined });
      pos += fieldName.length;
      skip();
      continue;
    }
    // support multi-char operators: || && == != <= >=
    let op: string | null = null;
    if (exprStr.startsWith("||", pos)) {
      op = "||";
      pos += 2;
    } else if (exprStr.startsWith("&&", pos)) {
      op = "&&";
      pos += 2;
    } else if (exprStr.startsWith("==", pos)) {
      op = "==";
      pos += 2;
    } else if (exprStr.startsWith("!=", pos)) {
      op = "!=";
      pos += 2;
    } else if (exprStr.startsWith("<=", pos)) {
      op = "<=";
      pos += 2;
    } else if (exprStr.startsWith(">=", pos)) {
      op = ">=";
      pos += 2;
    } else {
      const ch = exprStr[pos];
      if (!/[+\-*/%<>]/.test(ch)) throw new Error("invalid operator");
      op = ch;
      pos++;
    }
    skip();
    const next = parseOperandAt(exprStr, pos);
    if (!next) throw new Error("invalid operand after operator");
    exprTokens.push({ op, operand: next.operand });
    pos += next.len;
    skip();
  }

  // build operands and ops
  let operands = exprTokens.map((t) => t.operand);
  const ops: string[] = [];
  for (let i = 1; i < exprTokens.length; i++) ops.push(exprTokens[i].op!);

  // helper to get binding and deref target
  function getBindingTarget(name: string) {
    if (!(name in localEnv)) throw new Error(`unknown identifier ${name}`);
    const binding = localEnv[name];
    if (binding && (binding as any).uninitialized)
      throw new Error(`use of uninitialized variable ${name}`);
    const targetVal =
      binding && (binding as any).value !== undefined
        ? (binding as any).value
        : binding;
    return { binding, targetVal };
  }

  // resolve identifiers, address-of (&) and dereference (*) from localEnv
  operands = operands.map((op) => {
    // address-of: produce a pointer object referring to the binding name and include target metadata
    if (op && (op as any).addrOf) {
      const inner = (op as any).addrOf;
      if (!inner.ident) throw new Error("& must be applied to identifier");
      const n = inner.ident as string;
      const { targetVal } = getBindingTarget(n);
      const ptrObj: any = { ptrName: n, pointer: true };
      if (targetVal && (targetVal as any).kind) {
        ptrObj.kind = (targetVal as any).kind;
        ptrObj.bits = (targetVal as any).bits;
        ptrObj.valueBig = (targetVal as any).valueBig;
      } else if (targetVal && (targetVal as any).valueBig !== undefined) {
        ptrObj.valueBig = (targetVal as any).valueBig;
      } else if (targetVal && (targetVal as any).isFloat) {
        ptrObj.isFloat = true;
        ptrObj.floatValue = (targetVal as any).floatValue;
      } else if (targetVal && (targetVal as any).boolValue !== undefined) {
        ptrObj.ptrIsBool = true;
        ptrObj.boolValue = (targetVal as any).boolValue;
      } else if (typeof targetVal === "number") {
        // plain numeric -> treat as integer literal-like
        ptrObj.valueBig = BigInt(targetVal as number);
      }
      return ptrObj;
    }

    // dereference: fetch the value pointed to by a pointer (either a named binding or an inline &expr)
    if (op && (op as any).deref) {
      const inner = (op as any).deref;
      // deref of an identifier that holds a pointer
      if (inner && (inner as any).ident) {
        const n = (inner as any).ident as string;
        const { targetVal: val } = getBindingTarget(n);
        if (!val || !(val as any).ptrName)
          throw new Error("cannot dereference non-pointer");
        const targetName = (val as any).ptrName as string;
        const { targetVal } = getBindingTarget(targetName);
        return targetVal;
      }
      // deref of an inline &expr like *(&x)
      if (inner && (inner as any).addrOf) {
        const inr = (inner as any).addrOf;
        if (!inr.ident) throw new Error("& must be applied to identifier");
        const n = inr.ident as string;
        const { targetVal } = getBindingTarget(n);
        return targetVal;
      }
      throw new Error("invalid dereference target");
    }

    // struct instantiation handling
    if (op && (op as any).structInstantiation) {
      const { name: structName, fields: fieldParts } = (op as any)
        .structInstantiation;

      // Look up struct definition
      if (!(structName in localEnv))
        throw new Error(`unknown struct ${structName}`);
      const structDef = localEnv[structName];
      if (!structDef || !(structDef as any).isStructDef)
        throw new Error(`${structName} is not a struct`);

      // Evaluate field values
      const fieldValues: Record<string, any> = {};
      const providedFields = new Set<string>();

      for (const fieldPart of fieldParts) {
        const fieldName = fieldPart.name;
        const fieldValue = evaluateReturningOperand(fieldPart.value, localEnv);

        // Check for duplicate fields
        if (providedFields.has(fieldName))
          throw new Error(`duplicate field ${fieldName}`);
        providedFields.add(fieldName);
        fieldValues[fieldName] = fieldValue;
      }

      // Validate all required fields are provided
      const structFields = (structDef as any).fields as Array<{
        name: string;
        annotation: string;
      }>;
      for (const field of structFields) {
        if (!providedFields.has(field.name)) {
          throw new Error(
            `missing field ${field.name} in struct ${structName}`
          );
        }
        // For struct fields, just validate that the type annotation is recognized
        // but don't require literal value matching (different from let bindings)
        const annotation = field.annotation.trim();
        if (!/^[*]?([a-zA-Z_]\w*)(?:\d+)?$/.test(annotation)) {
          throw new Error(`invalid type annotation for field ${field.name}`);
        }
      }

      // Create struct instance
      return {
        isStructInstance: true,
        structName,
        fieldValues,
      };
    }

    // function call handling (identifier with callArgs)
    if (op && (op as any).callArgs) {
      // evaluate arguments
      const argOps = (op as any).callArgs.map((a: string) =>
        evaluateReturningOperand(a, localEnv)
      );
      const fn = resolveFunctionFromOperand(op, localEnv);
      if (fn.params.length !== argOps.length)
        throw new Error("invalid argument count");

      // prepare call env from closure
      const callEnv: Record<string, any> = { ...fn.closureEnv };
      for (let i = 0; i < fn.params.length; i++) {
        const p = fn.params[i];
        const pname = p.name || p;
        const pann = p.annotation || null;
        // reuse interpret_helpers.validateAnnotation to validate
        validateAnnotation(pann, argOps[i]);
        callEnv[pname] = argOps[i];
      }
      // execute body
      return executeFunctionBody(fn, callEnv);
    }

    // identifier resolution (existing behavior)
    if (op && (op as any).ident) {
      const n = (op as any).ident as string;

      // Special handling for 'this' binding
      if (n === "this") {
        const thisObj: any = { isThisBinding: true, fieldValues: {} };
        // Build fieldValues from current localEnv
        for (const [key, value] of Object.entries(localEnv)) {
          if (key !== "this") {
            // Extract the actual value
            if (value && (value as any).value !== undefined) {
              thisObj.fieldValues[key] = (value as any).value;
            } else if (
              typeof value === "number" ||
              typeof value === "string" ||
              typeof value === "boolean"
            ) {
              thisObj.fieldValues[key] = value;
            } else if (!(value as any).fn && !(value as any).isStructDef) {
              // Non-function, non-struct values
              thisObj.fieldValues[key] = value;
            }
          }
        }
        return thisObj;
      }

      const { targetVal: val } = getBindingTarget(n);
      if (val && (val as any).value !== undefined) return (val as any).value;
      return val;
    }
    return op;
  });

  function applyPrecedence(opSet: Set<string>) {
    let i = 0;
    while (i < ops.length) {
      if (opSet.has(ops[i])) {
        const res = applyBinaryOp(ops[i], operands[i], operands[i + 1]);
        operands.splice(i, 2, res);
        ops.splice(i, 1);
      } else i++;
    }
  }

  // Handle function application and field access (highest precedence, left-to-right)
  let i = 0;
  while (i < ops.length) {
    if (ops[i] === "call") {
      const funcOperand = operands[i];
      const callAppOperand = operands[i + 1];
      const callArgs = (callAppOperand as any).callApp || [];

      // Evaluate the call arguments
      const argOps = callArgs.map((a: string) =>
        evaluateReturningOperand(a, localEnv)
      );

      // The function should be in funcOperand
      const fn = resolveFunctionFromOperand(funcOperand, localEnv);

      if (fn.params.length !== argOps.length)
        throw new Error("invalid argument count");

      // prepare call env from closure
      const callEnv: Record<string, any> = { ...fn.closureEnv };
      for (let j = 0; j < fn.params.length; j++) {
        const p = fn.params[j];
        const pname = p.name || p;
        const pann = p.annotation || null;
        validateAnnotation(pann, argOps[j]);
        callEnv[pname] = argOps[j];
      }

      // execute body
      const result = executeFunctionBody(fn, callEnv);

      operands.splice(i, 2, result);
      ops.splice(i, 1);
    } else if (ops[i] && ops[i].startsWith(".")) {
      // Field access operator
      const fieldName = ops[i].substring(1); // Remove the '.' prefix
      const structInstance = operands[i];

      if (!structInstance) {
        throw new Error(`cannot access field on null value`);
      }

      // Handle both struct instances and this binding
      if (
        (structInstance as any).isStructInstance ||
        (structInstance as any).isThisBinding
      ) {
        const fieldValue = (structInstance as any).fieldValues[fieldName];
        if (fieldValue === undefined) {
          throw new Error(`invalid field access: ${fieldName}`);
        }

        operands.splice(i, 1, fieldValue);
        ops.splice(i, 1);
      } else {
        throw new Error(`cannot access field on non-struct value`);
      }
    } else {
      i++;
    }
  }

  applyPrecedence(new Set(["*", "/", "%"]));
  applyPrecedence(new Set(["+", "-"]));
  // comparison operators
  applyPrecedence(new Set(["<", ">", "<=", ">=", "==", "!="]));
  applyPrecedence(new Set(["&&"]));
  applyPrecedence(new Set(["||"]));

  // final result is operands[0]
  let result: any = operands[0];
  return result;
}

export function evaluateFlatExpression(
  exprStr: string,
  env: Record<string, any>
): number {
  const opnd = evaluateReturningOperand(exprStr, env);
  if (opnd && (opnd as any).boolValue !== undefined)
    return (opnd as any).boolValue ? 1 : 0;
  if (opnd && (opnd as any).kind) return Number((opnd as any).valueBig);
  if (typeof opnd === "number") return opnd;
  if (opnd && (opnd as any).isFloat) return (opnd as any).floatValue as number;
  return Number((opnd as any).valueBig as bigint);
}
