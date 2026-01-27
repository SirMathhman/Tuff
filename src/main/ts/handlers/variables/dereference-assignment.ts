import {
  getPointerTarget,
  isPointerMutable,
} from "../access/pointer-operations";
import type { BaseHandlerParams } from "../../utils/function/function-call-params";
import { throwCannotAssignToImmutablePointer } from "../../utils/helpers/pointer-errors";

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
  visMap?: Map<string, boolean>,
): { pointerValue: number; targetVarName: string } | undefined {
  if (!lhs.startsWith("*")) return undefined;
  if (!scope.has(pointerVarName)) return undefined;
  const pointerValue = scope.get(pointerVarName)!;
  const targetVarName = getPointerTarget(pointerValue);
  if (!targetVarName || !scope.has(targetVarName)) return undefined;
  if (!isPointerMutable(pointerValue)) {
    throwCannotAssignToImmutablePointer();
  }

  // Check if pointer parameter has 'out' capability
  // We use visMap to store parameter capabilities during function calls
  // with a special prefix to distinguish from module visibility
  if (visMap && visMap.has("__out_capability__" + pointerVarName)) {
    const hasOut = visMap.get("__out_capability__" + pointerVarName);
    if (!hasOut) {
      throw new Error(
        `Pointer parameter '${pointerVarName}' must be marked 'out' to allow modification of its target`,
      );
    }
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
    | "visMap"
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
    ctx.visMap,
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
    | "visMap"
  >,
): number | undefined {
  const trimmed = p.s.trim();
  if (!trimmed.startsWith("*")) return undefined;
  const eqIdx = findAssignmentOperator(trimmed);
  if (eqIdx === -1) return undefined;
  const lhs = trimmed.slice(0, eqIdx).trim();
  const pointerVarName = lhs.slice(1).trim();
  const validation = validateDereferenceTarget(
    lhs,
    pointerVarName,
    p.scope,
    p.visMap,
  );
  if (!validation) return undefined;
  const { targetVarName } = validation;
  const semiIdx = trimmed.indexOf(";", eqIdx);

  const newValue = p.interpreter(
    semiIdx === -1
      ? trimmed.slice(eqIdx + 1).trim()
      : trimmed.slice(eqIdx + 1, semiIdx).trim(),
    p.scope,
    p.typeMap,
    p.mutMap,
    p.uninitializedSet,
    p.unmutUninitializedSet,
    p.visMap,
  );
  p.scope.set(targetVarName, newValue);
  if (semiIdx === -1) return newValue;
  const rest = trimmed.slice(semiIdx + 1).trim();
  return handleRestAfterDereference(newValue, rest, p);
}
