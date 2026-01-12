import type { Env } from "./types";
import { blockShadow } from "./env";
import { tryHandleAddition, tryHandleComparison } from "./arithmetic";
import {
  tryHandleFunctionLikeExpression,
  tryHandleCall,
  tryHandleMethodCall,
} from "./functions";
import { tryHandleDerefExpression } from "./pointers";
import { tryHandleIfExpression } from "./ifExpression";
import { tryHandleMatchExpression } from "./matchExpression";
import { evalBlock, handleYieldValue } from "./statements";
import { isReturnValue } from "./returns";
import {
  ensureIndexFound,
  isIdentifierName,
  splitTopLevel,
  stripOuterParens,
} from "./shared";
import { splitNumberAndSuffix, validateNumberSuffix } from "./numbers";
import { isStructValue } from "./structs";
import { isArrayValue, tryHandleArrayIndexing } from "./arrays";
import { isPointerValue } from "./pointers";

function tryHandleTopLevel(s: string, env?: Env): unknown | undefined {
  const topParts = splitTopLevel(s, ";");
  if (topParts.length > 1 || s.trim().startsWith("let ")) {
    try {
      return handleYieldValue(() => evalBlock(s, env, false) as number);
    } catch (e: unknown) {
      if (isReturnValue(e)) throw new Error("Return used outside function");
      throw e;
    }
  }

  // `return` used at top-level is invalid
  if (s.trim().startsWith("return")) throw new Error("Return used outside function");

  return undefined;
}

export function interpret(input: string, env?: Env): unknown {
  let s = input.trim();
  if (s === "") return NaN;

  s = stripOuterParens(s);

  const topRes = tryHandleTopLevel(s, env);
  if (topRes !== undefined) return topRes;

  const fieldAccessResult = tryHandleFieldAccess(s, env);
  if (fieldAccessResult !== undefined) return fieldAccessResult;

  const ifResult = tryHandleIfExpression(s, env);
  if (ifResult !== undefined) return ifResult;

  const matchResult = tryHandleMatchExpression(s, env);
  if (matchResult !== undefined) return matchResult;

  const derefResult = tryHandleDerefExpression(s, env);
  if (derefResult !== undefined) return derefResult;

  const arrayIndexResult = tryHandleArrayIndexing(s, env, interpret);
  if (arrayIndexResult !== undefined) return arrayIndexResult;

  const fnLikeResult = tryHandleFunctionLikeExpression(s, env);
  if (fnLikeResult !== undefined) return fnLikeResult;

  const methodCallResult = tryHandleMethodCall(s, env);
  if (methodCallResult !== undefined) return methodCallResult;

  const callResult = tryHandleCall(s, env);
  if (callResult !== undefined) return callResult;

  const comparisonResult = tryHandleComparison(s, env);
  if (comparisonResult !== undefined) return comparisonResult;

  const additionResult = tryHandleAddition(s, env);
  if (additionResult !== undefined) return additionResult;

  const numOrIdent = tryParseNumberOrIdentifier(s, env);
  if (numOrIdent !== undefined) return numOrIdent;

  return NaN;
}

function parseBooleanLiteral(id: string): number | undefined {
  if (id === "true") return 1;
  if (id === "false") return 0;
  return undefined;
}

function tryHandleFieldAccess(s: string, env?: Env): number | undefined {
  // Look for pattern: identifier.field or expression.field
  const dotIdx = s.lastIndexOf(".");
  if (dotIdx <= 0) return undefined;

  const before = s.slice(0, dotIdx).trim();
  const after = s.slice(dotIdx + 1).trim();

  if (!isIdentifierName(after)) return undefined;

  // Special case: this.field -> lookup variable in current env
  if (before === "this") {
    if (!env) throw new Error("Unknown identifier");
    if (!env.has(after)) throw new Error("Unknown identifier");
    const item = env.get(after)!;
    if (typeof item.value === "number") return item.value;
    // if it's a struct, support field access too
    if (isStructValue(item.value)) {
      const struct = item.value;
      const idx = ensureIndexFound(
        struct.fields.indexOf(after),
        `Field ${after} not found in struct`
      );
      return struct.values[idx];
    }
    return undefined;
  }

  // Check if before is a simple identifier
  if (!isIdentifierName(before)) return undefined;

  if (!env || !env.has(before)) return undefined;
  const item = env.get(before)!;

  if (!isStructValue(item.value)) return undefined;

  const struct = item.value;
  const idx = ensureIndexFound(
    struct.fields.indexOf(after),
    `Field ${after} not found in struct`
  );

  return struct.values[idx];
}

// eslint-disable-next-line complexity
function tryParseNumberOrIdentifier(s: string, env?: Env): unknown | undefined {
  const { numStr, rest } = splitNumberAndSuffix(s);
  if (numStr === "") {
    const id = s.trim();
    if (isIdentifierName(id)) {
      const bool = parseBooleanLiteral(id);
      if (bool !== undefined) return bool;

      if (env) {
        const shadow = blockShadow.get(env);
        if (shadow && shadow.has(id)) throw new Error("Unknown identifier");
      }

      if (env && env.has(id)) {
        const item = env.get(id)!;
        if (item.type === "__deleted__") throw new Error("Unknown identifier");
        if (typeof item.value === "number") return item.value;
        // If it's a struct/array/pointer, return undefined so other handlers can try
        if (
          isStructValue(item.value) ||
          isArrayValue(item.value) ||
          isPointerValue(item.value)
        )
          return undefined;
        // Otherwise (e.g., FunctionValue), return it as an rvalue
        return item.value;
      }
      throw new Error("Unknown identifier");
    }
    return undefined;
  }

  const value = Number(numStr);
  if (!Number.isFinite(value)) return undefined;

  const hasSuffix = validateNumberSuffix(rest, value, numStr);

  if (rest !== "" && value < 0 && !hasSuffix) {
    throw new Error("Invalid trailing characters after negative number");
  }

  return value;
}
