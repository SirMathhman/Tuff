import {
  getPointerTarget,
  isPointerMutable,
} from "../access/pointer-operations";
import type { BaseHandlerParams } from "../../utils/function/function-call-params";

function findAssignmentOperator(trimmed: string): number {
  for (let i = 1; i < trimmed.length; i++) {
    if (trimmed[i] === "=") {
      if (
        (i + 1 >= trimmed.length || trimmed[i + 1] !== "=") &&
        (i === 0 ||
          (trimmed[i - 1] !== "!" &&
            trimmed[i - 1] !== "<" &&
            trimmed[i - 1] !== ">" &&
            trimmed[i - 1] !== "="))
      ) {
        return i;
      }
    }
  }
  return -1;
}

function validateDereferenceTarget(
  lhs: string,
  pointerVarName: string,
  scope: Map<string, number>,
): { pointerValue: number; targetVarName: string } | undefined {
  if (!lhs.startsWith("*")) return undefined;
  if (!scope.has(pointerVarName)) return undefined;
  const pointerValue = scope.get(pointerVarName)!;
  const targetVarName = getPointerTarget(pointerValue);
  if (!targetVarName || !scope.has(targetVarName)) return undefined;
  if (!isPointerMutable(pointerValue)) {
    throw new Error(`cannot assign to immutable pointer`);
  }
  return { pointerValue, targetVarName };
}

function handleRestAfterDereference(
  newValue: number,
  rest: string,
  ctx: Pick<
    BaseHandlerParams,
    | "scope"
    | "typeMap"
    | "mutMap"
    | "uninitializedSet"
    | "unmutUninitializedSet"
    | "interpreter"
  >,
): number {
  if (rest === "") return newValue;
  return ctx.interpreter(
    rest,
    ctx.scope,
    ctx.typeMap,
    ctx.mutMap,
    ctx.uninitializedSet,
    ctx.unmutUninitializedSet,
  );
}

export function handleDereferenceAssignment(
  p: Pick<
    BaseHandlerParams,
    | "s"
    | "scope"
    | "typeMap"
    | "mutMap"
    | "uninitializedSet"
    | "unmutUninitializedSet"
    | "interpreter"
  >,
): number | undefined {
  const trimmed = p.s.trim();
  if (!trimmed.startsWith("*")) return undefined;
  const eqIdx = findAssignmentOperator(trimmed);
  if (eqIdx === -1) return undefined;
  const lhs = trimmed.slice(0, eqIdx).trim();
  const pointerVarName = lhs.slice(1).trim();
  const validation = validateDereferenceTarget(lhs, pointerVarName, p.scope);
  if (!validation) return undefined;
  const { targetVarName } = validation;
  const semiIdx = trimmed.indexOf(";", eqIdx);
  if (semiIdx === -1) return undefined;
  const newValue = p.interpreter(
    trimmed.slice(eqIdx + 1, semiIdx).trim(),
    p.scope,
    p.typeMap,
    p.mutMap,
    p.uninitializedSet,
    p.unmutUninitializedSet,
  );
  p.scope.set(targetVarName, newValue);
  const rest = trimmed.slice(semiIdx + 1).trim();
  return handleRestAfterDereference(newValue, rest, p);
}
