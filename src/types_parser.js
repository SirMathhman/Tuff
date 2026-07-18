import { VALID_SUFFIXES } from "./types.js";

export function parseTypeAnnotation(parser, structs) {
  if (parser.peek().type !== "COLON") {
    throw new Error(`Expected : for type, got ${parser.peek().type}`);
  }
  parser.advance(); // consume ':'
  return parseType(parser, structs);
}

export function parseType(parser, structs) {
  // Check for array type [Type; Length]
  if (parser.peek().type === "LBRACKET") {
    return parseArrayType(parser, structs);
  }
  // Check for closure type (T1, T2) => ReturnType or tuple type (Type1, Type2, ...)
  if (parser.peek().type === "LPAREN") {
    return parseClosureOrTupleType(parser, structs, true);
  }
  const typeToken = parser.peek();
  if (typeToken.type !== "IDENTIFIER") {
    throw new Error(`Expected type, got ${typeToken.type}`);
  }
  const typeVal = typeToken.value;
  if (!VALID_SUFFIXES.has(typeVal) && !structs.has(typeVal)) {
    throw new Error(`Invalid type annotation: ${typeVal}`);
  }
  parser.advance();
  return typeVal;
}

export function parseClosureOrTupleType(parser, structs, allowClosure) {
  parser.advance(); // consume '('
  // Check for empty params () => ReturnType
  if (parser.peek().type === "RPAREN") {
    parser.advance(); // consume ')'
    // Check if this is a closure type
    if (allowClosure && parser.peek().type === "ARROW") {
      parser.advance(); // consume '=>'
      const retType = parseType(parser, structs);
      return `() => ${retType}`;
    }
    throw new Error("Empty tuple type is not allowed");
  }
  const elementTypes = [];
  while (parser.peek().type !== "RPAREN") {
    if (elementTypes.length > 0 && parser.peek().type === "COMMA") {
      parser.advance(); // consume ','
    }
    elementTypes.push(parseType(parser, structs));
  }
  parser.advance(); // consume ')'
  // Check if this is a closure type (T1, T2) => ReturnType
  if (allowClosure && parser.peek().type === "ARROW") {
    parser.advance(); // consume '=>'
    const retType = parseType(parser, structs);
    return `(${elementTypes.join(", ")}) => ${retType}`;
  }
  // Regular tuple type
  if (elementTypes.length === 0) {
    throw new Error("Empty tuple type is not allowed");
  }
  return `(${elementTypes.join(", ")})`;
}

export function parseArrayType(parser, structs) {
  parser.advance(); // consume '['
  const elementType = parseType(parser, structs);
  if (parser.peek().type !== "SEMICOLON") {
    throw new Error(`Expected ; in array type, got ${parser.peek().type}`);
  }
  parser.advance(); // consume ';'
  const lengthToken = parser.peek();
  if (lengthToken.type !== "NUMBER") {
    throw new Error(`Expected constant length in array type, got ${lengthToken.type}`);
  }
  const length = parseInt(lengthToken.value);
  parser.advance();
  if (parser.peek().type !== "RBRACKET") {
    throw new Error(`Expected ] in array type, got ${parser.peek().type}`);
  }
  parser.advance(); // consume ']'
  return `[${elementType}; ${length}]`;
}

export function parseReturnType(parser, structs) {
  if (parser.peek().type !== "COLON") {
    throw new Error(`Expected : for return type, got ${parser.peek().type}`);
  }
  parser.advance(); // consume ':'
  // Handle tuple return types like (I32, I32)
  if (parser.peek().type === "LPAREN") {
    const tupleType = parseClosureOrTupleType(parser, structs, false);
    if (parser.peek().type !== "ARROW") {
      throw new Error(`Expected => after return type, got ${parser.peek().type}`);
    }
    parser.advance(); // consume '=>'
    return tupleType;
  }
  const retTypeToken = parser.peek();
  if (retTypeToken.type !== "IDENTIFIER") {
    throw new Error(`Expected return type after :, got ${retTypeToken.type}`);
  }
  const retType = retTypeToken.value;
  if (!VALID_SUFFIXES.has(retType) && !structs.has(retType)) {
    throw new Error(`Invalid return type annotation: ${retType}`);
  }
  parser.advance();
  // Expect =>
  if (parser.peek().type !== "ARROW") {
    throw new Error(`Expected => after return type, got ${parser.peek().type}`);
  }
  parser.advance(); // consume '=>'
  return retType;
}
