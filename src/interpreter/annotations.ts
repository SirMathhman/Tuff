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
  type RuntimeValue,
} from "../runtime/types";

export function checkAnnMatchesRhs(
  ann: RuntimeValue,
  rhsOperand: RuntimeValue
) {
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
  rhsOperand: RuntimeValue
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
  annotation: string | undefined | RuntimeValue,
  rhsOperand: RuntimeValue
) {
  if (!annotation) return;

  // array annotation: [Type; init; len]
  const parsedArray =
    typeof annotation === "string"
      ? parseArrayAnnotation(annotation)
      : undefined;
  if (parsedArray) return validateArrayAnnotation(parsedArray, rhsOperand);

  // slice annotation: *[Type]
  const parsedSlice =
    typeof annotation === "string"
      ? parseSliceAnnotation(annotation)
      : undefined;
  if (parsedSlice) return validateSliceAnnotation(parsedSlice, rhsOperand);

  // pointer annotation: *<inner>
  if (typeof annotation === "string" && /^\s*\*/.test(annotation)) {
    return validatePointerAnnotation(annotation, rhsOperand);
  }

  // If annotation is already a parsed operand object (from parsedAnnotation), use it
  if (typeof annotation !== "string") {
    checkAnnMatchesRhs(annotation, rhsOperand);
    return;
  }

  validateTypeOrLiteralAnnotation(annotation, rhsOperand);
}

function validateArrayAnnotation(
  parsedArray: ReturnType<typeof parseArrayAnnotation>,
  rhsOperand: RuntimeValue
) {
  if (!parsedArray) throw new Error("invalid array annotation");
  if (!isArrayInstance(rhsOperand))
    throw new Error("annotation requires array initializer");
  const arrLen = getProp(rhsOperand, "length");
  const initCount = getProp(rhsOperand, "initializedCount");
  if (typeof arrLen !== "number" || arrLen !== parsedArray.length)
    throw new Error("array length mismatch");
  if (typeof initCount !== "number" || initCount < parsedArray.initCount)
    throw new Error(
      "initializer does not provide required number of initialized elements"
    );
  // optionally validate element types later
}

function validateSliceAnnotation(
  parsedSlice: ReturnType<typeof parseSliceAnnotation>,
  rhsOperand: RuntimeValue
) {
  if (!parsedSlice) throw new Error("invalid slice annotation");
  if (!isPointer(rhsOperand) || getProp(rhsOperand, "ptrIsSlice") !== true)
    throw new Error("annotation requires slice pointer initializer");
  // No further checks here; runtime checks for length/init happen at use time.
}

function validatePointerAnnotation(annText: string, rhsOperand: RuntimeValue) {
  const inner = annText.replace(/^\s*\*/g, "").trim();
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
    // For pointers, check the pointer's target type matches the annotation
    // If the pointer doesn't have explicit kind/bits, the annotation is accepted
    const ptrKind = getProp(rhsOperand, "kind");
    const ptrBits = getProp(rhsOperand, "bits");
    if (ptrKind !== undefined && ptrBits !== undefined) {
      if (ptrKind !== parsedType.kind || ptrBits !== parsedType.bits)
        throw new Error("pointer type annotation does not match initializer");
    }
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
}

function validateTypeOrLiteralAnnotation(
  annotation: string,
  rhsOperand: RuntimeValue
) {
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
