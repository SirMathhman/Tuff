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

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

function isLetter(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
}

function isSpace(c: string): boolean {
  return c.length === 1 && c.trim() === "";
}

function toOperator(c: string): Operator | null {
  if (c === "+") return Operator.Add;
  if (c === "-") return Operator.Subtract;
  if (c === "*") return Operator.Multiply;
  return null;
}

function toBracket(c: string): Bracket | null {
  if (c === "(") return Bracket.Paren;
  if (c === "{") return Bracket.Brace;
  return null;
}

function isCloser(c: string): boolean {
  return c === ")" || c === "}";
}

function closerFor(bracket: Bracket): string {
  return bracket === Bracket.Paren ? ")" : "}";
}

function skipSpaces(source: string, pos: number): number {
  let i = pos;
  while (isSpace(source.charAt(i))) i++;
  return i;
}

function readDigits(source: string, start: number): number {
  let i = start;
  while (isDigit(source.charAt(i))) i++;
  return i;
}

function readName(source: string, start: number): number {
  let i = start;
  while (isLetter(source.charAt(i))) i++;
  return i;
}

function describe(c: string): string {
  if (c === "") return "the end of the input";
  if (isSpace(c)) return "whitespace";
  return `'${c}'`;
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
  for (let i = ops.length - 1; i >= 0; i--) {
    const entry = ops[i];
    if (entry?.kind === EntryKind.Group) return entry;
  }
  return null;
}

// The newest open bracket or `let` on the stack, or null when there is none.
function innermostNonOperator(ops: StackEntry[]): StackEntry | null {
  for (let i = ops.length - 1; i >= 0; i--) {
    const entry = ops[i];
    if (entry !== undefined && entry.kind !== EntryKind.Operator) return entry;
  }
  return null;
}

