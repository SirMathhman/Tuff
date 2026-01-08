import { parseOperand, parseOperandAt } from "./parser";
import {
  evaluateReturningOperand,
  evaluateFlatExpression,
  isTruthy,
  applyBinaryOp,
  checkRange,
} from "./eval";

export function getLastTopLevelStatement(
  str: string,
  splitTopLevelStatements: (s: string) => string[]
): string | null {
  const parts = splitTopLevelStatements(str)
    .map((p: string) => p.trim())
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

export function evaluateRhs(
  rhs: string,
  envLocal: Record<string, any>,
  interpret: (input: string, env?: Record<string, any>) => number,
  getLastTopLevelStatement_fn: (s: string) => string | null
): any {
  if (/^\s*\{[\s\S]*\}\s*$/.test(rhs)) {
    const inner = rhs.replace(/^\{\s*|\s*\}$/g, "");
    const lastInner = getLastTopLevelStatement_fn(inner);
    if (!lastInner) throw new Error("initializer cannot be empty block");
    if (/^let\b/.test(lastInner))
      throw new Error("initializer cannot contain declarations");
    const v = interpret(inner, {});
    if (Number.isInteger(v)) return { valueBig: BigInt(v) };
    return { floatValue: v, isFloat: true };
  }
  if (/^\s*let\b/.test(rhs) || /\{[^}]*\blet\b/.test(rhs))
    throw new Error("initializer cannot contain declarations");
  return evaluateReturningOperand(rhs, envLocal);
}

export function checkAnnMatchesRhs(ann: any, rhsOperand: any) {
  if (!(ann as any).valueBig)
    throw new Error("annotation must be integer literal with suffix");
  if (!(rhsOperand as any).valueBig)
    throw new Error(
      "initializer must be integer-like to match annotated literal"
    );
  if ((ann as any).valueBig !== (rhsOperand as any).valueBig)
    throw new Error("annotation value does not match initializer");
  if ((rhsOperand as any).kind) {
    if (
      (ann as any).kind !== (rhsOperand as any).kind ||
      (ann as any).bits !== (rhsOperand as any).bits
    )
      throw new Error("annotation kind/bits do not match initializer");
  }
}

export function validateTypeOnly(kind: string, bits: number, rhsOperand: any) {
  if (!(rhsOperand as any).valueBig)
    throw new Error("annotation must be integer type matching initializer");
  if ((rhsOperand as any).kind) {
    if ((rhsOperand as any).kind !== kind || (rhsOperand as any).bits !== bits)
      throw new Error("annotation kind/bits do not match initializer");
  } else {
    checkRange(kind, bits, (rhsOperand as any).valueBig as bigint);
  }
}

export function validateAnnotation(
  annotation: string | null | any,
  rhsOperand: any
) {
  if (!annotation) return;

  // pointer annotation: *<inner>
  if (typeof annotation === "string" && /^\s*\*/.test(annotation)) {
    const inner = annotation.replace(/^\s*\*/g, "").trim();
    if (!rhsOperand || !(rhsOperand as any).pointer)
      throw new Error("annotation requires pointer initializer");
    // inner can be type-only like I32, Bool, or a literal operand
    const parsedType = (function (s: string) {
      const t = s.match(/^\s*([uUiI])\s*(\d+)\s*$/);
      if (!t) return null;
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
      if ((rhsOperand as any).ptrIsBool !== true)
        throw new Error("annotation Pointer Bool requires boolean initializer");
      return;
    }
    // otherwise inner might be a literal like 1I32
    const ann = parseOperand(inner);
    if (!ann) throw new Error("invalid annotation in let");
    // ensure pointer's pointed literal matches
    checkAnnMatchesRhs(ann, {
      valueBig: (rhsOperand as any).valueBig,
      kind: (rhsOperand as any).kind,
      bits: (rhsOperand as any).bits,
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
    if (
      !(rhsOperand as any).boolValue &&
      (rhsOperand as any).boolValue !== false
    )
      throw new Error("annotation Bool requires boolean initializer");
  } else {
    const ann = parseOperand(annotation);
    if (!ann) throw new Error("invalid annotation in let");
    checkAnnMatchesRhs(ann, rhsOperand);
  }
}

export function findMatchingParen(
  str: string,
  startIdx: number,
  openChar = "(",
  closeChar = ")"
) {
  let depth = 0;
  for (let i = startIdx; i < str.length; i++) {
    const ch = str[i];
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export { parseOperand };

export function extractAssignmentParts(stmt: string): {
  isDeref: boolean;
  isDeclOnly: boolean;
  name: string;
  op: string | null;
  rhs: string;
} | null {
  // Try deref compound assignment: *x += 1
  let m = stmt.match(/^\*\s*([a-zA-Z_]\w*)\s*([+\-*/%])=\s*(.+)$/);
  if (m) {
    return {
      isDeref: true,
      isDeclOnly: false,
      name: m[1],
      op: m[2],
      rhs: m[3].trim(),
    };
  }

  // Try compound assignment: x += 1
  m = stmt.match(/^([a-zA-Z_]\w*)\s*([+\-*/%])=\s*(.+)$/);
  if (m) {
    return {
      isDeref: false,
      isDeclOnly: false,
      name: m[1],
      op: m[2],
      rhs: m[3].trim(),
    };
  }

  // Try deref assignment: *x = ...
  m = stmt.match(/^\*\s*([a-zA-Z_]\w*)\s*=\s*(.+)$/);
  if (m) {
    return {
      isDeref: true,
      isDeclOnly: false,
      name: m[1],
      op: null,
      rhs: m[2].trim(),
    };
  }

  // Try simple assignment: x = ...
  m = stmt.match(/^([a-zA-Z_]\w*)\s*=\s*(.+)$/);
  if (m) {
    return {
      isDeref: false,
      isDeclOnly: false,
      name: m[1],
      op: null,
      rhs: m[2].trim(),
    };
  }

  return null;
}
