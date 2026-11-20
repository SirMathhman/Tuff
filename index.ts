interface TuffError {
  what: string;
  where: number;
  why: string;
  fix: string;
}

interface Success<T> {
  ok: true;
  value: T;
}

interface Failure<E> {
  ok: false;
  error: E;
}

type Result<T, E> = Success<T> | Failure<E>;

enum Operator {
  Add = "+",
  Subtract = "-",
  Multiply = "*",
}

enum EntryKind {
  Operator = "operator",
  Group = "group",
  Binding = "binding",
}

enum Bracket {
  Paren = "(",
  Brace = "{",
}

enum Step {
  Continue = "continue",
  End = "end",
}

interface OperatorEntry {
  kind: EntryKind.Operator;
  operator: Operator;
}

// An open bracket, remembering its kind and the sign written directly before it.
interface GroupEntry {
  kind: EntryKind.Group;
  bracket: Bracket;
  sign: number;
}

// A `let` statement whose value is still being evaluated; ends at ";".
interface BindingEntry {
  kind: EntryKind.Binding;
  name: string;
}

type StackEntry = OperatorEntry | GroupEntry | BindingEntry;

type Scope = Map<string, number>;

interface ParserState {
  source: string;
  pos: number;
  values: number[];
  ops: StackEntry[];
  scopes: Scope[];
  depth: number; // number of open brackets
  expectOperand: boolean;
  atStatementStart: boolean;
  afterLet: boolean; // the last top-level statement was a `let`
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isLetter(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

function isSpace(ch: string): boolean {
  return ch.length === 1 && ch.trim() === "";
}

function toOperator(ch: string): Operator | null {
  if (ch === "+") return Operator.Add;
  if (ch === "-") return Operator.Subtract;
  if (ch === "*") return Operator.Multiply;
  return null;
}

function toBracket(ch: string): Bracket | null {
  if (ch === "(") return Bracket.Paren;
  if (ch === "{") return Bracket.Brace;
  return null;
}

function isCloser(ch: string): boolean {
  return ch === ")" || ch === "}";
}

function closerFor(bracket: Bracket): string {
  return bracket === Bracket.Paren ? ")" : "}";
}

function skipSpaces(source: string, pos: number): number {
  let idx = pos;
  while (isSpace(source.charAt(idx))) idx++;
  return idx;
}

function readDigits(source: string, start: number): number {
  let idx = start;
  while (isDigit(source.charAt(idx))) idx++;
  return idx;
}

function readName(source: string, start: number): number {
  let idx = start;
  while (isLetter(source.charAt(idx))) idx++;
  return idx;
}

function describe(ch: string): string {
  if (ch === "") return "the end of the input";
  if (isSpace(ch)) return "whitespace";
  return `'${ch}'`;
}

function fail(
  what: string,
  where: number,
  why: string,
  fix: string,
): Failure<TuffError> {
  return { ok: false, error: { what, where, why, fix } };
}

function expectedNumber(source: string, where: number): Failure<TuffError> {
  return fail(
    `Expected a number, a variable, '(', or '{' but found ${describe(source.charAt(where))}`,
    where,
    "Every '+', '-', or '*' must be followed by an integer, a variable, or a parenthesized or braced expression, and an expression must start with one.",
    "Put an integer, a variable, '(' or '{' at this position, or remove the operator before it.",
  );
}

function expectedOperator(
  source: string,
  where: number,
  grouped: boolean,
): Failure<TuffError> {
  const found = describe(source.charAt(where));
  if (grouped) {
    return fail(
      `Expected '+', '-', '*', ')', or '}' but found ${found}`,
      where,
      "Two terms can only be combined with '+', '-', or '*', and an opening bracket must be closed by its matching bracket; any other character cannot follow a number.",
      "Insert '+', '-', '*', or a closing bracket here, or remove the extra character.",
    );
  }
  return fail(
    `Expected '+', '-', or '*' but found ${found}`,
    where,
    "Two numbers can only be combined with '+', '-', or '*'; any other character cannot follow a number.",
    "Insert '+', '-', or '*' between the numbers, or remove the extra character.",
  );
}

function expectedClose(
  source: string,
  where: number,
  bracket: Bracket,
): Failure<TuffError> {
  const closer = closerFor(bracket);
  const noun = bracket === Bracket.Paren ? "parenthesized" : "braced";
  return fail(
    `Expected '${closer}' but found ${describe(source.charAt(where))}`,
    where,
    `Every '${bracket}' must be closed by a matching '${closer}'.`,
    `Add a '${closer}' at the end of the ${noun} expression.`,
  );
}

function expectedMismatch(
  source: string,
  where: number,
  bracket: Bracket,
): Failure<TuffError> {
  const closer = closerFor(bracket);
  return fail(
    `Expected '${closer}' to close '${bracket}' but found ${describe(source.charAt(where))}`,
    where,
    "Each opening bracket must be closed by its own kind of bracket: '(' by ')' and '{' by '}'.",
    `Replace this character with '${closer}', or change the opening bracket.`,
  );
}

function undefinedName(where: number, name: string): Failure<TuffError> {
  return fail(
    `Name '${name}' is not defined`,
    where,
    "A variable is only visible inside the block where it was declared with 'let', and inside blocks nested in that block.",
    `Declare it with 'let ${name} = ...;' before using it, in this block or an enclosing one.`,
  );
}

function expectedVariableName(
  source: string,
  where: number,
): Failure<TuffError> {
  return fail(
    `Expected a variable name after 'let' but found ${describe(source.charAt(where))}`,
    where,
    "A 'let' statement names the variable it declares, as in 'let x = 1;'.",
    "Write a name made of letters after 'let'.",
  );
}

function reservedName(where: number): Failure<TuffError> {
  return fail(
    "'let' is a keyword and cannot be a variable name",
    where,
    "'let' starts a declaration, so it cannot also name a variable.",
    "Choose a different name.",
  );
}

function expectedEquals(
  source: string,
  where: number,
  name: string,
): Failure<TuffError> {
  return fail(
    `Expected '=' after 'let ${name}' but found ${describe(source.charAt(where))}`,
    where,
    "A 'let' statement gives its variable a value with '='.",
    "Insert '=' between the name and its value.",
  );
}

function expectedSemicolon(source: string, where: number): Failure<TuffError> {
  return fail(
    `Expected ';' but found ${describe(source.charAt(where))}`,
    where,
    "Every 'let' statement must end with ';'.",
    "Add ';' after the value.",
  );
}

function letNotAllowed(where: number): Failure<TuffError> {
  return fail(
    "'let' is only allowed at the start of a statement",
    where,
    "A 'let' statement can only begin the program, a block, or follow a ';', so it cannot be part of a larger expression.",
    "Move the 'let' statement out of the parentheses or operator, or remove the 'let'.",
  );
}

function unexpectedSemicolon(where: number): Failure<TuffError> {
  return fail(
    "Unexpected ';' outside a let statement",
    where,
    "';' only ends a 'let' statement.",
    "Remove the ';', or start the statement with 'let name ='.",
  );
}

function precedence(op: Operator): number {
  return op === Operator.Multiply ? 2 : 1;
}

function apply(left: number, op: Operator, right: number): number {
  if (op === Operator.Add) return left + right;
  if (op === Operator.Subtract) return left - right;
  return left * right;
}

// Pops the newest operator and applies it to the two newest values. The grammar
// guarantees both operands are present.
function applyTop(values: number[], ops: StackEntry[]): void {
  const entry = ops.pop();
  if (entry?.kind !== EntryKind.Operator) return;
  const right = values.pop() ?? 0;
  const left = values.pop() ?? 0;
  values.push(apply(left, entry.operator, right));
}

// Applies every pending operator at the top of the stack.
function reduceOperators(values: number[], ops: StackEntry[]): void {
  for (
    let top = ops[ops.length - 1];
    top?.kind === EntryKind.Operator;
    top = ops[ops.length - 1]
  ) {
    applyTop(values, ops);
  }
}

// The newest open bracket on the stack, or null when none is open.
function innermostGroup(ops: StackEntry[]): GroupEntry | null {
  for (let idx = ops.length - 1; idx >= 0; idx--) {
    const entry = ops[idx];
    if (entry?.kind === EntryKind.Group) return entry;
  }
  return null;
}

// The newest open bracket or `let` on the stack, or null when there is none.
function innermostNonOperator(ops: StackEntry[]): StackEntry | null {
  for (let idx = ops.length - 1; idx >= 0; idx--) {
    const entry = ops[idx];
    if (entry !== undefined && entry.kind !== EntryKind.Operator) return entry;
  }
  return null;
}

// The innermost scope that defines `name`, or undefined.
function lookup(scopes: Scope[], name: string): number | undefined {
  for (let idx = scopes.length - 1; idx >= 0; idx--) {
    const value = scopes[idx]?.get(name);
    if (value !== undefined) return value;
  }
  return undefined;
}

// Closes the innermost group: applies its operators, then scales the result by
// the sign written before its opening bracket.
function closeGroup(values: number[], ops: StackEntry[]): void {
  reduceOperators(values, ops);
  const group = ops.pop();
  if (group?.kind !== EntryKind.Group) return;
  values.push(group.sign * (values.pop() ?? 0));
}

// Completes a `let`: its value is the newest value, bound in the current scope.
function closeBinding(state: ParserState, binding: BindingEntry): void {
  reduceOperators(state.values, state.ops);
  state.ops.pop();
  const value = state.values.pop() ?? 0;
  state.scopes[state.scopes.length - 1]?.set(binding.name, value);
  if (state.depth === 0) state.afterLet = true;
}

function pushOperand(state: ParserState, value: number, end: number): Step {
  state.values.push(value);
  state.pos = end;
  state.expectOperand = false;
  state.atStatementStart = false;
  return Step.Continue;
}

function openBracket(state: ParserState, bracket: Bracket, sign: number): Step {
  state.ops.push({ kind: EntryKind.Group, bracket, sign });
  if (bracket === Bracket.Brace) state.scopes.push(new Map());
  state.depth++;
  state.pos++;
  state.atStatementStart = bracket === Bracket.Brace;
  return Step.Continue;
}

// Reads `let NAME =` and leaves the parser ready for the value.
function startLet(
  state: ParserState,
  letEnd: number,
): Failure<TuffError> | Step {
  const nameStart = skipSpaces(state.source, letEnd);
  const nameEnd = readName(state.source, nameStart);
  if (nameEnd === nameStart)
    return expectedVariableName(state.source, nameStart);
  const name = state.source.slice(nameStart, nameEnd);
  if (name === "let") return reservedName(nameStart);
  const equals = skipSpaces(state.source, nameEnd);
  if (state.source.charAt(equals) !== "=") {
    return expectedEquals(state.source, equals, name);
  }
  state.ops.push({ kind: EntryKind.Binding, name });
  state.pos = skipSpaces(state.source, equals + 1);
  state.expectOperand = true;
  state.atStatementStart = false;
  return Step.Continue;
}

function operandName(
  state: ParserState,
  sign: number,
  signed: boolean,
): Failure<TuffError> | Step {
  const end = readName(state.source, state.pos);
  const name = state.source.slice(state.pos, end);
  if (name === "let") {
    if (state.atStatementStart && !signed) return startLet(state, end);
    return letNotAllowed(state.pos);
  }
  const value = lookup(state.scopes, name);
  if (value === undefined) return undefinedName(state.pos, name);
  return pushOperand(state, sign * value, end);
}

function operandNumber(
  state: ParserState,
  sign: number,
): Failure<TuffError> | Step {
  const end = readDigits(state.source, state.pos);
  if (end === state.pos) return expectedNumber(state.source, state.pos);
  return pushOperand(
    state,
    sign * parseInt(state.source.slice(state.pos, end), 10),
    end,
  );
}

// Reads an operand: a sign, then a number, a variable, or an opening bracket.
function stepOperand(state: ParserState): Failure<TuffError> | Step {
  state.pos = skipSpaces(state.source, state.pos);
  if (
    state.atStatementStart &&
    state.depth === 0 &&
    state.afterLet &&
    state.pos === state.source.length
  ) {
    return Step.End;
  }
  if (state.atStatementStart && state.source.charAt(state.pos) === ";") {
    return unexpectedSemicolon(state.pos);
  }
  let sign = 1;
  let ch = state.source.charAt(state.pos);
  const signed = ch === "+" || ch === "-";
  if (signed) {
    if (ch === "-") sign = -1;
    state.pos++;
    ch = state.source.charAt(state.pos);
  }
  const bracket = toBracket(ch);
  if (bracket !== null) return openBracket(state, bracket, sign);
  if (isLetter(ch)) return operandName(state, sign, signed);
  return operandNumber(state, sign);
}

function pushOperator(state: ParserState, op: Operator): void {
  // Left-associative: apply pending operators that bind at least as tightly.
  for (
    let top = state.ops[state.ops.length - 1];
    top?.kind === EntryKind.Operator &&
    precedence(top.operator) >= precedence(op);
    top = state.ops[state.ops.length - 1]
  ) {
    applyTop(state.values, state.ops);
  }
  state.ops.push({ kind: EntryKind.Operator, operator: op });
  state.pos++;
  state.expectOperand = true;
  state.atStatementStart = false;
}

function endOfInput(state: ParserState): Failure<TuffError> | Step {
  const group = innermostGroup(state.ops);
  if (state.depth > 0 && group !== null) {
    return expectedClose(state.source, state.pos, group.bracket);
  }
  if (innermostNonOperator(state.ops)?.kind === EntryKind.Binding) {
    return expectedSemicolon(state.source, state.pos);
  }
  return Step.End;
}

function endStatement(state: ParserState): Failure<TuffError> | Step {
  const open = innermostNonOperator(state.ops);
  if (open?.kind === EntryKind.Binding) {
    closeBinding(state, open);
    state.pos++;
    state.expectOperand = true;
    state.atStatementStart = true;
    return Step.Continue;
  }
  if (open?.kind === EntryKind.Group) {
    return expectedClose(state.source, state.pos, open.bracket);
  }
  return unexpectedSemicolon(state.pos);
}

function closeBracket(
  state: ParserState,
  ch: string,
): Failure<TuffError> | Step {
  if (innermostNonOperator(state.ops)?.kind === EntryKind.Binding) {
    return expectedSemicolon(state.source, state.pos);
  }
  const group = innermostGroup(state.ops);
  if (group === null) return expectedOperator(state.source, state.pos, true);
  if (ch !== closerFor(group.bracket)) {
    return expectedMismatch(state.source, state.pos, group.bracket);
  }
  closeGroup(state.values, state.ops);
  if (group.bracket === Bracket.Brace) state.scopes.pop();
  state.depth--;
  state.pos++;
  state.atStatementStart = false;
  return Step.Continue;
}

// Reads an operator, a closing bracket, or the end of the input.
function stepOperator(state: ParserState): Failure<TuffError> | Step {
  state.pos = skipSpaces(state.source, state.pos);
  if (state.pos === state.source.length) return endOfInput(state);
  const ch = state.source.charAt(state.pos);
  if (ch === ";") return endStatement(state);
  if (state.depth > 0 && isCloser(ch)) return closeBracket(state, ch);
  const op = toOperator(ch);
  if (op === null) {
    if (innermostNonOperator(state.ops)?.kind === EntryKind.Binding) {
      return expectedSemicolon(state.source, state.pos);
    }
    return expectedOperator(state.source, state.pos, state.depth > 0);
  }
  pushOperator(state, op);
  return Step.Continue;
}

/**
 * Evaluates a Tuff program: `let NAME = value;` statements followed by an
 * expression. Integers, variables, `+`, `-`, `*`, signs, parentheses, and braces
 * are supported. Braces open a block scope, and the value of a block is its last
 * expression. Uses explicit stacks, so nesting depth is not limited by the
 * JavaScript call stack. Offsets in errors refer to the unmodified source.
 *
 * @param tuffSource - the program to evaluate.
 * @returns the value on success, or a TuffError describing the first syntax error.
 */
export function interpretTuff(tuffSource: string): Result<number, TuffError> {
  const state: ParserState = {
    source: tuffSource,
    pos: 0,
    values: [],
    ops: [],
    scopes: [new Map()],
    depth: 0,
    expectOperand: true,
    atStatementStart: true,
    afterLet: false,
  };
  for (;;) {
    const outcome = state.expectOperand
      ? stepOperand(state)
      : stepOperator(state);
    if (outcome === Step.End) break;
    if (outcome !== Step.Continue) return outcome;
  }
  reduceOperators(state.values, state.ops);
  return { ok: true, value: state.values.pop() ?? 0 };
}
