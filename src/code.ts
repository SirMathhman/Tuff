import type { Result, TuffError } from "./errors";
import {
  Bracket,
  blockEndsWithStatement,
  expectedClose,
  expectedEquals,
  expectedNumber,
  expectedVariableName,
  notMutable,
  reservedName,
  undefinedName,
  unexpectedSemicolon,
} from "./errors";
import type { Operator } from "./scanner";
import { readName, skipSpaces, toOperator } from "./scanner";
import type { Instruction, Names, Unit } from "./instructions";
import { InstructionKind, UnitKind } from "./instructions";
import {
  UNSUPPORTED_WHAT,
  compileFactor,
  compileFrom,
  unsupportedAt,
} from "./compile-expression";

// Words that have a fixed meaning and cannot name a variable.
const RESERVED_NAMES = new Set([
  "let",
  "mut",
  "true",
  "false",
  "if",
  "else",
  "fn",
  "while",
  "match",
  "case",
]);

/**
 * Compiles an expression with no variables into instructions.
 *
 * @param source - the expression.
 * @returns the instructions, or a TuffError.
 */
export function compileExpression(
  source: string,
): Result<Instruction[], TuffError> {
  const code: Instruction[] = [];
  const queue: Unit[] = [
    { code, pos: 0, names: new Map(), kind: UnitKind.Program },
  ];
  const drained = drain(source, queue);
  if (!drained.ok) return drained;
  return { ok: true, value: code };
}

/**
 * Compiles a program of let, assignment, blocks, and expressions, with the same errors
 * as interpretTuff for the constructs it covers.
 *
 * @param source - the program.
 * @returns the instructions, or a TuffError.
 */
export function compileProgram(
  source: string,
): Result<Instruction[], TuffError> | undefined {
  const code: Instruction[] = [];
  const queue: Unit[] = [
    { code, pos: 0, names: new Map(), kind: UnitKind.Program },
  ];
  const drained = drain(source, queue);
  if (!drained.ok) {
    const { error } = drained;
    return error.what === UNSUPPORTED_WHAT ? undefined : drained;
  }
  return { ok: true, value: code };
}

// Compiles every queued unit. Blocks found while compiling a unit are queued behind it,
// so no unit recurses into another.
function drain(source: string, queue: Unit[]): Result<true, TuffError> {
  for (let index = 0; index < queue.length; index++) {
    const unit = queue[index];
    if (unit === undefined) break;
    const compiled = compileUnit(source, unit, queue);
    if (!compiled.ok) return compiled;
  }
  return { ok: true, value: true };
}

// Compiles the statements and final expression of one unit.
function compileUnit(
  source: string,
  unit: Unit,
  queue: Unit[],
): Result<true, TuffError> {
  if (unit.kind === UnitKind.Condition) {
    return compileCondition(source, unit, queue);
  }
  if (unit.kind === UnitKind.Factor) return compileFactor(source, unit, queue);
  const { code, names } = unit;
  const block = unit.kind === UnitKind.Block;
  let pos = unit.pos;
  let statement = false;
  for (;;) {
    pos = skipSpaces(source, pos);
    if (pos >= source.length) {
      if (block) return expectedClose(source, pos, Bracket.Brace);
      break;
    }
    if (block && source.charAt(pos) === "}") {
      if (statement) return blockEndsWithStatement(pos);
      if (code.length === 0) return expectedNumber(source, pos);
      return { ok: true, value: true };
    }
    if (source.charAt(pos) === ";") return unexpectedSemicolon(pos);
    if (!block && source.charAt(pos) === "{") return unsupportedAt(pos);
    const end = readName(source, pos);
    const word = source.slice(pos, end);
    if (word === "let") {
      const next = compileLet(source, end, code, names, queue);
      if (!next.ok) return next;
      pos = next.value;
      statement = true;
      continue;
    }
    const assigned = compileAssign(source, pos, code, names, queue);
    if (assigned !== undefined) {
      if (!assigned.ok) return assigned;
      pos = assigned.value;
      statement = true;
      continue;
    }
    const expression = compileFrom(
      source,
      pos,
      names,
      undefined,
      queue,
      block ? "}" : undefined,
    );
    if (!expression.ok) return expression;
    const { value: compiledExpr } = expression;
    code.push(...compiledExpr.code);
    pos = compiledExpr.next;
    statement = false;
    if (block && source.charAt(pos) === "}") {
      return { ok: true, value: true };
    }
  }
  if (!block && statement) {
    code.push({ kind: InstructionKind.Push, where: source.length, value: 0 });
  } else if (!block && code.length === 0) {
    return expectedNumber(source, pos);
  }
  return { ok: true, value: true };
}

