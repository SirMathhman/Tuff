import type { Result } from "./result";
import { validateSizedInteger } from "../parsers/interpretHelpers";

export interface BindingLike {
  value: number;
  suffix?: string;
  assigned?: boolean;
  mutable?: boolean;
}

export function applyCompoundAssignment(
  existing: BindingLike,
  init: BindingLike,
  opChar: string
): Result<number, string> {
  if (existing.suffix && init.suffix && existing.suffix !== init.suffix)
    return { ok: false, error: "mixed suffixes not supported" };

  let newVal: number;
  switch (opChar) {
    case "+":
      newVal = existing.value + init.value;
      break;
    case "-":
      newVal = existing.value - init.value;
      break;
    case "*":
      newVal = existing.value * init.value;
      break;
    case "/":
      if (init.value === 0) return { ok: false, error: "division by zero" };
      newVal = existing.value / init.value;
      break;
    default:
      return { ok: false, error: "invalid assignment operator" };
  }

  if (!existing.suffix && init.suffix) existing.suffix = init.suffix;

  if (existing.suffix) {
    const err = validateSizedInteger(String(newVal), existing.suffix);
    if (err) return err;
  }

  existing.value = newVal;
  existing.assigned = true;
  return { ok: true, value: existing.value };
}

export function applyPlainAssignment(
  existing: BindingLike,
  init: BindingLike
): Result<number, string> {
  if (existing.suffix) {
    if (existing.suffix === "Bool") {
      if (!(init.value === 0 || init.value === 1))
        return {
          ok: false,
          error: "declaration initializer does not match annotation",
        };
    } else {
      const err = validateSizedInteger(String(init.value), existing.suffix);
      if (err) return err;
    }
  }

  if (!existing.suffix && init.suffix) existing.suffix = init.suffix;
  existing.value = init.value;
  existing.assigned = true;
  return { ok: true, value: existing.value };
}
