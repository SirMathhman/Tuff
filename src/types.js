// Type checking utilities — widening rules, inference, validation.

export const TYPE_NULL = "NULL";

// Built-in function return types
const builtinReturnTypes = new Map([
  ["read", null], // untyped int
  ["readBool", "BOOL"],
]);

// Resolve a type name through aliases to its concrete base type.
// If typeName is an alias, returns the resolved base type (recursively).
// If not an alias or aliases map empty, returns typeName unchanged.
export function resolveAlias(typeName, aliases) {
  if (!aliases || !typeName) return typeName;
  const upper = Array.isArray(typeName)
    ? typeName.map((t) => t.toUpperCase())
    : typeName.toUpperCase();

  // Single type — resolve recursively up to avoid infinite loops
  if (typeof upper === "string") {
    let current = upper;
    let seen = new Set();
    while (aliases.has(current) && !seen.has(current)) {
      seen.add(current);
      const resolved = aliases.get(current);
      // Alias may resolve to a union array or single string
      if (Array.isArray(resolved)) return resolved.map((t) => t.toUpperCase());
      current = String(resolved).toUpperCase();
    }
    return current;
  }

  // Union — resolve each member
  if (Array.isArray(upper)) {
    const resolved = upper.map((t) => resolveAlias(t, aliases));
    // Flatten any nested arrays from union alias resolution
    return resolved.flat();
  }

  return typeName;
}

// Check if source type can be widened to target type.
// Source may be a string or an array of strings (union).
// Target may be a single string or an array of strings (union).
export function isWideningOk(source, target, aliases = new Map()) {
  // Resolve aliases first
  source = resolveAlias(source, aliases);
  target = resolveAlias(target, aliases);
  // If source is a union, succeed if any member matches the target
  if (Array.isArray(source))
    return source.some((s) => _isWideningOk(s, target));
  // If target is a union, succeed if any member matches
  if (Array.isArray(target))
    return target.some((t) => _isWideningOk(source, t));
  return _isWideningOk(source, target);
}

function _isWideningOk(source, target) {
  // Exact match is always fine
  if (source === target) return true;

  const decl = target.toUpperCase();
  const init = source.toUpperCase();

  // Widening unsigned: U8 → U16, U8 → U32, U16 → U32, U8 → U64, U16 → U64, U32 → U64
  const widenOk = new Set([
    "U8_U16",
    "U8_U32",
    "U16_U32",
    "U8_U64",
    "U16_U64",
    "U32_U64",
  ]);
  if (widenOk.has(`${init}_${decl}`)) return true;

  // Widening signed: I8 → I16, I8 → I32, I16 → I32, I8 → U64, I16 → U64, I32 → U64
  const widenSigned = new Set([
    "I8_I16",
    "I8_I32",
    "I16_I32",
    "I8_I64",
    "I16_I64",
    "I32_I64",
  ]);
  if (widenSigned.has(`${init}_${decl}`)) return true;

  return false;
}

// Check type compatibility between declared type and initializer literal suffix.
// typeName may be a string (single type) or an array (union).
export function checkTypeCompatibility(stmt, varTypes) {
  const decl = stmt.typeName; // already uppercase from _parseTypeAnnotation
  // Determine the source type from the initializer
  let initType = null;
  if (stmt.init?.suffix) {
    initType = stmt.init.suffix.toUpperCase();
  } else if (stmt.init?.type === "varref" && varTypes.has(stmt.init.name)) {
    initType = varTypes.get(stmt.init.name);
  } else if (stmt.init?.type === "nulllit") {
    initType = TYPE_NULL;
  }

  // No annotation or no known source type → OK
  if (!decl || !initType) return;

  if (!isWideningOk(initType, decl)) {
    const srcLabel =
      stmt.init?.suffix ?? `${stmt.init.name}:${varTypes.get(stmt.init.name)}`;
    throw new Error(
      `Type mismatch: cannot assign ${srcLabel} to variable of type ${Array.isArray(decl) ? decl.join(" | ") : decl}`,
    );
  }
}

