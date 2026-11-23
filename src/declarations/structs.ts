import { textAt, isIdentifier, type Token } from "../tokenizer.ts";
import { ok, type Result, type TuffError } from "../errors.ts";
import { type StructDecl, type StructField } from "../ast.ts";
import { invalidAt } from "../parse-errors.ts";
import { isStructName, parseAnnotation } from "../statements.ts";
// One declaration at pos. Parameters and the return type are scalar types, and the body is one expression.
// The parameters from pos through the closing ')': name : Type, separated by commas, each name used once.
// A parameter or return type: a sized integer type or Bool. Struct and array types are not allowed here yet.

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
