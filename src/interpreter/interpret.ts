import type { Env } from "./types";
import { blockShadow } from "./env";
import { tryHandleAddition, tryHandleComparison } from "./arithmetic";
import { tryHandleFnExpression, tryHandleCall } from "./functions";
import { tryHandleIfExpression } from "./ifExpression";
import { tryHandleMatchExpression } from "./matchExpression";
import { evalBlock, handleYieldValue } from "./statements";
import {
  ensureIndexFound,
  isIdentifierName,
  splitTopLevel,
  stripOuterParens,
} from "./shared";
import { splitNumberAndSuffix, validateNumberSuffix } from "./numbers";
import { isStructValue } from "./structs";

export function interpret(input: string, env?: Env): number {
  let s = input.trim();
  if (s === "") return NaN;

  s = stripOuterParens(s);

  // block with statements e.g., "let x : I32 = 1; x"
  const topParts = splitTopLevel(s, ";");
  if (topParts.length > 1 || s.trim().startsWith("let ")) {
    return handleYieldValue(() => evalBlock(s, env));
  }

  const fieldAccessResult = tryHandleFieldAccess(s, env);
  if (fieldAccessResult !== undefined) return fieldAccessResult;

  const ifResult = tryHandleIfExpression(s, env);
  if (ifResult !== undefined) return ifResult;

  const matchResult = tryHandleMatchExpression(s, env);
  if (matchResult !== undefined) return matchResult;

  const fnExprResult = tryHandleFnExpression(s, env);
  if (fnExprResult !== undefined) return fnExprResult;

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
function tryParseNumberOrIdentifier(s: string, env?: Env): number | undefined {
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
        // If it's a struct value, we can't return it as a number, so return undefined
        // and let other handlers (like field access) deal with it
        if (isStructValue(item.value)) return undefined;
        throw new Error("Unknown identifier");
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
