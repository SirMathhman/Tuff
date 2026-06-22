// is_check lowering and validation utilities — extracted from index.js to reduce line count.
import {
  inferExprType,
  resolveAlias,
  isWideningOk,
  walkAstPostOrder,
} from "./types";

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
  walkAstPostOrder(node, (childNode) => {
    // If this node is an 'is_check', replace with boolean literal
    if (childNode.type !== "is_check") return;

    let exprType = inferExprType(childNode.expr, varTypes, fnSignatures);
    // Resolve aliases in expression type so we get STRUCT_NAME for named structs
    if (exprType) {
      exprType = resolveAlias(exprType, typeAliases);
    }
    // targetType may be a string, array (union), or struct literal marker from parseTypeRef
    let targetType;
    let targetIsInlineStruct = false;
    if (
      typeof childNode.targetType === "object" &&
      childNode.targetType.type === "__struct_literal__"
    ) {
      // Inline struct type check: `expr is { x : I32 }` → any named struct matches
      targetIsInlineStruct = true;
      targetType = "STRUCT"; // Placeholder, handled below
    } else if (Array.isArray(childNode.targetType)) {
      targetType = childNode.targetType;
    } else {
      targetType = childNode.targetType.toUpperCase();
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
    Object.assign(childNode, { type: "boollit", value: matches });
  });
}

// Validate function call arguments against declared parameter types.
export function validateCallArgs(node, varTypes, fnSignatures) {
  walkAstPostOrder(node, (childNode) => {
    // Check this node if it's a call with typed params
    if (!(childNode.type === "call" && !childNode.name.includes("::"))) return;

    const sig = fnSignatures.get(childNode.name);
    if (!sig || !sig.paramTypes) return;

    for (
      let i = 0;
      i < Math.min(sig.paramTypes.length, childNode.args?.length ?? 0);
      i++
    ) {
      const paramType = sig.paramTypes[i];
      if (!paramType) continue;
      const argExpr = childNode.args[i];
      const argType = inferExprType(argExpr, varTypes, fnSignatures);
      // If argument has a known type and it's incompatible with the parameter
      if (argType && !isWideningOk(argType, paramType)) {
        throw new Error(
          `Type mismatch: cannot pass ${argType} to parameter of type ${paramType}`,
        );
      }
    }
  });
}
