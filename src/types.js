// Type checking utilities — widening rules, inference, validation.

export const TYPE_NULL = "NULL";

// Built-in function return types
const builtinReturnTypes = new Map([
  ["read", null], // untyped int
  ["readBool", "BOOL"],
]);

// Check if source type can be widened to target type.
// Source may be a string or an array of strings (union).
// Target may be a single string or an array of strings (union).
export function isWideningOk(source, target) {
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

  // Widening signed: I8 → I16, I8 → I32, I16 → I32, I8 → I64, I16 → I64, I32 → I64
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
