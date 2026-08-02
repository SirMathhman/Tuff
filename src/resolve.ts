import type { Expr, Program, Stmt } from "./parser.ts";
import {
  checkIntegerRange,
  integerTypeFromSuffix,
  isAssignable,
  type Type,
  typeToString,
} from "./types.ts";

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

function describeLocation(): string {
  // Placeholder for richer source-location tracking in a future stage.
  return "";
}

// Validates that a suffixed integer literal fits within its type's range.
function checkLiteralRange(
  expr: Extract<Expr, { kind: "NumberLiteral" }>,
): void {
  if (expr.suffix !== undefined) {
    checkIntegerRange(expr.suffix, expr.value);
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
      const info =
        expr.suffix !== undefined
          ? integerTypeFromSuffix(expr.suffix)
          : undefined;
      if (info !== undefined) {
        return { kind: info.kind };
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
      if (stmt.type !== undefined && !isAssignable(stmt.type, valueType)) {
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
      if (!isAssignable(binding.type, valueType)) {
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
