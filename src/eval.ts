/* eslint-disable max-lines */
/* global console */
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
  convertOperandToNumber,
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
  isFnWrapper,
  hasKindBits,
  hasIdent,
  hasAddrOf,
  hasDeref,
  hasCallArgs,
  hasCallApp,
  hasStructInstantiation,
  hasValue,
  hasUninitialized,
  hasAnnotation,
  hasParams,
  hasClosureEnv,
  hasBody,
  hasIsBlock,
  hasName,
  hasFields,
  getProp,
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

  const leftHasKind = hasKindBits(left);
  const rightHasKind = hasKindBits(right);
  if (leftHasKind || rightHasKind) {
    const ref = leftHasKind ? left : right;
    if (!hasKindBits(ref)) throw new Error("invalid suffix metadata");
    const { kind, bits } = ref;
    if (leftHasKind && rightHasKind) {
      if (left.kind !== right.kind || left.bits !== right.bits)
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
import {
  Env,
  envHas,
  envGet,
  envSet,
  envEntries,
  envClone,
  isEnv,
} from "./env";

function mustGetEnvBinding(env: Env, name: string): unknown {
  if (!envHas(env, name)) throw new Error(`unknown identifier ${name}`);
  return envGet(env, name);
}

function resolveFunctionFromOperand(operand: unknown, localEnv: Env): unknown {
  if (isFnWrapper(operand)) {
    return operand.fn;
  } else if (hasIdent(operand)) {
    const name = operand.ident;
    const binding = mustGetEnvBinding(localEnv, name);
    if (!isFnWrapper(binding)) throw new Error("not a function");
    return binding.fn;
  } else {
    throw new Error("cannot call non-function");
  }
}

// Create a bound function wrapper from an original fn object and a boundThis
function makeBoundWrapperFromOrigFn(origFn: unknown, boundThis: unknown) {
  if (!isPlainObject(origFn)) throw new Error("internal error: invalid fn");
  const boundFn: { [k: string]: unknown } = {};
  if (hasParams(origFn) && Array.isArray(origFn.params)) {
    const origParams = origFn.params;
    if (origParams.length > 0) {
      const first = origParams[0];
      const firstName = isPlainObject(first) && hasName(first) ? first.name : first;
      if (typeof firstName === "string" && firstName === "this") boundFn.params = origParams.slice(1);
      else boundFn.params = origParams;
    } else boundFn.params = [];
  }

  if (hasBody(origFn) && typeof origFn.body === "string") boundFn.body = origFn.body;
  if (hasIsBlock(origFn)) boundFn.isBlock = origFn.isBlock;
  const resAnn = getProp(origFn, "resultAnnotation");
  if (typeof resAnn === "string") boundFn.resultAnnotation = resAnn;
  if (hasClosureEnv(origFn) && origFn.closureEnv) boundFn.closureEnv = origFn.closureEnv;
  const nativeMaybe = getProp(origFn, "nativeImpl");
  if (typeof nativeMaybe === "function") boundFn.nativeImpl = nativeMaybe;

  boundFn.boundThis = boundThis;
  return { fn: boundFn };
}

/**
 * Execute a function body and return the result
 * Handles both block bodies (executed via interpret) and expression bodies
 */
function executeFunctionBody(fn: unknown, callEnv: Env): unknown {
  if (!isPlainObject(fn)) throw new Error("internal error: invalid fn");
  const isBlock = hasIsBlock(fn) && fn.isBlock === true;
  if (!hasBody(fn) || typeof fn.body !== "string") {
    throw new Error("internal error: invalid fn body");
  }
  const body = fn.body;

  if (!isBlock) {
    return evaluateReturningOperand(body, callEnv);
  }

  const inner = body.replace(/^\{\s*|\s*\}$/g, "");

  // Determine the last top-level statement without importing helpers to avoid
  // circular import issues.
  const parts = splitTopLevelStatements(inner)
    .map((p) => p.trim())
    .filter(Boolean);
  const lastStmt = parts.length ? parts[parts.length - 1] : undefined;

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
        hasValue(envVal) &&
        envVal.value !== undefined
      )
        thisObj.fieldValues[k] = envVal.value;
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

    let defaultBody: string | undefined = undefined;
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
    if (defaultBody !== undefined) {
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
      resultAnnotation: string | undefined;
      closureEnv: Env | undefined;
    } = {
      params,
      body,
      isBlock,
      resultAnnotation,
      closureEnv: undefined,
    };
    const wrapper = { fn: fnObj };
    fnObj.closureEnv = envClone(localEnv);
    // expose named binding inside closure for recursion
    envSet(fnObj.closureEnv, name, wrapper);
    return wrapper;
  }
  const exprTokens: { op?: string; operand?: unknown }[] = [];
  // Debug: trace tokens for suspicious expressions
  // eslint-disable-next-line no-console
  if (exprStr.includes("manhattan")) console.log("DEBUG exprStr start:", exprStr);
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
    let op: string | undefined = undefined;
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
  // Debug: show tokens for suspicious exprs
  if (exprStr.includes("manhattan")) {
    // Create a lightweight representation since tokens may not be JSON-friendly
    const tokenSummary = exprTokens.map((t) => {
      if (t.op) return `OP(${t.op})`;
      const o = t.operand;
      if (isPlainObject(o) && hasStructInstantiation(o)) return `OPER(structInst)`;
      if (isPlainObject(o) && hasIdent(o)) return `OPER(ident)`;
      if (isPlainObject(o) && hasCallApp(o)) return `OPER(callApp)`;
      return `OPER(${String(o)})`;
    });
    // eslint-disable-next-line no-console
    console.log("DEBUG exprTokens summary:", tokenSummary);
  }
  let operands = exprTokens.map((t) => t.operand);
  const ops: string[] = [];
  for (let i = 1; i < exprTokens.length; i++) ops.push(exprTokens[i].op!);

  // helper to get binding and deref target
  function getBindingTarget(name: string) {
    const binding = mustGetEnvBinding(localEnv, name);
    if (
      isPlainObject(binding) &&
      hasUninitialized(binding) &&
      binding.uninitialized
    )
      throw new Error(`use of uninitialized variable ${name}`);
    const targetVal = unwrapBindingValue(binding);
    return { binding, targetVal };
  }

  // resolve identifiers, address-of (&) and dereference (*) from localEnv
  operands = operands.map((op) => {
    // address-of: produce a pointer object referring to the binding name and include target metadata
    if (isPlainObject(op) && hasAddrOf(op)) {
      const inner = op.addrOf;
      if (!isPlainObject(inner) || !hasIdent(inner))
        throw new Error("& must be applied to identifier");
      const n = inner.ident;
      if (typeof n !== "string")
        throw new Error("& must be applied to identifier");
      const { targetVal } = getBindingTarget(n);
      const ptrObj: { [k: string]: unknown } = { ptrName: n, pointer: true };
      if (isPlainObject(targetVal) && hasKindBits(targetVal)) {
        ptrObj.kind = targetVal.kind;
        ptrObj.bits = targetVal.bits;
        if (hasValue(targetVal)) ptrObj.valueBig = targetVal.value;
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
    if (isPlainObject(op) && hasDeref(op)) {
      const inner = op.deref;
      // deref of an identifier that holds a pointer
      if (isPlainObject(inner) && hasIdent(inner)) {
        const n = inner.ident;
        if (typeof n !== "string") throw new Error("invalid deref target");
        const { targetVal: val } = getBindingTarget(n);
        if (!isPointer(val)) throw new Error("cannot dereference non-pointer");
        const targetName = val.ptrName;
        const { targetVal } = getBindingTarget(targetName);
        return targetVal;
      }
      // deref of an inline &expr like *(&x)
      if (isPlainObject(inner) && hasAddrOf(inner)) {
        const inr = inner.addrOf;
        if (!isPlainObject(inr) || !hasIdent(inr))
          throw new Error("& must be applied to identifier");
        const n = inr.ident;
        if (typeof n !== "string")
          throw new Error("& must be applied to identifier");
        const { targetVal } = getBindingTarget(n);
        return targetVal;
      }
      throw new Error("invalid dereference target");
    }

    // struct instantiation handling
    if (isPlainObject(op) && hasStructInstantiation(op)) {
      const si = op.structInstantiation;
      if (!isPlainObject(si)) throw new Error("invalid struct instantiation");
      if (!hasName(si) || typeof si.name !== "string")
        throw new Error("invalid struct instantiation");
      const structName = si.name;
      if (!hasFields(si) || !Array.isArray(si.fields))
        throw new Error("invalid struct instantiation");
      const fieldParts = si.fields;

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
        if (
          !hasName(fieldPart) ||
          typeof fieldPart.name !== "string" ||
          !hasValue(fieldPart) ||
          typeof fieldPart.value !== "string"
        )
          throw new Error("invalid struct field initializer");
        const fieldName = fieldPart.name;
        const fieldValueExpr = fieldPart.value;
        const fieldValue = evaluateReturningOperand(fieldValueExpr, localEnv);

        // Check for duplicate fields
        if (providedFields.has(fieldName))
          throw new Error(`duplicate field ${fieldName}`);
        providedFields.add(fieldName);
        fieldValues[fieldName] = fieldValue;
      }

      // Validate all required fields are provided
      if (!hasFields(structDef) || !Array.isArray(structDef.fields))
        throw new Error("invalid struct definition");
      const structFields = structDef.fields;
      for (const field of structFields) {
        if (!isPlainObject(field)) throw new Error("invalid struct definition");
        if (
          !hasName(field) ||
          typeof field.name !== "string" ||
          !hasAnnotation(field) ||
          typeof field.annotation !== "string"
        )
          throw new Error("invalid struct definition");
        const fieldName = field.name;
        const annotationRaw = field.annotation;
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
    if (isPlainObject(op) && hasCallArgs(op)) {
      const callArgsRaw = op.callArgs;
      // Reuse the shared call evaluator to keep behavior consistent with the
      // explicit "call" operator path and avoid duplicated argument/env logic.
      return evaluateCallAt(op, { callApp: callArgsRaw });
    }

    // identifier resolution (existing behavior)
    if (isPlainObject(op) && hasIdent(op)) {
      const n = op.ident;
      if (typeof n !== "string") return op;

      // Special handling for 'this' binding
      if (n === "this") {
        // If `this` is explicitly bound in the environment, return it directly
        // (used by bound method wrappers to expose primitive receivers).
        if (envHas(localEnv, "this")) return envGet(localEnv, "this");

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
              hasValue(value) &&
              value.value !== undefined
            ) {
              thisObj.fieldValues[key] = value.value;
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
      if (isPlainObject(val) && hasValue(val) && val.value !== undefined)
        return val.value;
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
    // Debug: show call operands for problematic cases
    // eslint-disable-next-line no-console
    console.log("DEBUG evaluateCallAt: funcOperand kind:", typeof funcOperand, funcOperand && (isPlainObject(funcOperand) ? Object.keys(funcOperand) : funcOperand));

    if (!hasCallApp(callAppOperand)) throw new Error("invalid call");
    const callArgsRaw = callAppOperand.callApp;
    if (!Array.isArray(callArgsRaw)) throw new Error("invalid call");

    const argOps = callArgsRaw.map((a) => {
      if (typeof a !== "string") throw new Error("invalid call argument");
      return evaluateReturningOperand(a, localEnv);
    });
    const fn = resolveFunctionFromOperand(funcOperand, localEnv);
    if (!isPlainObject(fn) || !hasParams(fn))
      throw new Error("internal error: invalid function");
    const fnParams = fn.params;
    if (!Array.isArray(fnParams))
      throw new Error("internal error: invalid function params");
    if (!hasClosureEnv(fn) || !fn.closureEnv)
      throw new Error("internal error: missing closure env");
    const fnClosureEnv = fn.closureEnv;
    if (!isEnv(fnClosureEnv))
      throw new Error("internal error: invalid closure env type");

    if (fnParams.length !== argOps.length)
      throw new Error("invalid argument count");

    const callEnv: Env = envClone(fnClosureEnv);
    // If this function wrapper has a bound `this`, expose it on the callEnv
    // so that functions may access `this` as a variable inside the body.
    const boundThis = getProp(fn, "boundThis");
    if (boundThis !== undefined) {
      let thisVal: unknown = boundThis;
      if (isIntOperand(thisVal) || isFloatOperand(thisVal) || isBoolOperand(thisVal))
        thisVal = convertOperandToNumber(thisVal);
      envSet(callEnv, "this", thisVal);

    }

    for (let j = 0; j < fnParams.length; j++) {
      const p = fnParams[j];
      const pname = isPlainObject(p) && hasName(p) ? p.name : p;
      const pann =
        isPlainObject(p) && hasAnnotation(p) ? p.annotation : undefined;
      if (typeof pname !== "string") throw new Error("invalid parameter");
      validateAnnotation(
        typeof pann === "string" || pann === undefined ? pann : undefined,
        argOps[j]
      );
      envSet(callEnv, pname, argOps[j]);
    }
    // If this function has a native implementation, invoke it directly.
    // `nativeImpl` is stored on the fn object when created by `interpretAllWithNative`.
    const maybeNative = getProp(fn, "nativeImpl");
    if (typeof maybeNative === "function") {
      const convertArg = (a: unknown) => {
        if (isIntOperand(a)) return Number(a.valueBig);
        if (isFloatOperand(a)) return a.floatValue;
        if (isBoolOperand(a)) return a.boolValue;
        return a;
      };
      const jsArgs = argOps.map(convertArg);
      // Use Reflect.apply to call the unknown function safely without type casts
      return Reflect.apply(maybeNative, undefined, jsArgs);
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
    // Debug: trace token processing for suspicious expressions
    // eslint-disable-next-line no-console
    if (exprStr.includes("manhattan")) console.log("DEBUG eval loop", { i, ops: ops.slice(), operands: operands.slice() });
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
        const nextOp = ops[i + 1];
        if (typeof nextOp !== "string")
          throw new Error("invalid field access operator");
        const fieldName = nextOp.substring(1);
        if (!result) throw new Error(`cannot access field on missing value`);
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
        throw new Error(`cannot access field on missing value`);
      }

      // Handle both struct instances and this binding
      if (isStructInstance(structInstance) || isThisBinding(structInstance)) {
        // Debug: show the instance and field being accessed
        // eslint-disable-next-line no-console
        console.log("DEBUG struct/this access", { structInstance, fieldName });
        // If the instance actually contains the field, return it (covers methods
        // declared on `this` and normal struct fields).
        if (
          isPlainObject(structInstance) &&
          "fieldValues" in structInstance &&
          Object.prototype.hasOwnProperty.call(structInstance.fieldValues, fieldName)
        ) {
          const fieldValue = getFieldValueFromInstance(structInstance, fieldName);
          // Replace the operand and its following placeholder with the field value
          operands.splice(i, 2, fieldValue);
          ops.splice(i, 1);
        } else {
          // If the field isn't present on the instance, attempt to resolve a
          // same-named function from the current environment and bind the
          // instance as `this` (method dispatch for structs).
          const binding = envGet(localEnv, fieldName);
          if (binding !== undefined && isFnWrapper(binding)) {
            const wrapper = makeBoundWrapperFromOrigFn(binding.fn, structInstance);
            // Debug context for method binding
            // eslint-disable-next-line no-console
            console.log("DEBUG binding method", { index: i, ops: ops.slice(), operands: operands.slice() });
            // If the following operand is a call-application (e.g., `point.method()`
            // where the `()` was parsed into the operand after the dot), invoke
            // the call immediately and replace the range with the result.
            const nextOpnd = operands[i + 1];
            if (isPlainObject(nextOpnd) && hasCallApp(nextOpnd)) {
              // eslint-disable-next-line no-console
              console.log("DEBUG immediate call-on-binding detected", nextOpnd);
              const callResult = evaluateCallAt(wrapper, nextOpnd);
              // Replace [structInstance, callApp] -> callResult
              operands.splice(i, 2, callResult);
              // remove the '.' op
              ops.splice(i, 1);
              continue;
            }
            // Also handle the case where the parser produced a separate 'call' op
            // immediately following the '.' operator (ops[i+1] === 'call').
            if (ops[i + 1] === "call") {
              const callAppOperand = operands[i + 2];
              const callResult = evaluateCallAt(wrapper, callAppOperand);
              // Replace [structInstance, placeholder, callApp] -> callResult
              operands.splice(i, 3, callResult);
              // remove both the '.' and 'call' operators
              ops.splice(i, 2);
              continue;
            }

            // Replace the operand and its following placeholder with the wrapped function
            // Mark it so we can auto-invoke if the parser representation didn't
            // preserve the `()` call (see also auto-invoke handling below).
            // NOTE: use a symbolic property name unlikely to collide with user data.
            if (isPlainObject(wrapper) && "fn" in wrapper && isPlainObject(wrapper.fn)) {
              // mark function wrapper for possible auto-invocation
              wrapper.fn.__autoCall = true;
            }

            operands.splice(i, 2, wrapper);
            ops.splice(i, 1);
            continue;
          }

          throw new Error(`invalid field access: ${fieldName}`);
        }
      } else if (
        typeof structInstance === "number" ||
        typeof structInstance === "string" ||
        typeof structInstance === "boolean" ||
        isIntOperand(structInstance) ||
        isFloatOperand(structInstance) ||
        isBoolOperand(structInstance)
      ) {
        // Allow method-like calls on primitive receivers by resolving a same-named
        // function in the current localEnv and returning a bound fn wrapper.
        const binding = envGet(localEnv, fieldName);

        if (binding !== undefined && isFnWrapper(binding)) {
          const wrapper = makeBoundWrapperFromOrigFn(binding.fn, structInstance);
          // Replace the operand and its following placeholder with the wrapped function
          operands.splice(i, 2, wrapper);
          ops.splice(i, 1);
          continue;
        }
        throw new Error(`cannot access field on non-struct value`);
      } else {
        throw new Error(`cannot access field on non-struct value`);
      }
    } else {
      i++;
    }
  }

  // If we created a bound-wrapper for a struct method but the call was not
  // consumed (parsing quirks), auto-invoke zero-arg call in that specific
  // case to preserve expected `point.manhattan()` semantics.
  if (isFnWrapper(operands[0])) {
    const maybeAuto = getProp(operands[0].fn, "__autoCall");
    if (maybeAuto === true) {
      const res = evaluateCallAt(operands[0], { callApp: [] });
      operands.splice(0, 1, res);
    }
  }

  applyPrecedence(new Set(["*", "/", "%"]));
  applyPrecedence(new Set(["+", "-"]));
  // comparison operators
  applyPrecedence(new Set(["<", ">", "<=", ">=", "==", "!="]));
  applyPrecedence(new Set(["&&"]));
  applyPrecedence(new Set(["||"]));

  // Debug: show final operand for suspicious expressions
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
  // Debug: output unexpected operand
  // eslint-disable-next-line no-console
  console.log("DEBUG cannot evaluate expression, opnd:", opnd);
  throw new Error("cannot evaluate expression");
}
