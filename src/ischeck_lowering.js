// is_check lowering and validation utilities — extracted from index.js to reduce line count.
import { inferExprType, resolveAlias, isWideningOk } from "./types";

export function extractIsNarrowings(node) {
  const narrowings = new Map();
  if (!node || typeof node !== "object") return narrowings;

  // Recurse into children first (post-order)
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) child.forEach((c) => extractIsNarrowings(c));
    else if (child && typeof child === "object") extractIsNarrowings(child);
  }

  // If this is an 'is_check' with a varref on the left, record narrowing
  if (node.type === "is_check" && node.expr?.type === "varref") {
    const targetType = Array.isArray(node.targetType)
      ? node.targetType[0] // Narrow to first member of union target
      : node.targetType;
    narrowings.set(node.expr.name, targetType);
  }

  return narrowings;
}

// Lower 'is_check' nodes to boolean literals at compile time based on inferred types.
export function lowerIsCheck(
  node,
  varTypes,
  fnSignatures,
  typeAliases = new Map(),
) {
  if (!node || typeof node !== "object") return;

  // Recurse into children first (post-order)
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child))
      child.forEach((c) =>
        lowerIsCheck(c, varTypes, fnSignatures, typeAliases),
      );
    else if (child && typeof child === "object")
      lowerIsCheck(child, varTypes, fnSignatures, typeAliases);
  }

  // If this node is an 'is_check', replace with boolean literal
  if (node.type === "is_check") {
    let exprType = inferExprType(node.expr, varTypes, fnSignatures);
    // Resolve aliases in expression type so we get STRUCT_NAME for named structs
    if (exprType) {
      exprType = resolveAlias(exprType, typeAliases);
    }
    // targetType may be a string, array (union), or struct literal marker from parseTypeRef
    let targetType;
    let targetIsInlineStruct = false;
    if (
      typeof node.targetType === "object" &&
      node.targetType.type === "__struct_literal__"
    ) {
      // Inline struct type check: `expr is { x : I32 }` → any named struct matches
      targetIsInlineStruct = true;
      targetType = "STRUCT"; // Placeholder, handled below
    } else if (Array.isArray(node.targetType)) {
      targetType = node.targetType;
    } else {
      targetType = node.targetType.toUpperCase();
    }
    let matches;
    if (exprType) {
      // Handle struct type checking with proper named vs anonymous distinction
      const exprIsNamedStruct =
        typeof exprType === "string" && exprType.startsWith("STRUCT_");
      const exprIsAnonymousStruct = exprType === "STRUCT";
      if (targetIsInlineStruct) {
        // `temp is { x : I32 }` — any struct (named or anonymous) matches inline struct literal
        matches = exprIsNamedStruct || exprIsAnonymousStruct;
      } else {
        // Resolve alias in target type for non-inline targets
        const resolvedTarget = resolveAlias(targetType, typeAliases);
        const targetIsNamedStruct =
          typeof resolvedTarget === "string" &&
          resolvedTarget.startsWith("STRUCT_");

        if (targetIsNamedStruct) {
          // `temp is Wrapper` — only exact same named struct matches
          matches = exprType === resolvedTarget;
        } else {
          // Non-struct type check: use normal widening rules
          matches = isWideningOk(exprType, targetType, typeAliases);
        }
      }
    } else {
      // Unknown expression type → default to false at compile time
      matches = false;
    }
    // Replace with boolean literal node (same as 'true'/'false')
    Object.assign(node, { type: "boollit", value: matches });
  }
}

// Validate function call arguments against declared parameter types.
export function validateCallArgs(node, varTypes, fnSignatures) {
  if (!node || typeof node !== "object") return;

  // Check this node if it's a call with typed params
  if (node.type === "call" && !node.name.includes("::")) {
    const sig = fnSignatures.get(node.name);
    if (sig && sig.paramTypes) {
      for (
        let i = 0;
        i < Math.min(sig.paramTypes.length, node.args?.length);
        i++
      ) {
        const paramType = sig.paramTypes[i];
        if (!paramType) continue;
        const argExpr = node.args[i];
        const argType = inferExprType(argExpr, varTypes, fnSignatures);
        // If argument has a known type and it's incompatible with the parameter
        if (argType && !isWideningOk(argType, paramType)) {
          throw new Error(
            `Type mismatch: cannot pass ${argType} to parameter of type ${paramType}`,
          );
        }
      }
    }
  }

  // Recurse into children
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child))
      child.forEach((c) => validateCallArgs(c, varTypes, fnSignatures));
    else if (child && typeof child === "object")
      validateCallArgs(child, varTypes, fnSignatures);
  }
}
