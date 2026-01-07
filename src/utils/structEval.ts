import { findMatchingBrace } from "../commonUtils";
import { Binding, StructBinding, StructInstance } from "../matchEval";
import { Result, err, isErr, ok } from "../result";
import { splitTopLevelCommaSeparated } from "./splitTopLevel";
import { Token } from "../tokenize";

export interface SubstituteResult {
  token: Token;
  consumed: number;
}

interface ExprEvalFn {
  (tokens: Token[], env: Map<string, Binding>): Result<number, string>;
}

function getStructBinding(
  env: Map<string, Binding>,
  structName: string
): Result<StructBinding, string> {
  const binding = env.get(structName);
  if (!binding || binding.type !== "struct") return err("Undefined struct");
  return ok(binding);
}

export function evaluateStructInstantiation(
  tokens: Token[],
  nameIdx: number,
  braceIdx: number,
  env: Map<string, Binding>,
  evalExprWithEnv: ExprEvalFn
): Result<SubstituteResult, string> {
  const nameTok = tokens[nameIdx];
  if (!nameTok || nameTok.type !== "ident") return err("Invalid numeric input");

  const structName = nameTok.value as string;
  const bindingRes = getStructBinding(env, structName);
  if (isErr(bindingRes)) return err(bindingRes.error);
  const structBinding = bindingRes.value;

  const braceEnd = findMatchingBrace(tokens, braceIdx);
  if (braceEnd === -1) return err("Invalid numeric input");

  const fieldTokens = tokens.slice(braceIdx + 1, braceEnd);
  const fieldValues = new Map<string, number>();

  if (fieldTokens.length === 0) {
    if (structBinding.fields.length !== 0) {
      return err("Struct instantiation: missing field values");
    }

    const instance: StructInstance = { structName, fieldValues };
    return ok({
      token: { type: "struct", value: instance },
      consumed: braceEnd - nameIdx + 1,
    });
  }

  const partsRes = splitTopLevelCommaSeparated(fieldTokens);
  if (isErr(partsRes)) return err(partsRes.error);
  const fieldExprs = partsRes.value;

  if (fieldExprs.length !== structBinding.fields.length) {
    return err("Struct instantiation: field count mismatch");
  }

  for (let i = 0; i < fieldExprs.length; i++) {
    const exprRes = evalExprWithEnv(fieldExprs[i], env);
    if (isErr(exprRes)) return err(exprRes.error);
    fieldValues.set(structBinding.fields[i].name, exprRes.value);
  }

  const instance: StructInstance = { structName, fieldValues };
  return ok({
    token: { type: "struct", value: instance },
    consumed: braceEnd - nameIdx + 1,
  });
}

export function evaluateFieldAccess(
  tokens: Token[],
  varIdx: number,
  dotIdx: number,
  env: Map<string, Binding>
): Result<SubstituteResult, string> {
  const varTok = tokens[varIdx];
  if (!varTok || varTok.type !== "ident") return err("Invalid numeric input");

  const varName = varTok.value as string;
  const binding = env.get(varName);
  if (!binding || binding.type !== "var") return err("Undefined variable");

  const instance = binding.value;
  if (
    typeof instance !== "object" ||
    !instance ||
    !("structName" in instance)
  ) {
    return err("Cannot access field on non-struct value");
  }

  const fieldTok = tokens[dotIdx + 1];
  if (!fieldTok || fieldTok.type !== "ident")
    return err("Invalid field access");

  const fieldName = fieldTok.value as string;
  const fieldValue = instance.fieldValues.get(fieldName);
  if (fieldValue === undefined) return err("Undefined field");

  return ok({ token: { type: "num", value: fieldValue }, consumed: 3 });
}
