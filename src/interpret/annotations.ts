import { parseOperand } from "../parser";
import {
  isBoolOperand,
  isIntOperand,
  isPointer,
  isArrayInstance,
  getProp,
  hasKindBits,
  hasPtrIsBool,
  checkRange,
} from "../types";

export function checkAnnMatchesRhs(ann: unknown, rhsOperand: unknown) {
  if (!isIntOperand(ann))
    throw new Error("annotation must be integer literal with suffix");
  if (!isIntOperand(rhsOperand))
    throw new Error(
      "initializer must be integer-like to match annotated literal"
    );
  if (ann.valueBig !== rhsOperand.valueBig)
    throw new Error("annotation value does not match initializer");
  if (hasKindBits(rhsOperand)) {
    if (
      !hasKindBits(ann) ||
      ann.kind !== rhsOperand.kind ||
      ann.bits !== rhsOperand.bits
    )
      throw new Error("annotation kind/bits do not match initializer");
  }
}

export function validateTypeOnly(
  kind: string,
  bits: number,
  rhsOperand: unknown
) {
  if (!isIntOperand(rhsOperand))
    throw new Error("annotation must be integer type matching initializer");
  if (hasKindBits(rhsOperand)) {
    if (rhsOperand.kind !== kind || rhsOperand.bits !== bits)
      throw new Error("annotation kind/bits do not match initializer");
  } else {
    checkRange(kind, bits, rhsOperand.valueBig);
  }
}

export function parseArrayAnnotation(annotation: string | undefined) {
  if (!annotation || typeof annotation !== "string") return undefined;
  const m = annotation.match(
    /^\s*\[\s*([^;]+?)\s*;\s*(\d+)\s*;\s*(\d+)\s*\]\s*$/
  );
  if (!m) return undefined;
  const elemType = m[1].trim();
  const initCount = Number(m[2]);
  const length = Number(m[3]);
  if (!Number.isInteger(initCount) || !Number.isInteger(length))
    throw new Error("invalid array annotation");
  if (initCount < 0 || length < 0 || initCount > length)
    throw new Error("invalid array annotation counts");
  return { elemType, initCount, length };
}

// Slice annotation syntax: *[Type]
export function parseSliceAnnotation(annotation: string | undefined) {
  if (!annotation || typeof annotation !== "string") return undefined;
  const m = annotation.match(/^\s*\*\s*\[\s*([a-zA-Z_]\w*)\s*\]\s*$/);
  if (!m) return undefined;
  return { elemType: m[1].trim() };
}

export function validateAnnotation(
  annotation: string | undefined | unknown,
  rhsOperand: unknown
) {
  if (!annotation) return;

  // array annotation: [Type; init; len]
  const parsedArray =
    typeof annotation === "string"
      ? parseArrayAnnotation(annotation)
      : undefined;
  if (parsedArray) {
    if (!isArrayInstance(rhsOperand))
      throw new Error("annotation requires array initializer");
    const arr = rhsOperand;
    if (arr.length !== parsedArray.length)
      throw new Error("array length mismatch");
    if (arr.initializedCount < parsedArray.initCount)
      throw new Error(
        "initializer does not provide required number of initialized elements"
      );
    // optionally validate element types later
    return;
  }

  // slice annotation: *[Type]
  const parsedSlice =
    typeof annotation === "string"
      ? parseSliceAnnotation(annotation)
      : undefined;
  if (parsedSlice) {
    if (!isPointer(rhsOperand) || getProp(rhsOperand, "ptrIsSlice") !== true)
      throw new Error("annotation requires slice pointer initializer");
    // No further checks here; runtime checks for length/init happen at use time.
    return;
  }

  // pointer annotation: *<inner>
  if (typeof annotation === "string" && /^\s*\*/.test(annotation)) {
    const inner = annotation.replace(/^\s*\*/g, "").trim();
    if (!isPointer(rhsOperand))
      throw new Error("annotation requires pointer initializer");
    // inner can be type-only like I32, Bool, or a literal operand
    const parsedType = (function (s: string) {
      const t = s.match(/^\s*([uUiI])\s*(\d+)\s*$/);
      if (!t) return undefined;
      return {
        kind: t[1] === "u" || t[1] === "U" ? "u" : "i",
        bits: Number(t[2]),
      };
    })(inner);
    if (parsedType) {
      validateTypeOnly(parsedType.kind, parsedType.bits, rhsOperand);
      return;
    }
    if (/^\s*bool\s*$/i.test(inner)) {
      if (!hasPtrIsBool(rhsOperand) || rhsOperand.ptrIsBool !== true)
        throw new Error("annotation Pointer Bool requires boolean initializer");
      return;
    }
    // otherwise inner might be a literal like 1I32
    const ann = parseOperand(inner);
    if (!ann) throw new Error("invalid annotation in let");
    // ensure pointer's pointed literal matches
    checkAnnMatchesRhs(ann, {
      valueBig: getProp(rhsOperand, "valueBig"),
      kind: getProp(rhsOperand, "kind"),
      bits: getProp(rhsOperand, "bits"),
    });
    return;
  }

  // If annotation is already a parsed operand object (from parsedAnnotation), use it
  if (typeof annotation !== "string") {
    checkAnnMatchesRhs(annotation, rhsOperand);
    return;
  }

  const typeOnly = annotation.match(/^\s*([uUiI])\s*(\d+)\s*$/);
  if (typeOnly) {
    const kind = typeOnly[1] === "u" || typeOnly[1] === "U" ? "u" : "i";
    const bits = Number(typeOnly[2]);
    validateTypeOnly(kind, bits, rhsOperand);
  } else if (/^\s*bool\s*$/i.test(annotation)) {
    if (!isBoolOperand(rhsOperand))
      throw new Error("annotation Bool requires boolean initializer");
  } else {
    const ann = parseOperand(annotation);
    if (!ann) throw new Error("invalid annotation in let");
    checkAnnMatchesRhs(ann, rhsOperand);
  }
}
