import { textAt, isIdentifier, type Token } from "./tokenizer.ts";
import { ok, type Result, type TuffError } from "./errors.ts";
import { type FunctionDecl, type FunctionParam, type ScalarAnnotation, type StructDecl, type StructField } from "./ast.ts";
import { invalidAt, type ExprRule } from "./parse-errors.ts";
import { isStructName, parseAnnotation } from "./statements.ts";

/**
 * The function declarations after the structs, and the index just after them.
 */
export interface FunctionsParsed {
  /** The declarations in source order. */
  functions: FunctionDecl[];
  /** The index of the first token after the declarations. */
  next: number;
}

/**
 * Parses the function declarations that follow the structs: fn name(p : Type, ...) : Type => expr;.
 * @param tokens - The token list of the program.
 * @param start - The index of the first token after the structs.
 * @param expr - The expression rule used for each function body.
 * @returns The declarations and the index after them, or a structured error.
 */
export function parseFunctions(tokens: Token[], start: number, expr: ExprRule): Result<FunctionsParsed, TuffError> {
  const functions: FunctionDecl[] = [];
  let next = start;

  while (textAt(tokens, next) === "fn") {
    const declared = parseFunction(tokens, next, functions, expr);

    if (!declared.ok) {
      return declared;
    }

    functions.push(declared.value.decl);
    next = declared.value.next;
  }

  return ok({ functions, next });
}

interface FunctionParsed {
  decl: FunctionDecl;
  next: number;
}

// One declaration at pos. Parameters and the return type are scalar types, and the body is one expression.
function parseFunction(tokens: Token[], pos: number, earlier: FunctionDecl[], expr: ExprRule): Result<FunctionParsed, TuffError> {
  const name = textAt(tokens, pos + 1);

  if (!isIdentifier(name)) {
    return invalidAt(tokens, pos + 1, "a function name", "Write the function name after fn, such as fn add(...) : I32 => ...;.");
  }

  if (earlier.some((decl) => decl.name === name)) {
    return invalidAt(tokens, pos + 1, "a function name not declared before", "Give each function a different name.");
  }

  if (textAt(tokens, pos + 2) !== "(") {
    return invalidAt(tokens, pos + 2, "'(' after the function name", "Write the parameters between '(' and ')'.");
  }

  const params = parseParams(tokens, pos + 3);

  if (!params.ok) {
    return params;
  }

  if (textAt(tokens, params.value.next) !== ":") {
    return invalidAt(tokens, params.value.next, "':' before the return type", "Write the return type after ')', such as : I32.");
  }

  const returns = parseScalarType(tokens, params.value.next + 1);

  if (!returns.ok) {
    return returns;
  }

  if (textAt(tokens, returns.value.next) !== "=>") {
    return invalidAt(tokens, returns.value.next, "'=>' before the body", "Write the body after '=>', such as => first + second;.");
  }

  const body = expr(tokens, returns.value.next + 1, 0);

  if (!body.ok) {
    return body;
  }

  if (textAt(tokens, body.value.next) !== ";") {
    return invalidAt(tokens, body.value.next, "';' after the function body", "End the function declaration with ';'.");
  }

  return ok({
    decl: { name, params: params.value.params, returns: returns.value.type, body: body.value.value },
    next: body.value.next + 1,
  });
}

interface ParamsParsed {
  params: FunctionParam[];
  next: number;
}

// The parameters from pos through the closing ')': name : Type, separated by commas, each name used once.
function parseParams(tokens: Token[], pos: number): Result<ParamsParsed, TuffError> {
  const params: FunctionParam[] = [];

  if (textAt(tokens, pos) === ")") {
    return ok({ params, next: pos + 1 });
  }

  let next = pos;

  while (true) {
    const name = textAt(tokens, next);

    if (!isIdentifier(name)) {
      return invalidAt(tokens, next, "a parameter name", "Write each parameter as name : Type, such as first : I32.");
    }

    if (params.some((param) => param.name === name)) {
      return invalidAt(tokens, next, "a parameter name not used before in this function", "Give each parameter a different name.");
    }

    if (textAt(tokens, next + 1) !== ":") {
      return invalidAt(tokens, next + 1, "':' after the parameter name", "Write each parameter as name : Type.");
    }

    const type = parseScalarType(tokens, next + 2);

    if (!type.ok) {
      return type;
    }

    params.push({ name, annotation: type.value.type });
    next = type.value.next;

    if (textAt(tokens, next) === ")") {
      return ok({ params, next: next + 1 });
    }

    if (textAt(tokens, next) !== ",") {
      return invalidAt(tokens, next, "',' or ')' after the parameter", "Separate parameters with ',' and close the list with ')'.");
    }

    next += 1;
  }
}