// Compiles the condition of an if: an expression that ends at its closing parenthesis.
function compileCondition(
  source: string,
  unit: Unit,
  queue: Unit[],
): Result<true, TuffError> {
  const { code, names, pos } = unit;
  const expression = compileFrom(source, pos, names, undefined, queue, ")");
  if (!expression.ok) return expression;
  const { value: compiledExpr } = expression;
  if (source.charAt(compiledExpr.next) !== ")") {
    return unsupportedAt(compiledExpr.next);
  }
  code.push(...compiledExpr.code);
  return { ok: true, value: true };
}

// Compiles `let [mut] NAME = value;` from the end of the `let` keyword.
function compileLet(
  source: string,
  letEnd: number,
  code: Instruction[],
  names: Names,
  queue: Unit[],
): Result<number, TuffError> {
  let nameStart = skipSpaces(source, letEnd);
  let nameEnd = readName(source, nameStart);
  let mutable = false;
  if (source.slice(nameStart, nameEnd) === "mut") {
    mutable = true;
    nameStart = skipSpaces(source, nameEnd);
    nameEnd = readName(source, nameStart);
  }
  if (nameEnd === nameStart) {
    return expectedVariableName(source, nameStart, "let");
  }
  const name = source.slice(nameStart, nameEnd);
  if (RESERVED_NAMES.has(name)) return reservedName(nameStart, name);
  const equals = skipSpaces(source, nameEnd);
  if (source.charAt(equals) !== "=") {
    return expectedEquals(source, equals, name);
  }
  const value = compileFrom(
    source,
    skipSpaces(source, equals + 1),
    names,
    "'let' statement",
    queue,
    undefined,
  );
  if (!value.ok) return value;
  const { value: compiledValue } = value;
  code.push(...compiledValue.code);
  code.push({
    kind: InstructionKind.Declare,
    where: nameStart,
    name,
    mutable,
  });
  names.set(name, mutable);
  return { ok: true, value: compiledValue.next + 1 };
}

// The operator of a compound assignment such as `+=`, given its first character.
function compoundOperator(ch: string): Operator | undefined {
  if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
    return toOperator(ch, 0);
  }
  return undefined;
}

// Compiles `NAME = value;` or `NAME op= value;` at `pos`, or returns undefined when the
// text is not an assignment.
function compileAssign(
  source: string,
  pos: number,
  code: Instruction[],
  names: Names,
  queue: Unit[],
): Result<number, TuffError> | undefined {
  const end = readName(source, pos);
  if (end === pos) return undefined;
  const name = source.slice(pos, end);
  if (name === "true" || name === "false") return undefined;
  const equals = skipSpaces(source, end);
  const operator = compoundOperator(source.charAt(equals));
  const compound = operator !== undefined && source.charAt(equals + 1) === "=";
  if (!compound && source.charAt(equals) !== "=") return undefined;
  const valueStart = skipSpaces(source, compound ? equals + 2 : equals + 1);
  const mutable = names.get(name);
  if (mutable === undefined) return undefinedName(pos, name);
  if (!mutable) return notMutable(pos, name);
  if (compound) {
    code.push({ kind: InstructionKind.Load, where: pos, name });
  }
  const value = compileFrom(
    source,
    valueStart,
    names,
    "assignment",
    queue,
    undefined,
  );
  if (!value.ok) return value;
  const { value: compiledValue } = value;
  code.push(...compiledValue.code);
  if (compound && operator !== undefined) {
    code.push({ kind: InstructionKind.Binary, where: pos, operator });
  }
  code.push({ kind: InstructionKind.Assign, where: pos, name });
  return { ok: true, value: compiledValue.next + 1 };
}