// The innermost scope that defines `name`, or undefined.
function lookup(scopes: Scope[], name: string): number | undefined {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const value = scopes[i]?.get(name);
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
function closeBinding(s: ParserState, binding: BindingEntry): void {
  reduceOperators(s.values, s.ops);
  s.ops.pop();
  const value = s.values.pop() ?? 0;
  s.scopes[s.scopes.length - 1]?.set(binding.name, value);
  if (s.depth === 0) s.afterLet = true;
}

function pushOperand(s: ParserState, value: number, end: number): Step {
  s.values.push(value);
  s.pos = end;
  s.expectOperand = false;
  s.atStatementStart = false;
  return Step.Continue;
}

function openBracket(s: ParserState, bracket: Bracket, sign: number): Step {
  s.ops.push({ kind: EntryKind.Group, bracket, sign });
  if (bracket === Bracket.Brace) s.scopes.push(new Map());
  s.depth++;
  s.pos++;
  s.atStatementStart = bracket === Bracket.Brace;
  return Step.Continue;
}

// Reads `let NAME =` and leaves the parser ready for the value.
function startLet(s: ParserState, letEnd: number): Failure<TuffError> | Step {
  const nameStart = skipSpaces(s.source, letEnd);
  const nameEnd = readName(s.source, nameStart);
  if (nameEnd === nameStart) return expectedVariableName(s.source, nameStart);
  const name = s.source.slice(nameStart, nameEnd);
  if (name === "let") return reservedName(nameStart);
  const equals = skipSpaces(s.source, nameEnd);
  if (s.source.charAt(equals) !== "=") {
    return expectedEquals(s.source, equals, name);
  }
  s.ops.push({ kind: EntryKind.Binding, name });
  s.pos = skipSpaces(s.source, equals + 1);
  s.expectOperand = true;
  s.atStatementStart = false;
  return Step.Continue;
}

function operandName(
  s: ParserState,
  sign: number,
  signed: boolean,
): Failure<TuffError> | Step {
  const end = readName(s.source, s.pos);
  const name = s.source.slice(s.pos, end);
  if (name === "let" && s.atStatementStart && !signed) return startLet(s, end);
  const value = lookup(s.scopes, name);
  if (value === undefined) return undefinedName(s.pos, name);
  return pushOperand(s, sign * value, end);
}

function operandNumber(
  s: ParserState,
  sign: number,
): Failure<TuffError> | Step {
  const end = readDigits(s.source, s.pos);
  if (end === s.pos) return expectedNumber(s.source, s.pos);
  return pushOperand(s, sign * parseInt(s.source.slice(s.pos, end), 10), end);
}

// Reads an operand: a sign, then a number, a variable, or an opening bracket.
function stepOperand(s: ParserState): Failure<TuffError> | Step {
  s.pos = skipSpaces(s.source, s.pos);
  if (
    s.atStatementStart &&
    s.depth === 0 &&
    s.afterLet &&
    s.pos === s.source.length
  ) {
    return Step.End;
  }
  let sign = 1;
  let c = s.source.charAt(s.pos);
  const signed = c === "+" || c === "-";
  if (signed) {
    if (c === "-") sign = -1;
    s.pos++;
    c = s.source.charAt(s.pos);
  }
  const bracket = toBracket(c);
  if (bracket !== null) return openBracket(s, bracket, sign);
  if (isLetter(c)) return operandName(s, sign, signed);
  return operandNumber(s, sign);
}

function pushOperator(s: ParserState, op: Operator): void {
  // Left-associative: apply pending operators that bind at least as tightly.
  for (
    let top = s.ops[s.ops.length - 1];
    top?.kind === EntryKind.Operator &&
    precedence(top.operator) >= precedence(op);
    top = s.ops[s.ops.length - 1]
  ) {
    applyTop(s.values, s.ops);
  }
  s.ops.push({ kind: EntryKind.Operator, operator: op });
  s.pos++;
  s.expectOperand = true;
  s.atStatementStart = false;
}

function endOfInput(s: ParserState): Failure<TuffError> | Step {
  const group = innermostGroup(s.ops);
  if (s.depth > 0 && group !== null) {
    return expectedClose(s.source, s.pos, group.bracket);
  }
  if (innermostNonOperator(s.ops)?.kind === EntryKind.Binding) {
    return expectedSemicolon(s.source, s.pos);
  }
  return Step.End;
}

function endStatement(s: ParserState): Failure<TuffError> | Step {
  const open = innermostNonOperator(s.ops);
  if (open?.kind === EntryKind.Binding) {
    closeBinding(s, open);
    s.pos++;
    s.expectOperand = true;
    s.atStatementStart = true;
    return Step.Continue;
  }
  if (open?.kind === EntryKind.Group) {
    return expectedClose(s.source, s.pos, open.bracket);
  }
  return unexpectedSemicolon(s.pos);
}

function closeBracket(s: ParserState, c: string): Failure<TuffError> | Step {
  if (innermostNonOperator(s.ops)?.kind === EntryKind.Binding) {
    return expectedSemicolon(s.source, s.pos);
  }
  const group = innermostGroup(s.ops);
  if (group === null) return expectedOperator(s.source, s.pos, true);
  if (c !== closerFor(group.bracket)) {
    return expectedMismatch(s.source, s.pos, group.bracket);
  }
  closeGroup(s.values, s.ops);
  if (group.bracket === Bracket.Brace) s.scopes.pop();
  s.depth--;
  s.pos++;
  s.atStatementStart = false;
  return Step.Continue;
}

// Reads an operator, a closing bracket, or the end of the input.
function stepOperator(s: ParserState): Failure<TuffError> | Step {
  s.pos = skipSpaces(s.source, s.pos);
  if (s.pos === s.source.length) return endOfInput(s);
  const c = s.source.charAt(s.pos);
  if (c === ";") return endStatement(s);
  if (s.depth > 0 && isCloser(c)) return closeBracket(s, c);
  const op = toOperator(c);
  if (op === null) return expectedOperator(s.source, s.pos, s.depth > 0);
  pushOperator(s, op);
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
  const s: ParserState = {
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
    const outcome = s.expectOperand ? stepOperand(s) : stepOperator(s);
    if (outcome === Step.End) break;
    if (outcome !== Step.Continue) return outcome;
  }
  reduceOperators(s.values, s.ops);
  return { ok: true, value: s.values.pop() ?? 0 };
}
