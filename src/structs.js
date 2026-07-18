import { inferType, isTupleType, splitTupleType, getTupleElementType } from "./types.js";
import { parseTypeAnnotation } from "./types_parser.js";

export function parseStructDefinition(parser, structs) {
  parser.advance(); // consume 'struct'
  const nameToken = parser.peek();
  if (nameToken.type !== "IDENTIFIER") {
    throw new Error(`Expected struct name, got ${nameToken.type}`);
  }
  const name = nameToken.value;
  if (structs.has(name)) {
    throw new Error(`Duplicate struct: ${name}`);
  }
  parser.advance(); // consume name
  if (parser.peek().type !== "LBRACE") {
    throw new Error(`Expected { for struct body, got ${parser.peek().type}`);
  }
  parser.advance(); // consume '{'
  const fields = [];
  while (parser.peek().type !== "RBRACE") {
    if (fields.length > 0 && parser.peek().type === "COMMA") {
      parser.advance(); // consume ','
    }
    const isMut = parser.peek().type === "MUT";
    if (isMut) parser.advance();
    const fieldName = parseIdentifier(parser);
    if (fields.some(f => f.name === fieldName)) {
      throw new Error(`Duplicate struct field: ${fieldName}`);
    }
    const fieldType = parseTypeAnnotation(parser, structs);
    fields.push({ name: fieldName, type: fieldType, mutable: isMut });
  }
  parser.advance(); // consume '}'
  structs.set(name, { fields });
  return { type: "structDef", name, fields };
}

export function parseStructInstantiation(parser, structName, variables, functions, structs) {
  parser.advance(); // consume struct name
  if (parser.peek().type !== "LBRACE") {
    throw new Error(`Expected { for struct instantiation, got ${parser.peek().type}`);
  }
  parser.advance(); // consume '{'
  const structDef = structs.get(structName);
  const fields = [];
  const seenFields = new Set();
  while (parser.peek().type !== "RBRACE") {
    if (fields.length > 0 && parser.peek().type === "COMMA") {
      parser.advance(); // consume ','
    }
    const fieldName = parseIdentifier(parser);
    if (!structDef.fields.some(f => f.name === fieldName)) {
      throw new Error(`Unknown field: ${fieldName} in struct ${structName}`);
    }
    if (seenFields.has(fieldName)) {
      throw new Error(`Duplicate field: ${fieldName} in struct instantiation`);
    }
    seenFields.add(fieldName);
    if (parser.peek().type !== "COLON") {
      throw new Error(`Expected : after field name, got ${parser.peek().type}`);
    }
    parser.advance(); // consume ':'
    const value = parseExpression(parser, variables, functions, structs);
    const fieldDef = structDef.fields.find(f => f.name === fieldName);
    validateStructFieldValue(value, fieldDef.type, structs);
    fields.push({ name: fieldName, value });
  }
  // Check all fields are present
  for (const field of structDef.fields) {
    if (!seenFields.has(field.name)) {
      throw new Error(`Missing field: ${field.name} in struct instantiation`);
    }
  }
  parser.advance(); // consume '}'
  const varName = `__${structName}_${Math.random().toString(36).slice(2)}`;
  return { type: "structInstantiation", structName, fields, varName };
}

export function parseFieldAccess(parser, name, variables, functions, structs) {
  parser.advance(); // consume name
  parser.advance(); // consume DOT
  let current = { type: "identifier", name };
  const fieldToken = parser.peek();
  if (fieldToken.type === "NUMBER") {
    // Tuple index access: x.0, x.1, etc.
    current = parseTupleIndexToken(parser, current, variables, structs);
  } else if (fieldToken.type === "IDENTIFIER") {
    parser.advance();
    current = buildFieldAccess(current, fieldToken.value, variables, structs);
  } else {
    throw new Error(`Expected field name or tuple index, got ${fieldToken.type}`);
  }
  // Check for chained access: obj.field.subfield, obj.0.1, obj.field[index], etc.
  while (parser.peek().type === "DOT" || parser.peek().type === "LBRACKET") {
    if (parser.peek().type === "DOT") {
      parser.advance(); // consume DOT
      const nextToken = parser.peek();
      if (nextToken.type === "NUMBER") {
        current = parseTupleIndexToken(parser, current, variables, structs);
      } else if (nextToken.type === "IDENTIFIER") {
        const nextField = parseIdentifier(parser);
        current = buildFieldAccess(current, nextField, variables, structs);
      } else {
        throw new Error(`Expected field name or tuple index, got ${nextToken.type}`);
      }
    } else {
      current = parseArrayIndexChain(parser, current, variables, functions, structs);
    }
  }
  return current;
}

export function parseArrayIndexChain(parser, base, variables, functions, structs) {
  parser.advance(); // consume '['
  const index = parseExpression(parser, variables, functions, structs);
  if (parser.peek().type !== "RBRACKET") {
    throw new Error(`Expected ], got ${parser.peek().type}`);
  }
  parser.advance(); // consume ']'
  return { type: "arrayIndex", name: base, index };
}