interface ScalarParsed {
  type: ScalarAnnotation;
  next: number;
}

// A parameter or return type: a sized integer type or Bool. Struct and array types are not allowed here yet.
function parseScalarType(tokens: Token[], start: number): Result<ScalarParsed, TuffError> {
  const annotation = parseAnnotation(tokens, start);

  if (!annotation.ok) {
    return annotation;
  }

  if (typeof annotation.value.annotation !== "string") {
    return invalidAt(tokens, start, "a sized integer type or Bool", "Declare parameter and return types as a sized integer or Bool, such as I32.");
  }

  return ok({ type: annotation.value.annotation, next: annotation.value.next });
}

/**
 * The struct declarations at the start of a program, and the index just after them.
 */
export interface StructsParsed {
  /** The declarations in source order. */
  structs: StructDecl[];
  /** The index of the first token after the declarations. */
  next: number;
}

/**
 * Parses the struct declarations that begin a program: struct Name { field : Type, ... }.
 * @param tokens - The token list of the program.
 * @returns The declarations and the index after them, or a structured error.
 */
export function parseStructs(tokens: Token[]): Result<StructsParsed, TuffError> {
  const structs: StructDecl[] = [];
  let next = 0;

  while (textAt(tokens, next) === "struct") {
    const declared = parseStruct(tokens, next, structs);

    if (!declared.ok) {
      return declared;
    }

    structs.push(declared.value.decl);
    next = declared.value.next;
  }

  return ok({ structs, next });
}

interface StructParsed {
  decl: StructDecl;
  next: number;
}

// One declaration at pos. The fields are required, each name is used once, and a field's type is a
// scalar or array type, not another struct.
function parseStruct(tokens: Token[], pos: number, earlier: StructDecl[]): Result<StructParsed, TuffError> {
  const name = textAt(tokens, pos + 1);

  if (!isStructName(name)) {
    return invalidAt(tokens, pos + 1, "a struct name that starts with a capital letter", "Write the struct name with a capital first letter, such as struct Point { ... }.");
  }

  if (earlier.some((decl) => decl.name === name)) {
    return invalidAt(tokens, pos + 1, "a struct name not declared before", "Give each struct a different name.");
  }

  if (textAt(tokens, pos + 2) !== "{") {
    return invalidAt(tokens, pos + 2, "'{' after the struct name", "Write the fields between '{' and '}'.");
  }

  const fields: StructField[] = [];
  let next = pos + 3;

  while (true) {
    const mutable = textAt(tokens, next) === "mut";
    const nameAt = mutable ? next + 1 : next;
    const fieldName = textAt(tokens, nameAt);

    if (!isIdentifier(fieldName)) {
      return invalidAt(tokens, nameAt, "a field name", "Write each field as mut name : Type or name : Type.");
    }

    if (fields.some((field) => field.name === fieldName)) {
      return invalidAt(tokens, nameAt, "a field name not used before in this struct", "Give each field a different name.");
    }

    if (textAt(tokens, nameAt + 1) !== ":") {
      return invalidAt(tokens, nameAt + 1, "':' after the field name", "Write each field as name : Type.");
    }

    const type = parseAnnotation(tokens, nameAt + 2);

    if (!type.ok) {
      return type;
    }

    if (typeof type.value.annotation !== "string" && type.value.annotation.kind === "struct") {
      return invalidAt(tokens, nameAt + 2, "a sized integer type, Bool, or an array type", "Struct-typed fields are not supported yet; use a scalar or array type.");
    }

    fields.push({ name: fieldName, mutable, annotation: type.value.annotation });
    next = type.value.next;

    if (textAt(tokens, next) === "}") {
      return ok({ decl: { name, fields }, next: next + 1 });
    }

    if (textAt(tokens, next) !== ",") {
      return invalidAt(tokens, next, "',' or '}' after the field", "Separate fields with ',' and close the struct with '}'.");
    }

    next += 1;
  }
}
