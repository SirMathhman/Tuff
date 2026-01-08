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

import {
  isPlainObject,
  isBoolOperand,
  isFloatOperand,
  isIntOperand,
  isStructDef,
  isStructInstance,
  isThisBinding,
  isPointer,
  unwrapBindingValue,
} from "./types";

export function isTruthy(val: unknown): boolean {
  if (isBoolOperand(val)) return val.boolValue;
  if (isIntOperand(val)) return val.valueBig !== 0n;
  if (typeof val === "number") return val !== 0;
  if (isFloatOperand(val)) return val.floatValue !== 0;
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
export function applyBinaryOp(
  op: string,
  left: unknown,
  right: unknown
): unknown {
  if (op === "||") {
    if (isTruthy(left)) return { boolValue: true };
    return { boolValue: isTruthy(right) };
  }
  if (op === "&&") {
    if (!isTruthy(left)) return { boolValue: false };
    return { boolValue: isTruthy(right) };
  }

  const leftHasKind =
    isPlainObject(left) && (left as { kind?: unknown }).kind !== undefined;
  const rightHasKind =
    isPlainObject(right) && (right as { kind?: unknown }).kind !== undefined;
  if (leftHasKind || rightHasKind) {
    const ref = leftHasKind ? left : right;
    const kind = (ref as { kind?: unknown }).kind;
    const bits = (ref as { bits?: unknown }).bits;
    if (typeof kind !== "string" || typeof bits !== "number")
      throw new Error("invalid suffix metadata");
    if (leftHasKind && rightHasKind) {
      if (
        (left as { kind?: unknown }).kind !==
          (right as { kind?: unknown }).kind ||
        (left as { bits?: unknown }).bits !== (right as { bits?: unknown }).bits
      )
        throw new Error("mismatched suffixes in binary operation");
    }
    if (!leftHasKind && isFloatOperand(left))
      throw new Error("mixed suffix and float not allowed");
    if (!rightHasKind && isFloatOperand(right))
      throw new Error("mixed suffix and float not allowed");

    let lBig: bigint;
    if (leftHasKind) {
      if (!isIntOperand(left)) throw new Error("invalid left integer operand");
      lBig = left.valueBig;
    } else if (typeof left === "number") {
      lBig = BigInt(left);
    } else {
      if (!isIntOperand(left)) throw new Error("invalid left integer operand");
      lBig = left.valueBig;
    }

    let rBig: bigint;
    if (rightHasKind) {
      if (!isIntOperand(right))
        throw new Error("invalid right integer operand");
      rBig = right.valueBig;
    } else if (typeof right === "number") {
      rBig = BigInt(right);
    } else {
      if (!isIntOperand(right))
        throw new Error("invalid right integer operand");
      rBig = right.valueBig;
    }

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
    return { valueBig: resBig, kind, bits };
  }

  const leftIsBool = isBoolOperand(left);
  const rightIsBool = isBoolOperand(right);
  const lNum =
    typeof left === "number"
      ? left
      : isFloatOperand(left)
      ? left.floatValue
      : leftIsBool
      ? left.boolValue
        ? 1
        : 0
      : isIntOperand(left)
      ? Number(left.valueBig)
      : (() => {
          throw new Error("invalid left operand");
        })();
  const rNum =
    typeof right === "number"
      ? right
      : isFloatOperand(right)
      ? right.floatValue
      : rightIsBool
      ? right.boolValue
        ? 1
        : 0
      : isIntOperand(right)
      ? Number(right.valueBig)
      : (() => {
          throw new Error("invalid right operand");
        })();
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
import { Env, envHas, envGet, envSet, envEntries, envClone } from "./env";

function mustGetEnvBinding(env: Env, name: string): unknown {
  if (!envHas(env, name)) throw new Error(`unknown identifier ${name}`);
  return envGet(env, name);
}

function resolveFunctionFromOperand(operand: unknown, localEnv: Env): unknown {
  if (
    isPlainObject(operand) &&
    isPlainObject((operand as { fn?: unknown }).fn)
  ) {
    return (operand as { fn: unknown }).fn;
  } else if (
    isPlainObject(operand) &&
    typeof (operand as { ident?: unknown }).ident === "string"
  ) {
    const name = (operand as { ident: string }).ident;
    const binding = mustGetEnvBinding(localEnv, name);
    if (
      !isPlainObject(binding) ||
      !isPlainObject((binding as { fn?: unknown }).fn)
    )
      throw new Error("not a function");
    return (binding as { fn: unknown }).fn;
  } else {
    throw new Error("cannot call non-function");
  }
}

/**
 * Execute a function body and return the result
 * Handles both block bodies (executed via interpret) and expression bodies
 */
function executeFunctionBody(fn: unknown, callEnv: Env): unknown {
  if (!isPlainObject(fn)) throw new Error("internal error: invalid fn");
  const isBlock = (fn as { isBlock?: unknown }).isBlock === true;
  const body = (fn as { body?: unknown }).body;
  if (typeof body !== "string")
    throw new Error("internal error: invalid fn body");

  if (!isBlock) {
    return evaluateReturningOperand(body, callEnv);
  }

  const inner = body.replace(/^\{\s*|\s*\}$/g, "");

  // Determine the last top-level statement without importing helpers to avoid
  // circular import issues.
  const parts = splitTopLevelStatements(inner)
    .map((p) => p.trim())
    .filter(Boolean);
  const lastStmt = parts.length ? parts[parts.length - 1] : null;

  // interpret() mutates the provided env in-place for statement-like inputs.
  // We expose it on globalThis in src/interpret.ts to avoid circular imports.
  const interpFunc = globalThis.interpret;
  if (typeof interpFunc !== "function") {
    throw new Error("internal error: interpret() is not available");
  }

  if (lastStmt && lastStmt === "this") {
    // Execute everything *except* the trailing `this` statement.
    // interpret() always returns a number and will throw if the last expression
    // is non-numeric (like our `this` binding object). We still want all prior
    // statements (nested fn declarations, assignments) to run so they populate
    // the call env.
    const prelude = parts.slice(0, -1).join("; ");
    if (prelude.trim() !== "") interpFunc(prelude, callEnv);

    // Build `this` binding directly from the call env to ensure nested functions
    // declared inside the block are included as direct fields on the resulting
    // `this` object (methods should be callable via `this.method`).
    const thisObj: {
      isThisBinding: true;
      fieldValues: { [k: string]: unknown };
    } = { isThisBinding: true, fieldValues: {} };
    for (const [k, envVal] of envEntries(callEnv)) {
      if (k === "this") continue;
      if (
        isPlainObject(envVal) &&
        Object.prototype.hasOwnProperty.call(envVal, "value") &&
        (envVal as { value?: unknown }).value !== undefined
      )
        thisObj.fieldValues[k] = (envVal as { value?: unknown }).value;
      else if (
        typeof envVal === "number" ||
        typeof envVal === "string" ||
        typeof envVal === "boolean"
      )
        thisObj.fieldValues[k] = envVal;
      else if (!isStructDef(envVal)) {
        // include non-struct values (including function wrappers)
        thisObj.fieldValues[k] = envVal;
      }
    }
    return thisObj;
  }

  const v = interpFunc(inner, callEnv);

  // interpret() returns a JS number. Wrap into our numeric operand representation.
  if (typeof v === "number" && Number.isInteger(v))
    return { valueBig: BigInt(v) };
  if (typeof v === "number") return { floatValue: v, isFloat: true };
  return v;
}

export function evaluateReturningOperand(
  exprStr: string,
  localEnv: Env
): unknown {
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
      if (isBoolOperand(condVal)) return condVal.boolValue;
      if (isIntOperand(condVal)) return condVal.valueBig !== 0n;
      if (typeof condVal === "number") return condVal !== 0;
      if (isFloatOperand(condVal)) return condVal.floatValue !== 0;
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
        if (isBoolOperand(eq) && eq.boolValue) {
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
  // Use a stricter check to ensure we have a proper fn header (name followed by '(')
  if (/^fn\s+[a-zA-Z_]\w*\s*\(/.test(sTrim)) {
    const parsed = parseFnComponents(sTrim);
    const { name, params, body, isBlock, resultAnnotation } = parsed;
    const fnObj: {
      params: unknown;
      body: string;
      isBlock: boolean;
      resultAnnotation: string | null;
      closureEnv: Env | null;
    } = {
      params,
      body,
      isBlock,
      resultAnnotation,
      closureEnv: null,
    };
    const wrapper = { fn: fnObj };
    fnObj.closureEnv = envClone(localEnv);
    // expose named binding inside closure for recursion
    envSet(fnObj.closureEnv, name, wrapper);
    return wrapper;
  }
  const exprTokens: { op?: string; operand?: unknown }[] = [];
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
      // call does not change the lastPrimary (the function being applied)
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
      // For field access, push the field operator.
      // The operand will be resolved during evaluation (not by referencing the
      // potentially-shared parse-time object) to avoid duplicated references.
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
    const binding = mustGetEnvBinding(localEnv, name);
    if (
      isPlainObject(binding) &&
      (binding as { uninitialized?: unknown }).uninitialized
    )
      throw new Error(`use of uninitialized variable ${name}`);
    const targetVal = unwrapBindingValue(binding);
    return { binding, targetVal };
  }

  // resolve identifiers, address-of (&) and dereference (*) from localEnv
  operands = operands.map((op) => {
    // address-of: produce a pointer object referring to the binding name and include target metadata
    if (isPlainObject(op) && (op as { addrOf?: unknown }).addrOf) {
      const inner = (op as { addrOf: unknown }).addrOf;
      if (
        !isPlainObject(inner) ||
        typeof (inner as { ident?: unknown }).ident !== "string"
      )
        throw new Error("& must be applied to identifier");
      const n = (inner as { ident: string }).ident;
      const { targetVal } = getBindingTarget(n);
      const ptrObj: { [k: string]: unknown } = { ptrName: n, pointer: true };
      if (
        isPlainObject(targetVal) &&
        typeof (targetVal as { kind?: unknown }).kind === "string"
      ) {
        ptrObj.kind = (targetVal as { kind?: unknown }).kind;
        ptrObj.bits = (targetVal as { bits?: unknown }).bits;
        ptrObj.valueBig = (targetVal as { valueBig?: unknown }).valueBig;
      } else if (isIntOperand(targetVal)) {
        ptrObj.valueBig = targetVal.valueBig;
      } else if (isFloatOperand(targetVal)) {
        ptrObj.isFloat = true;
        ptrObj.floatValue = targetVal.floatValue;
      } else if (isBoolOperand(targetVal)) {
        ptrObj.ptrIsBool = true;
        ptrObj.boolValue = targetVal.boolValue;
      } else if (typeof targetVal === "number") {
        // plain numeric -> treat as integer literal-like
        ptrObj.valueBig = BigInt(targetVal);
      }
      return ptrObj;
    }

    // dereference: fetch the value pointed to by a pointer (either a named binding or an inline &expr)
    if (isPlainObject(op) && (op as { deref?: unknown }).deref) {
      const inner = (op as { deref: unknown }).deref;
      // deref of an identifier that holds a pointer
      if (
        isPlainObject(inner) &&
        typeof (inner as { ident?: unknown }).ident === "string"
      ) {
        const n = (inner as { ident: string }).ident;
        const { targetVal: val } = getBindingTarget(n);
        if (!isPointer(val)) throw new Error("cannot dereference non-pointer");
        const targetName = val.ptrName;
        const { targetVal } = getBindingTarget(targetName);
        return targetVal;
      }
      // deref of an inline &expr like *(&x)
      if (isPlainObject(inner) && (inner as { addrOf?: unknown }).addrOf) {
        const inr = (inner as { addrOf: unknown }).addrOf;
        if (
          !isPlainObject(inr) ||
          typeof (inr as { ident?: unknown }).ident !== "string"
        )
          throw new Error("& must be applied to identifier");
        const n = (inr as { ident: string }).ident;
        const { targetVal } = getBindingTarget(n);
        return targetVal;
      }
      throw new Error("invalid dereference target");
    }

    // struct instantiation handling
    if (
      isPlainObject(op) &&
      (op as { structInstantiation?: unknown }).structInstantiation
    ) {
      const si = (op as { structInstantiation: unknown }).structInstantiation;
      if (!isPlainObject(si)) throw new Error("invalid struct instantiation");
      const structName = (si as { name?: unknown }).name;
      const fieldParts = (si as { fields?: unknown }).fields;
      if (typeof structName !== "string" || !Array.isArray(fieldParts))
        throw new Error("invalid struct instantiation");

      // Look up struct definition
      if (!envHas(localEnv, structName))
        throw new Error(`unknown struct ${structName}`);
      const structDef = envGet(localEnv, structName);
      if (!isStructDef(structDef))
        throw new Error(`${structName} is not a struct`);

      // Evaluate field values
      const fieldValues: { [k: string]: unknown } = {};
      const providedFields = new Set<string>();

      for (const fieldPart of fieldParts) {
        if (!isPlainObject(fieldPart))
          throw new Error("invalid struct field initializer");
        const fieldName = (fieldPart as { name?: unknown }).name;
        const fieldValueExpr = (fieldPart as { value?: unknown }).value;
        if (typeof fieldName !== "string" || typeof fieldValueExpr !== "string")
          throw new Error("invalid struct field initializer");
        const fieldValue = evaluateReturningOperand(fieldValueExpr, localEnv);

        // Check for duplicate fields
        if (providedFields.has(fieldName))
          throw new Error(`duplicate field ${fieldName}`);
        providedFields.add(fieldName);
        fieldValues[fieldName] = fieldValue;
      }

      // Validate all required fields are provided
      const structFields = (structDef as { fields?: unknown }).fields;
      if (!Array.isArray(structFields))
        throw new Error("invalid struct definition");
      for (const field of structFields) {
        if (!isPlainObject(field)) throw new Error("invalid struct definition");
        const fieldName = (field as { name?: unknown }).name;
        const annotationRaw = (field as { annotation?: unknown }).annotation;
        if (typeof fieldName !== "string" || typeof annotationRaw !== "string")
          throw new Error("invalid struct definition");
        if (!providedFields.has(fieldName)) {
          throw new Error(`missing field ${fieldName} in struct ${structName}`);
        }
        // For struct fields, just validate that the type annotation is recognized
        // but don't require literal value matching (different from let bindings)
        const annotation = annotationRaw.trim();
        if (!/^[*]?([a-zA-Z_]\w*)(?:\d+)?$/.test(annotation)) {
          throw new Error(`invalid type annotation for field ${fieldName}`);
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
    if (
      isPlainObject(op) &&
      Array.isArray((op as { callArgs?: unknown }).callArgs)
    ) {
      const callArgsRaw = (op as { callArgs: unknown[] }).callArgs;
      // Reuse the shared call evaluator to keep behavior consistent with the
      // explicit "call" operator path and avoid duplicated argument/env logic.
      return evaluateCallAt(op, { callApp: callArgsRaw });
    }

    // identifier resolution (existing behavior)
    if (
      isPlainObject(op) &&
      typeof (op as { ident?: unknown }).ident === "string"
    ) {
      const n = (op as { ident: string }).ident;

      // Special handling for 'this' binding
      if (n === "this") {
        const thisObj: {
          isThisBinding: true;
          fieldValues: { [k: string]: unknown };
        } = { isThisBinding: true, fieldValues: {} };
        // Build fieldValues from current localEnv
        for (const [key, value] of envEntries(localEnv)) {
          if (key !== "this") {
            // Extract the actual value
            if (
              isPlainObject(value) &&
              Object.prototype.hasOwnProperty.call(value, "value") &&
              (value as { value?: unknown }).value !== undefined
            ) {
              thisObj.fieldValues[key] = (value as { value?: unknown }).value;
            } else if (
              typeof value === "number" ||
              typeof value === "string" ||
              typeof value === "boolean"
            ) {
              thisObj.fieldValues[key] = value;
            } else if (!isStructDef(value)) {
              // Include non-struct values (including functions) so methods defined in
              // the current function scope are accessible via `this`.
              thisObj.fieldValues[key] = value;
            }
          }
        }
        return thisObj;
      }

      const { targetVal: val } = getBindingTarget(n);
      if (
        isPlainObject(val) &&
        Object.prototype.hasOwnProperty.call(val, "value") &&
        (val as { value?: unknown }).value !== undefined
      )
        return (val as { value?: unknown }).value;
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

  // helper to evaluate a call and return its result
  function evaluateCallAt(funcOperand: unknown, callAppOperand: unknown) {
    if (!isPlainObject(callAppOperand)) throw new Error("invalid call");
    const callArgsRaw = (callAppOperand as { callApp?: unknown }).callApp;
    if (!Array.isArray(callArgsRaw)) throw new Error("invalid call");

    const argOps = callArgsRaw.map((a) => {
      if (typeof a !== "string") throw new Error("invalid call argument");
      return evaluateReturningOperand(a, localEnv);
    });
    const fn = resolveFunctionFromOperand(funcOperand, localEnv);
    if (
      !isPlainObject(fn) ||
      !Array.isArray((fn as { params?: unknown }).params)
    )
      throw new Error("internal error: invalid function");
    const fnParams = (fn as { params: unknown[] }).params;
    const fnClosureEnv = (fn as { closureEnv?: unknown }).closureEnv;
    if (!fnClosureEnv) throw new Error("internal error: missing closure env");

    if (fnParams.length !== argOps.length)
      throw new Error("invalid argument count");

    const callEnv: Env = envClone(fnClosureEnv as Env);
    for (let j = 0; j < fnParams.length; j++) {
      const p = fnParams[j];
      const pname = isPlainObject(p) ? (p as { name?: unknown }).name : p;
      const pann = isPlainObject(p)
        ? (p as { annotation?: unknown }).annotation
        : null;
      if (typeof pname !== "string") throw new Error("invalid parameter");
      validateAnnotation(
        typeof pann === "string" || pann === null ? pann : null,
        argOps[j]
      );
      envSet(callEnv, pname, argOps[j]);
    }
    return executeFunctionBody(fn, callEnv);
  }

  // helper to extract and validate a field value from a struct/this instance
  function getFieldValueFromInstance(
    maybe: unknown,
    fieldName: string
  ): unknown {
    if (!(isStructInstance(maybe) || isThisBinding(maybe)))
      throw new Error("cannot access field on non-struct value");

    const fieldValue = maybe.fieldValues[fieldName];
    if (fieldValue === undefined)
      throw new Error(`invalid field access: ${fieldName}`);
    return fieldValue;
  }

  // Debug: show tokenization for suspicious patterns

  // Handle function application and field access (highest precedence, left-to-right)
  let i = 0;
  while (i < ops.length) {
    if (ops[i] === "call") {
      // If a field access immediately follows a call (call + .field), handle both
      // together to avoid operand alignment issues.
      if (
        ops[i + 1] &&
        typeof ops[i + 1] === "string" &&
        ops[i + 1].startsWith(".")
      ) {
        const funcOperand = operands[i];
        const callAppOperand = operands[i + 1];
        const result = evaluateCallAt(funcOperand, callAppOperand);
        const fieldName = (ops[i + 1] as string).substring(1);
        if (!result) throw new Error(`cannot access field on null value`);
        const fieldValue = getFieldValueFromInstance(result, fieldName);

        // Remove [funcOperand, callApp, undefined] -> replace with the fieldValue
        operands.splice(i, 3, fieldValue);
        // remove the 'call' and '.field' operators
        ops.splice(i, 2);
        // continue at same index
      } else {
        const funcOperand = operands[i];
        const callAppOperand = operands[i + 1];
        const result = evaluateCallAt(funcOperand, callAppOperand);

        operands.splice(i, 2, result);
        ops.splice(i, 1);
      }
    } else if (ops[i] && ops[i].startsWith(".")) {
      // Field access operator
      const fieldName = ops[i].substring(1); // Remove the '.' prefix
      const structInstance = operands[i];

      if (!structInstance) {
        // Attempt to recover: sometimes due to token ordering the actual struct instance
        // may be to the left (e.g., parsing quirks). Search left for a nearby non-undefined
        // operand that looks like a struct/this binding and use that.
        let foundIndex = -1;
        for (let j = i - 1; j >= 0; j--) {
          if (operands[j] !== undefined) {
            foundIndex = j;
            break;
          }
        }
        if (foundIndex !== -1) {
          const maybe = operands[foundIndex];
          if (isStructInstance(maybe) || isThisBinding(maybe)) {
            const fieldValue = getFieldValueFromInstance(maybe, fieldName);
            // Replace the range from foundIndex up to the dot placeholder with the field value
            const count = i - foundIndex + 1;
            operands.splice(foundIndex, count, fieldValue);
            ops.splice(i, 1);
            // Continue without incrementing i so we re-evaluate at the same position
            continue;
          }
        }

        // Try searching to the right as a fallback
        let found = false;
        for (let j = i + 1; j < operands.length; j++) {
          if (operands[j] !== undefined) {
            const maybe = operands[j];
            if (isStructInstance(maybe) || isThisBinding(maybe)) {
              const fieldValue = getFieldValueFromInstance(maybe, fieldName);
              // Replace from the dot placeholder up to the found operand inclusive
              const count = j - i + 1;
              operands.splice(i, count, fieldValue);
              ops.splice(i, 1);
              // Adjust i to j-1 so next iteration continues correctly
              i = Math.max(0, i);
              found = true;
              break;
            }
            break;
          }
        }
        if (found) continue;
        throw new Error(`cannot access field on null value`);
      }

      // Handle both struct instances and this binding
      if (isStructInstance(structInstance) || isThisBinding(structInstance)) {
        const fieldValue = getFieldValueFromInstance(structInstance, fieldName);

        // Replace the operand and its following placeholder with the field value
        operands.splice(i, 2, fieldValue);
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
  return operands[0];
}

export function evaluateFlatExpression(exprStr: string, env: Env): number {
  const opnd = evaluateReturningOperand(exprStr, env);
  if (isBoolOperand(opnd)) return opnd.boolValue ? 1 : 0;
  if (isIntOperand(opnd)) return Number(opnd.valueBig);
  if (typeof opnd === "number") return opnd;
  if (isFloatOperand(opnd)) return opnd.floatValue;
  if (opnd === undefined) return 0;
  throw new Error("cannot evaluate expression");
}