export function resolveExprType(expr, variables, structs) {
  if (expr.type === "identifier") {
    const info = variables.get(expr.name);
    return typeof info === "object" ? info.type : "unknown";
  }
  if (expr.type === "tupleIndex") {
    const baseType = resolveExprType(expr.tuple, variables, structs);
    if (isTupleType(baseType)) {
      return getTupleElementType(baseType, expr.index);
    }
    return "unknown";
  }
  if (expr.type === "fieldAccess") {
    const baseType = resolveExprType(expr.object, variables, structs);
    if (structs.has(baseType)) {
      const fieldDef = structs.get(baseType).fields.find((f) => f.name === expr.field);
      return fieldDef ? fieldDef.type : "unknown";
    }
    return "unknown";
  }
  if (expr.type === "tupleLiteral") {
    return `(${expr.elements.map((e) => resolveExprType(e, variables, structs)).join(", ")})`;
  }
  return inferType(expr);
}

export function parseTupleIndexToken(parser, base, variables, structs) {
  const token = parser.peek();
  if (token.suffix) {
    throw new Error(`Tuple index must be a plain integer, got ${token.value}${token.suffix}`);
  }
  if (token.negative) {
    throw new Error(`Tuple index must be non-negative, got ${token.value}`);
  }
  parser.advance(); // consume NUMBER
  let current = base;
  for (const part of token.value.split(".")) {
    const index = parseInt(part, 10);
    if (index < 0) {
      throw new Error(`Tuple index must be non-negative, got ${part}`);
    }
    const baseType = resolveExprType(current, variables, structs);
    if (isTupleType(baseType)) {
      const elTypes = splitTupleType(baseType);
      if (index >= elTypes.length) {
        throw new Error(`Tuple index ${index} out of bounds (length ${elTypes.length})`);
      }
    }
    current = { type: "tupleIndex", tuple: current, index };
  }
  return current;
}

export function buildFieldAccess(objExpr, fieldName, variables, structs) {
  const baseType = resolveExprType(objExpr, variables, structs);
  if (isTupleType(baseType)) {
    throw new Error(`Tuple index must be a constant integer, got field '${fieldName}'`);
  }
  return { type: "fieldAccess", object: objExpr, field: fieldName };
}

export function validateFieldMutable(fieldExpr, variables, structs) {
  // Extract base variable name and field chain from fieldExpr
  let base = fieldExpr;
  while (base.object) {
    base = base.object;
  }
  const varName = base.name;
  const varInfo = variables.get(varName);
  if (!varInfo || !varInfo.mutable) {
    throw new Error(`Variable ${varName} is not mutable`);
  }
  // Find struct type and check field mutability
  const structName = varInfo.type;
  const structDef = structs.get(structName);
  if (!structDef) {
    throw new Error(`Unknown struct type: ${structName}`);
  }
  // Walk field chain to find the target field
  let current = fieldExpr;
  let currentStruct = structDef;
  while (current.object && current.object.type === "fieldAccess") {
    const fieldName = current.object.field;
    const fieldDef = currentStruct.fields.find(f => f.name === fieldName);
    if (!fieldDef) throw new Error(`Unknown field: ${fieldName}`);
    current = current.object;
    // Navigate to nested struct if needed
    if (structs.has(fieldDef.type)) {
      currentStruct = structs.get(fieldDef.type);
    }
  }
  const targetField = current.field;
  const fieldDef = currentStruct.fields.find(f => f.name === targetField);
  if (!fieldDef || !fieldDef.mutable) {
    throw new Error(`Field ${targetField} is not mutable`);
  }
}

export function validateStructFieldValue(value, expectedType, structs) {
  const valueType = inferType(value);
  // Handle struct type matching
  if (structs.has(expectedType)) {
    if (valueType !== expectedType && value.type !== "structInstantiation") {
      throw new Error(`Type mismatch: expected ${expectedType}, got ${valueType}`);
    }
    return;
  }
  // Handle array type matching
  if (expectedType.startsWith("[")) {
    if (value.type !== "arrayLiteral") {
      throw new Error(`Type mismatch: expected ${expectedType}, got ${valueType}`);
    }
    return;
  }
  // Handle Bool vs numeric mismatch
  if (expectedType === "Bool") {
    if (valueType !== "Bool") {
      throw new Error(`Type mismatch: expected ${expectedType}, got ${valueType}`);
    }
    return;
  }
  if (valueType === "Bool") {
    throw new Error(`Type mismatch: expected ${expectedType}, got Bool`);
  }
  // For primitive numeric types, only flag if value is a typed literal with wrong suffix
  if (value.type === "number" && value.suffix && value.suffix !== expectedType) {
    throw new Error(`Type mismatch: expected ${expectedType}, got ${value.suffix}`);
  }
}

// Forward declarations for cross-module dependencies
let parseIdentifier, parseExpression;

export function setStructsDeps(deps) {
  parseIdentifier = deps.parseIdentifier;
  parseExpression = deps.parseExpression;
}
