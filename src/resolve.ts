import type { Expr, Program, Stmt } from "./parser.ts";
import { type Type, typeToString } from "./types.ts";

// --- Semantic analysis ---
//
// This stage sits between the parser and the code generator. It builds a
// symbol table from declarations and checks that every identifier reference
// is to a declared binding with a compatible type. The code generator can
// then assume the AST is well-formed.

export class ResolveError extends Error {}

// A declared binding: its type plus whether it may be reassigned.
interface Binding {
  type: Type;
  mutable: boolean;
}

type SymbolTable = Map<string, Binding>;

// Returns true if a value of type `actual` can be assigned to a slot of type
// `expected`. Widening (U8 -> U16) is allowed; narrowing (U16 -> U8) is not.
function typesCompatible(expected: Type, actual: Type): boolean {
  if (expected.kind === actual.kind) {
    return true;
  }
  // Widening: a smaller unsigned integer can be assigned to a larger one.
  if (expected.kind === "U16" && actual.kind === "U8") {
    return true;
  }
  if (expected.kind === "U32" && (actual.kind === "U8" || actual.kind === "U16")) {
    return true;
  }
  return false;
}

function describeLocation(): string {
  // Placeholder for richer source-location tracking in a future stage.
  return "";
}

// Validates that a suffixed integer literal fits within its type's range.
function checkLiteralRange(
  expr: Extract<Expr, { kind: "NumberLiteral" }>,
): void {
  const { value, suffix } = expr;

  switch (suffix) {
    case "U8":
      if (!Number.isInteger(value) || value < 0 || value > 255) {
        throw new ResolveError(
          `Value ${value} is out of range for U8 (expected 0..255)`,
        );
      }
      return;
    case "U16":
      if (!Number.isInteger(value) || value < 0 || value > 65535) {
        throw new ResolveError(
          `Value ${value} is out of range for U16 (expected 0..65535)`,
        );
      }
      return;
    case "U32":
      if (!Number.isInteger(value) || value < 0 || value > 4294967295) {
        throw new ResolveError(
          `Value ${value} is out of range for U32 (expected 0..4294967295)`,
        );
      }
      return;
    default:
      throw new ResolveError(`Unknown integer suffix '${suffix}'`);
  }
}

function typecheckExpr(expr: Expr, symbols: SymbolTable): Type {
  switch (expr.kind) {
    case "Identifier": {
      const binding = symbols.get(expr.name);
      if (binding === undefined) {
        throw new ResolveError(
          `Unknown identifier '${expr.name}'${describeLocation()}`,
        );
      }
      return binding.type;
    }
    case "NumberLiteral": {
      if (expr.suffix !== undefined) {
        checkLiteralRange(expr);
      }
      // A suffixed literal has that integer type; otherwise it's a plain Number.
      if (expr.suffix === "U8") {
        return { kind: "U8" };
      }
      if (expr.suffix === "U16") {
        return { kind: "U16" };
      }
      if (expr.suffix === "U32") {
        return { kind: "U32" };
      }
      return { kind: "Number" };
    }
    case "StringLiteral":
      return { kind: "Str" };
    case "Unary": {
      const operandType = typecheckExpr(expr.operand, symbols);
      if (operandType.kind !== "Number") {
        throw new ResolveError(
          `Unary '${expr.operator}' requires a number operand`,
        );
      }
      // U8 is unsigned, so negating a U8 literal is out of range.
      if (
        expr.operator === "-" &&
        expr.operand.kind === "NumberLiteral" &&
        expr.operand.suffix === "U8"
      ) {
        throw new ResolveError("Cannot negate a U8 literal");
      }
      return { kind: "Number" };
    }
    case "MemberAccess": {
      const objectType = typecheckExpr(expr.object, symbols);
      return typecheckMember(objectType, expr.property, expr.object);
    }
  }
}

function typecheckMember(
  objectType: Type,
  property: string,
  object: Expr,
): Type {
  // Dereference to find the underlying array/struct.
  let inner = objectType;
  while (inner.kind === "Ref") {
    inner = inner.inner;
  }

  if (inner.kind === "Array") {
    if (property === "length") {
      return { kind: "Number" };
    }
    throw new ResolveError(
      `Unknown property '${property}' on array type [${typeToString(inner.inner)}]`,
    );
  }

  throw new ResolveError(
    `Cannot access property '${property}' on a non-array value`,
  );
}

function typecheckStmt(stmt: Stmt, symbols: SymbolTable): void {
  switch (stmt.kind) {
    case "VariableDecl": {
      const valueType = typecheckExpr(stmt.value, symbols);
      if (stmt.type !== undefined && !typesCompatible(stmt.type, valueType)) {
        throw new ResolveError(
          `Cannot assign value of type ${typeToString(valueType)} to variable '${stmt.name}' of type ${typeToString(stmt.type)}`,
        );
      }
      symbols.set(stmt.name, {
        type: stmt.type ?? valueType,
        mutable: stmt.mutable,
      });
      break;
    }
    case "Assign": {
      const binding = symbols.get(stmt.target.name);
      if (binding === undefined) {
        throw new ResolveError(
          `Unknown identifier '${stmt.target.name}'${describeLocation()}`,
        );
      }
      if (!binding.mutable) {
        throw new ResolveError(
          `Cannot assign to immutable variable '${stmt.target.name}'`,
        );
      }
      const valueType = typecheckExpr(stmt.value, symbols);
      if (!typesCompatible(binding.type, valueType)) {
        throw new ResolveError(
          `Cannot assign value of type ${typeToString(valueType)} to variable '${stmt.target.name}' of type ${typeToString(binding.type)}`,
        );
      }
      break;
    }
    case "ExprStmt":
      typecheckExpr(stmt.expr, symbols);
      break;
  }
}

export function resolve(program: Program): Program {
  // Seed the symbol table with the declared `in` parameters.
  const symbols: SymbolTable = new Map(
    program.params.map((param) => [
      param.name,
      { type: param.type, mutable: false },
    ]),
  );

  for (const stmt of program.body) {
    typecheckStmt(stmt, symbols);
  }

  // Reject referencing an undeclared variable before emitting.
  return program;
}