// Infer the type of an initializer expression (returns uppercase type string or null).
export function inferInitType(init, varTypes) {
  if (!init) return null;
  if (init.suffix) return init.suffix.toUpperCase();
  if (init.type === "varref" && varTypes.has(init.name))
    return varTypes.get(init.name);
  if (init.type === "nulllit") return TYPE_NULL;
  // Default: untyped number → treat as generic, no constraint
  return null;
}

// Integer type bounds for overflow checking.
export const intBounds = new Map([
  ["U8", { min: 0, max: 255 }],
  ["U16", { min: 0, max: 65535 }],
  ["U32", { min: 0, max: 4294967295 }],
  ["I8", { min: -128, max: 127 }],
  ["I16", { min: -32768, max: 32767 }],
  ["I32", { min: -2147483648, max: 2147483647 }],
]);

// Walk AST in post-order (children before parent), calling callback on each node.
export function walkAstPostOrder(node, callback) {
  if (!node || typeof node !== "object") return;
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child))
      child.forEach((c) => walkAstPostOrder(c, callback));
    else if (child && typeof child === "object")
      walkAstPostOrder(child, callback);
  }
  callback(node);
}

// Check if a type is a known integer width.
function isIntType(type) {
  return intBounds.has(type);
}

// Compute the range {min, max} for an expression based on varTypes and varRanges.
// If we can determine exact bounds, returns {min, max}. Otherwise returns null.
function getExprRange(node, varTypes, varRanges) {
  if (!node || typeof node !== "object") return null;

  // Literal number: exact value
  if (typeof node.value === "number" && !isNaN(node.value)) {
    const val = Math.floor(node.value);
    return { min: val, max: val };
  }

  // Variable reference: use tracked range or fall back to type bounds
  if (node.type === "varref") {
    if (varRanges && varRanges.has(node.name)) {
      const r = varRanges.get(node.name);
      return { min: r.min, max: r.max };
    }
    // Fall back to type bounds
    const t = varTypes.get(node.name);
    if (t && isIntType(t)) {
      const b = intBounds.get(t);
      return { min: b.min, max: b.max };
    }
  }

  // Negation preserves range structure (flips and negates)
  if (node.type === "negate") {
    const innerRange = getExprRange(node.operand, varTypes, varRanges);
    if (innerRange) return { min: -innerRange.max, max: -innerRange.min };
  }

  // Binary arithmetic operation — propagate ranges through the op
  if (node.type === "binop" && ["+", "-", "*"].includes(node.op)) {
    const leftR = getExprRange(node.left, varTypes, varRanges);
    const rightR = getExprRange(node.right, varTypes, varRanges);
    if (!leftR || !rightR) return null;

    switch (node.op) {
      case "+":
        return { min: leftR.min + rightR.min, max: leftR.max + rightR.max };
      case "-":
        return { min: leftR.min - rightR.max, max: leftR.max - rightR.min };
      case "*": {
        // Multiplication range is the min/max of all corner products
        const corners = [
          leftR.min * rightR.min,
          leftR.min * rightR.max,
          leftR.max * rightR.min,
          leftR.max * rightR.max,
        ];
        return { min: Math.min(...corners), max: Math.max(...corners) };
      }
    }
  }

  return null;
}

// Infer the result type of a binary operation.
function inferBinopType(op, leftType, rightType) {
  // Arithmetic ops on same int type keep that type
  if (["+", "-", "*", "/"].includes(op)) {
    if (leftType && isIntType(leftType)) return leftType;
    if (rightType && isIntType(rightType)) return rightType;
  }
  // Comparison / logical ops → BOOL
  if (op === "==" || op === "!=") return "BOOL";
  // Default: unknown
  return null;
}

