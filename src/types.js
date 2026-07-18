export const VALID_SUFFIXES = new Set(["U8", "U16", "U32", "I8", "I16", "I32", "F32", "F64", "Bool"]);

export const SUFFIX_RANGES = {
  U8: { min: 0, max: 255 },
  U16: { min: 0, max: 65535 },
  U32: { min: 0, max: 4294967295 },
  I8: { min: -128, max: 127 },
  I16: { min: -32768, max: 32767 },
  I32: { min: -2147483648, max: 2147483647 },
};

export function parseNumberLiteral(source, i, negative) {
  let numStr = "";
  while (i < source.length && ((source[i] >= "0" && source[i] <= "9") || source[i] === ".")) {
    numStr += source[i];
    i++;
  }
  let suffix = "";
  if (i < source.length && "UIF".includes(source[i])) {
    while (i < source.length && ((source[i] >= "A" && source[i] <= "Z") || (source[i] >= "0" && source[i] <= "9"))) {
      suffix += source[i];
      i++;
    }
  }
  if (suffix && !VALID_SUFFIXES.has(suffix)) {
    throw new Error(`Invalid suffix: ${suffix}`);
  }
  validateSuffix(numStr, suffix, negative);
  const token = { type: "NUMBER", value: numStr, suffix, _end: i };
  if (negative) token.negative = true;
  return token;
}

function validateSuffix(numStr, suffix, negative) {
  if (!suffix) return;
  const range = SUFFIX_RANGES[suffix];
  if (!range) return; // F32/F64 don't have range constraints
  const value = negative ? -parseFloat(numStr) : parseFloat(numStr);
  if (value < range.min || value > range.max) {
    throw new Error(`Value ${value} out of range for ${suffix} (${range.min} to ${range.max})`);
  }
}

export function validateTypeAnnotation(expr, declaredType) {
  const exprType = inferType(expr);
  // Validate Bool type
  if (declaredType === "Bool") {
    if (exprType !== "Bool") {
      throw new Error(`Type mismatch: expected Bool, got ${exprType}`);
    }
    return;
  }
  // Reject boolean values for non-Bool types
  if (exprType === "Bool") {
    throw new Error(`Type mismatch: expected ${declaredType}, got Bool`);
  }
  // Handle array type validation
  if (declaredType.startsWith("[")) {
    if (expr.type !== "arrayLiteral") {
      throw new Error(`Type mismatch: expected array, got ${exprType}`);
    }
    const match = declaredType.match(/^\[(\w+); (\d+)\]$/);
    if (!match) throw new Error(`Invalid array type: ${declaredType}`);
    const [_, elementType, lengthStr] = match;
    const length = parseInt(lengthStr);
    if (expr.elements.length !== length) {
      throw new Error(`Array length mismatch: expected ${length}, got ${expr.elements.length}`);
    }
    for (const el of expr.elements) {
      const elType = inferType(el);
      if (elementType === "Bool") {
        if (elType !== "Bool") {
          throw new Error(`Type mismatch: expected Bool element, got ${elType}`);
        }
      } else if (elType === "Bool") {
        throw new Error(`Type mismatch: expected ${elementType} element, got Bool`);
      }
    }
    return;
  }
  // Only validate literal numbers at compile time
  if (expr.type !== "number") return;
  // If literal has a suffix, it must match the declared type
  if (expr.suffix && expr.suffix !== declaredType) {
    throw new Error(`Type mismatch: expected ${declaredType}, got ${expr.suffix}`);
  }
  // Validate value against declared type range
  const range = SUFFIX_RANGES[declaredType];
  if (!range) return; // F32/F64 don't have range constraints
  const value = expr.negative ? -parseFloat(expr.value) : parseFloat(expr.value);
  if (value < range.min || value > range.max) {
    throw new Error(`Value ${value} out of range for ${declaredType} (${range.min} to ${range.max})`);
  }
}

export function inferType(expr) {
  if (expr.type === "boolean") return "Bool";
  if (expr.type === "number") return expr.suffix || "number";
  if (expr.type === "identifier") return "unknown";
  if (expr.type === "structInstantiation") return expr.structName;
  if (expr.type === "arrayLiteral") {
    const elType = expr.elements.length > 0 ? inferType(expr.elements[0]) : "unknown";
    return `[${elType}; ${expr.elements.length}]`;
  }
  if (expr.type === "arrayIndex") return "unknown";
  if (expr.type === "fieldAccess") return "unknown";
  if (expr.type === "fnCall") return "unknown";
  if (expr.type === "binary") {
    if (expr.op === "&&" || expr.op === "||" || expr.op === "==" || expr.op === "!=" || expr.op === "<" || expr.op === ">" || expr.op === "<=" || expr.op === ">=") return "Bool";
    return inferType(expr.left);
  }
  if (expr.type === "unary") {
    if (expr.op === "!") return "Bool";
    return inferType(expr.operand);
  }
  if (expr.type === "block") return inferType(expr.finalExpr);
  if (expr.type === "if") return inferType(expr.thenBranch);
  return "unknown";
}