// Infer the type of an arbitrary expression node (returns uppercase type string or null).
export function inferExprType(node, varTypes, fnSignatures) {
  if (!node || typeof node !== "object") return null;
  // Literal with suffix
  if (node.suffix) return node.suffix.toUpperCase();
  // Variable reference
  if (node.type === "varref" && varTypes.has(node.name))
    return varTypes.get(node.name);
  // Boolean literal
  if (node.type === "boollit") return "BOOL";
  // Null literal
  if (node.type === "nulllit") return TYPE_NULL;
  // Ref expression: &x → *T where T is the type of x
  if (node.type === "ref") {
    const innerType = inferExprType(node.expr, varTypes, fnSignatures);
    return innerType ? `*${innerType}` : null;
  }
  // Built-in call
  if (node.type === "call" && builtinReturnTypes.has(node.name)) {
    return builtinReturnTypes.get(node.name);
  }
  // User function call — use declared return type
  if (
    node.type === "call" &&
    !node.name.includes("::") &&
    fnSignatures.has(node.name)
  ) {
    const sig = fnSignatures.get(node.name);
    return sig.returnType ? sig.returnType.toUpperCase() : null;
  }
  // Negation of a typed expression preserves the inner type
  if (node.type === "negate")
    return inferExprType(node.operand, varTypes, fnSignatures);
  // Binary operation — infer result type from operands
  if (node.type === "binop" && ["+", "-", "*", "/"].includes(node.op)) {
    const leftType = inferExprType(node.left, varTypes, fnSignatures);
    const rightType = inferExprType(node.right, varTypes, fnSignatures);
    return inferBinopType(node.op, leftType, rightType);
  }
  // is_check node: resolve at compile time → emit boolean literal
  if (node.type === "is_check") {
    const exprType = inferExprType(node.expr, varTypes, fnSignatures);
    const targetType = Array.isArray(node.targetType)
      ? node.targetType[0]
      : node.targetType.toUpperCase();
    const matches = exprType && _isWideningOk(exprType, targetType);
    return matches ? "BOOL" : null;
  }
  // Default: untyped → no constraint
  return null;
}

// Check if a binary operation would overflow the result type, using range analysis.
// varRanges tracks {min, max} per variable (from narrowing or type bounds).
export function checkOverflow(node, varTypes, fnSignatures, varRanges) {
  walkAstPostOrder(node, (childNode) => {
    // Only check arithmetic binops
    if (
      !(
        childNode.type === "binop" &&
        ["+", "-", "*", "/"].includes(childNode.op)
      )
    )
      return;

    let resultType =
      inferExprType(childNode.left, varTypes, fnSignatures) ??
      inferExprType(childNode.right, varTypes, fnSignatures);

    // If left and right have different int types, widen to the larger one
    const leftType = inferExprType(childNode.left, varTypes, fnSignatures);
    const rightType = inferExprType(childNode.right, varTypes, fnSignatures);
    if (leftType && rightType) {
      // Pick the wider type as result type
      if (isIntType(leftType) && isWideningOk(rightType, leftType)) {
        resultType = leftType;
      } else if (isIntType(rightType) && isWideningOk(leftType, rightType)) {
        resultType = rightType;
      }
    }

    if (!(resultType && isIntType(resultType))) return;

    // Get ranges for both operands
    const leftRange = getExprRange(childNode.left, varTypes, varRanges);
    const rightRange = getExprRange(childNode.right, varTypes, varRanges);

    // If we can't determine ranges for both, skip (conservative)
    if (!leftRange || !rightRange) return;

    let resultMin, resultMax;
    switch (childNode.op) {
      case "+":
        resultMin = leftRange.min + rightRange.min;
        resultMax = leftRange.max + rightRange.max;
        break;
      case "-":
        resultMin = leftRange.min - rightRange.max;
        resultMax = leftRange.max - rightRange.min;
        break;
      case "*": {
        const corners = [
          leftRange.min * rightRange.min,
          leftRange.min * rightRange.max,
          leftRange.max * rightRange.min,
          leftRange.max * rightRange.max,
        ];
        resultMin = Math.min(...corners);
        resultMax = Math.max(...corners);
        break;
      }
      default:
        return; // Division overflow is rare (only I32.MIN / -1), skip for now
    }

    const bounds = intBounds.get(resultType);
    if (resultMin < bounds.min || resultMax > bounds.max) {
      throw new Error(
        `Integer overflow: operation may produce range [${resultMin}, ${resultMax}] which does not fit in ${resultType} [${bounds.min}, ${bounds.max}]`,
      );
    }
  });
}
