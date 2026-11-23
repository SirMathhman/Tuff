export interface OkResult<T> {
  ok: true;
  value: T;
}

export interface TuffError {
  // What went wrong, in a few words.
  what: string;
  // Zero-based character offset in the source where the problem is.
  where: number;
  // The rule that was broken.
  why: string;
  // What the caller should change to make the source valid.
  fix: string;
}

export interface ErrResult {
  ok: false;
  error: TuffError;
}

export type Result<T> = OkResult<T> | ErrResult;

interface NumberToken {
  kind: "number";
  value: number;
  pos: number;
}

interface OperatorToken {
  kind: "operator";
  symbol: "+" | "-" | "*";
  pos: number;
}

type OpenSymbol = "(" | "{";
type CloseSymbol = ")" | "}";

interface OpenToken {
  kind: "open";
  symbol: OpenSymbol;
  pos: number;
}

interface CloseToken {
  kind: "close";
  symbol: CloseSymbol;
  pos: number;
}

interface NameToken {
  kind: "name";
  name: string;
  pos: number;
}

interface LetToken {
  kind: "let";
  pos: number;
}

interface MutToken {
  kind: "mut";
  pos: number;
}

interface AmpersandToken {
  kind: "ampersand";
  pos: number;
}

interface EqualsToken {
  kind: "equals";
  pos: number;
}

interface SemicolonToken {
  kind: "semicolon";
  pos: number;
}

interface BooleanToken {
  kind: "boolean";
  value: boolean;
  pos: number;
}

type Token =
  | NumberToken
  | OperatorToken
  | OpenToken
  | CloseToken
  | NameToken
  | LetToken
  | MutToken
  | AmpersandToken
  | EqualsToken
  | SemicolonToken
  | BooleanToken;

// A declared variable. `id` names its slot in the value table. `mutable` is
// true only for `let mut`.
interface Variable {
  id: number;
  mutable: boolean;
}

// A value that points at another variable's slot. `mutable` is true for `&mut`.
interface Reference {
  target: number;
  mutable: boolean;
}

// A plain value: a number or a boolean.
type Operand = number | boolean;

// What a variable slot holds: a number, a boolean, or a reference to another slot.
type Value = Operand | Reference;

// The state at one point of the source. `names` maps visible names to their
// variables, including those of enclosing blocks. `own` holds the names declared
// by the current block. `cells` is the value table, keyed by variable id. `nextId`
// is the id for the next declared variable.
interface Scope {
  names: ReadonlyMap<string, Variable>;
  own: ReadonlySet<string>;
  cells: ReadonlyMap<number, Value>;
  nextId: number;
}

interface Parsed {
  value: Operand;
  next: number;
  scope: Scope;
}

// The result of a let or assignment value: a number, or a reference.
interface Evaluated {
  value: Value;
  next: number;
  scope: Scope;
}

// A parser for one factor. The grammar functions receive it as a parameter
// instead of calling parseFactor directly, which breaks the recursion cycle.
type Parser = (
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
) => Result<Parsed>;

// The deepest allowed nesting of parentheses and braces. The parser recurses
// once per level, so this bound keeps it inside the call stack.
const MAX_NESTING = 1000;

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function err<T>(error: TuffError): Result<T> {
  return { ok: false, error };
}

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

function isLetter(char: string): boolean {
  return (
    (char >= "a" && char <= "z") || (char >= "A" && char <= "Z") || char === "_"
  );
}

function tokenize(source: string): Result<Token[]> {
  let tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source.charAt(index);
    if (isDigit(char)) {
      let end = index;
      while (end < source.length && isDigit(source.charAt(end))) {
        end++;
      }
      tokens = [
        ...tokens,
        {
          kind: "number",
          value: Number(source.slice(index, end)),
          pos: index,
        },
      ];
      index = end;
    } else if (isLetter(char)) {
      let end = index;
      while (end < source.length && isLetter(source.charAt(end))) {
        end++;
      }
      const word = source.slice(index, end);
      tokens = [...tokens, wordToken(word, index)];
      index = end;
    } else if (char === "+" || char === "-" || char === "*") {
      tokens = [...tokens, { kind: "operator", symbol: char, pos: index }];
      index++;
    } else if (char === "(" || char === "{") {
      tokens = [...tokens, { kind: "open", symbol: char, pos: index }];
      index++;
    } else if (char === ")" || char === "}") {
      tokens = [...tokens, { kind: "close", symbol: char, pos: index }];
      index++;
    } else if (char === "&") {
      tokens = [...tokens, { kind: "ampersand", pos: index }];
      index++;
    } else if (char === "=") {
      tokens = [...tokens, { kind: "equals", pos: index }];
      index++;
    } else if (char === ";") {
      tokens = [...tokens, { kind: "semicolon", pos: index }];
      index++;
    } else if (char.trim() === "") {
      index++;
    } else {
      return err({
        what: "Unexpected character",
        where: index,
        why: `"${char}" is not a digit, an operator (+, -, *), or whitespace`,
        fix: `Remove "${char}" or replace it with a number or operator`,
      });
    }
  }
  return ok(tokens);
}

// The token for a run of letters. `let` and `mut` are keywords, not names.
function wordToken(word: string, pos: number): Token {
  if (word === "let") {
    return { kind: "let", pos };
  }
  if (word === "mut") {
    return { kind: "mut", pos };
  }
  if (word === "true" || word === "false") {
    return { kind: "boolean", value: word === "true", pos };
  }
  return { kind: "name", name: word, pos };
}

// The source text a token stands for, for use in messages.
function tokenText(token: Token): string {
  if (token.kind === "number") {
    return String(token.value);
  }
  if (
    token.kind === "operator" ||
    token.kind === "open" ||
    token.kind === "close"
  ) {
    return token.symbol;
  }
  if (token.kind === "name") {
    return token.name;
  }
  if (token.kind === "let") {
    return "let";
  }
  if (token.kind === "mut") {
    return "mut";
  }
  if (token.kind === "ampersand") {
    return "&";
  }
  if (token.kind === "equals") {
    return "=";
  }
  if (token.kind === "boolean") {
    return token.value ? "true" : "false";
  }
  return ";";
}

function signAt(tokens: Token[], index: number): 1 | -1 | undefined {
  const token = tokens[index];
  if (token?.kind !== "operator") {
    return undefined;
  }
  if (token.symbol === "+") {
    return 1;
  }
  if (token.symbol === "-") {
    return -1;
  }
  return undefined;
}

// True when the token at `index` is the "*" operator.
function isStarAt(tokens: Token[], index: number): boolean {
  const token = tokens[index];
  return token?.kind === "operator" && token.symbol === "*";
}

// Reported when a number is required but the source ends. `end` is the source
// length.
function missingNumberAtEnd<T>(end: number): Result<T> {
  return err({
    what: "Missing number",
    where: end,
    why: "The expression ends where a number is required",
    fix: "Add a number after the last operator, or delete that operator",
  });
}

// Reported when a number is required but the token at that place is an
// operator, a parenthesis, or some other token.
function missingNumber<T>(token: Token): Result<T> {
  if (token.kind === "close") {
    const noun = groupNoun(token.symbol);
    return err({
      what: "Missing number",
      where: token.pos,
      why: `Found "${token.symbol}" where a number is required`,
      fix: `Put a number inside the ${noun}, or delete the ${noun}`,
    });
  }
  return err({
    what: "Missing number",
    where: token.pos,
    why: `Found "${tokenText(token)}" where a number is required`,
    fix: "Put a number before this operator, or remove the operator before it",
  });
}

// Plural name of the bracket pair that `symbol` belongs to, for messages.
function groupNoun(symbol: OpenSymbol | CloseSymbol): string {
  return symbol === "(" || symbol === ")" ? "parentheses" : "braces";
}

// Singular name of the bracket pair that `symbol` belongs to, for messages.
function groupName(symbol: OpenSymbol | CloseSymbol): string {
  return symbol === "(" || symbol === ")" ? "parenthesis" : "brace";
}

// The closing symbol that matches an opening symbol.
function closerFor(symbol: OpenSymbol): CloseSymbol {
  return symbol === "(" ? ")" : "}";
}

// The opening symbol that matches a closing symbol.
function openerFor(symbol: CloseSymbol): OpenSymbol {
  return symbol === ")" ? "(" : "{";
}

// Reported when a token follows a complete expression with nothing to join it.
// Two numbers next to each other get a missing operator. A ";" or "=" here is
// reported as its own mistake.
function missingOperator<T>(token: Token): Result<T> {
  if (token.kind === "semicolon") {
    return err({
      what: "Unexpected semicolon",
      where: token.pos,
      why: 'A ";" may only end a let statement',
      fix: 'Delete this ";", or put a let statement before it',
    });
  }
  if (token.kind === "equals") {
    return err({
      what: "Unexpected =",
      where: token.pos,
      why: '"=" may only follow a variable name in a let statement or an assignment',
      fix: 'Delete this "=", or write the assignment as name = value;',
    });
  }
  return err({
    what: "Missing operator",
    where: token.pos,
    why: "Two numbers appear next to each other with no operator between them",
    fix: "Insert +, -, or * between the numbers, or delete one of them",
  });
}

// Reported when `let` is not followed by a name because the source ends.
function letNameAtEnd<T>(end: number): Result<T> {
  return err({
    what: "Missing name",
    where: end,
    why: "let must be followed by a variable name",
    fix: "Add a name after let, such as let x = 1;",
  });
}

// Reported when `let` is followed by a token that is not a name.
function letNotName<T>(token: Token): Result<T> {
  return err({
    what: "Missing name",
    where: token.pos,
    why: `Found "${tokenText(token)}" where a variable name is required`,
    fix: 'Use a name made of letters and "_" after let, such as let x = 1;',
  });
}

// Reported when a statement does not end with ";". `subject` names the statement
// in the message. `where` is the offset of the token where the ";" was expected,
// or the source length.
function missingSemicolon<T>(where: number, subject: string): Result<T> {
  return err({
    what: "Missing ;",
    where,
    why: `${subject} must end with ";"`,
    fix: 'Add ";" after its value',
  });
}

// Reported when a name is used but no variable with that name is visible.
function undefinedVariable<T>(name: string, where: number): Result<T> {
  return err({
    what: "Undefined variable",
    where,
    why: `"${name}" has not been declared`,
    fix: `Declare it first with let ${name} = ...;, or fix the spelling`,
  });
}

// Reported when a variable that holds a reference is used where a number is
// required.
function referenceAsNumber<T>(name: string, where: number): Result<T> {
  return err({
    what: "Reference used as a number",
    where,
    why: `"${name}" holds a reference, not a number`,
    fix: `Write *${name} to use the value it points at`,
  });
}

// Reported when a boolean is used where arithmetic needs a number.
function booleanAsNumber<T>(where: number, text: string): Result<T> {
  return err({
    what: "Boolean used as a number",
    where,
    why: `"${text}" is a boolean, not a number`,
    fix: "Use a number instead of the boolean, or drop the operator",
  });
}

// A number from an operand, or an error if the operand is a boolean. `where` and
// `text` locate the operand in the message.
function numberFrom(
  value: Operand,
  where: number,
  text: string,
): Result<number> {
  if (typeof value === "boolean") {
    return booleanAsNumber(where, text);
  }
  return ok(value);
}

// The source text of the token at `index`, or "" past the end.
function textAt(tokens: Token[], index: number): string {
  const token = tokens[index];
  return token === undefined ? "" : tokenText(token);
}

// A program's final value as a number: true is 1 and false is 0.
function asNumber(value: Operand): number {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return value;
}

// A block's scope starts with every variable of the enclosing scope and no
// declarations of its own.
function childScope(outer: Scope): Scope {
  return {
    names: outer.names,
    own: new Set<string>(),
    cells: outer.cells,
    nextId: outer.nextId,
  };
}

function rootScope(): Scope {
  return {
    names: new Map<string, Variable>(),
    own: new Set<string>(),
    cells: new Map<number, Value>(),
    nextId: 0,
  };
}

// Returns the scope of the enclosing block after the block `inner` has closed.
// Assignments made inside the block are kept. The block's own variables go out
// of scope, but their slots stay in the table, so an outer reference to one of
// them would dangle. That is an error, reported at the closing brace `pos`.
function closeBlock(outer: Scope, inner: Scope, pos: number): Result<Scope> {
  const ownIds = new Set<number>(
    [...inner.own].flatMap((name) => {
      const variable = inner.names.get(name);
      return variable === undefined ? [] : [variable.id];
    }),
  );
  for (const [name, variable] of outer.names) {
    const cell = inner.cells.get(variable.id);
    if (
      cell !== undefined &&
      typeof cell === "object" &&
      ownIds.has(cell.target)
    ) {
      return err({
        what: "Reference escapes block",
        where: pos,
        why: `"${name}" would refer to a variable that ends with this block`,
        fix: "Point the outer variable at a variable that lives as long as it does",
      });
    }
  }
  return ok({
    names: outer.names,
    own: outer.own,
    cells: inner.cells,
    nextId: inner.nextId,
  });
}

// Returns a new scope with `name` declared in this block, holding `value`.
function declare(
  scope: Scope,
  name: string,
  mutable: boolean,
  value: Value,
): Scope {
  const id = scope.nextId;
  return {
    names: new Map<string, Variable>([
      ...scope.names,
      [name, { id, mutable }] as const,
    ]),
    own: new Set<string>([...scope.own, name]),
    cells: new Map<number, Value>([...scope.cells, [id, value] as const]),
    nextId: id + 1,
  };
}

// Returns a new scope where the slot `id` holds `value`.
function setCell(scope: Scope, id: number, value: Value): Scope {
  return {
    ...scope,
    cells: new Map<number, Value>([...scope.cells, [id, value] as const]),
  };
}

function parseNumber(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
): Result<Parsed> {
  const token = tokens[index];
  if (token === undefined) {
    return missingNumberAtEnd(end);
  }
  if (token.kind !== "number") {
    return missingNumber(token);
  }
  return ok({ value: token.value, next: index + 1, scope });
}

// A variable used as a number. Every declared variable has a slot, so the slot
// is always present.
function parseVariable(
  token: NameToken,
  index: number,
  scope: Scope,
): Result<Parsed> {
  const variable = scope.names.get(token.name);
  if (variable === undefined) {
    return undefinedVariable(token.name, token.pos);
  }
  const cell = scope.cells.get(variable.id);
  if (cell === undefined || typeof cell === "object") {
    return referenceAsNumber(token.name, token.pos);
  }
  return ok({ value: cell, next: index + 1, scope });
}

// "*name": the number the reference in `name` points at. `index` points at the
// "*"; `nameToken` is the token after it.
function parseDeref(
  nameToken: NameToken,
  index: number,
  scope: Scope,
): Result<Parsed> {
  const variable = scope.names.get(nameToken.name);
  if (variable === undefined) {
    return undefinedVariable(nameToken.name, nameToken.pos);
  }
  const cell = scope.cells.get(variable.id);
  if (cell === undefined || typeof cell !== "object") {
    return err({
      what: "Not a reference",
      where: nameToken.pos,
      why: `"${nameToken.name}" does not hold a reference`,
      fix: `Only a variable that holds &x or &mut x can be dereferenced`,
    });
  }
  const target = scope.cells.get(cell.target);
  if (target === undefined || typeof target === "object") {
    return err({
      what: "Reference used as a number",
      where: nameToken.pos,
      why: `"*${nameToken.name}" points at a reference, not a number`,
      fix: "Point the reference at a variable that holds a number",
    });
  }
  return ok({ value: target, next: index + 2, scope });
}

// A factor is a number, a variable, a dereference, or a grouped expression.
// Signs are not allowed directly before a factor; a sign inside a group belongs
// to that expression.
function parseFactor(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
): Result<Parsed> {
  const token = tokens[index];
  if (token?.kind === "open") {
    return parseGroup(tokens, index, scope, end, parseFactor);
  }
  if (token?.kind === "name") {
    return parseVariable(token, index, scope);
  }
  if (token?.kind === "boolean") {
    return ok({ value: token.value, next: index + 1, scope });
  }
  const nameToken = tokens[index + 1];
  if (isStarAt(tokens, index) && nameToken?.kind === "name") {
    return parseDeref(nameToken, index, scope);
  }
  return parseNumber(tokens, index, scope, end);
}

// Parses "(" expression ")" or "{" sequence "}". `index` points at the opener.
// A brace group is a block: its lets stay inside it, but its assignments to
// outer variables persist after it closes.
function parseGroup(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
  factor: Parser,
): Result<Parsed> {
  const open = tokens[index];
  const openSymbol = open?.kind === "open" ? open.symbol : "(";
  const inner =
    openSymbol === "{"
      ? parseSequence(tokens, index + 1, childScope(scope), end, factor)
      : parseExpression(tokens, index + 1, scope, end, factor);
  if (!inner.ok) {
    return inner;
  }
  const next = inner.value.next;
  const token = tokens[next];
  if (token === undefined) {
    const closer = closerFor(openSymbol);
    return err({
      what: `Unmatched ${groupName(openSymbol)}`,
      where: open?.pos ?? end,
      why: `The "${openSymbol}" at this position has no matching "${closer}"`,
      fix: `Add a "${closer}" after its expression, or delete this "${openSymbol}"`,
    });
  }
  if (token.kind !== "close") {
    return missingOperator(token);
  }
  if (token.symbol !== closerFor(openSymbol)) {
    return err({
      what: "Mismatched bracket",
      where: token.pos,
      why: `This "${token.symbol}" does not match the "${openSymbol}" at position ${open?.pos ?? end}`,
      fix: `Change this to "${closerFor(openSymbol)}", or change the "${openSymbol}" to "${openerFor(token.symbol)}"`,
    });
  }
  const closed =
    openSymbol === "{"
      ? closeBlock(scope, inner.value.scope, token.pos)
      : ok(inner.value.scope);
  if (!closed.ok) {
    return closed;
  }
  return ok({ value: inner.value.value, next: next + 1, scope: closed.value });
}

// Parses factors joined by "*", with an optional sign before the first. `sign` is
// 0 when there is no sign. A term that is one factor with no sign or "*" keeps
// its value, so a boolean passes through. Any arithmetic needs numbers.
function parseTerm(
  tokens: Token[],
  index: number,
  sign: 1 | -1 | 0,
  scope: Scope,
  end: number,
  factor: Parser,
): Result<Parsed> {
  const first = factor(tokens, index, scope, end);
  if (!first.ok) {
    return first;
  }
  const firstPos = tokens[index]?.pos ?? end;
  let value: Operand = first.value.value;
  let next = first.value.next;
  let current = first.value.scope;
  let token = tokens[next];
  let operated = sign !== 0;
  while (token?.kind === "operator" && token.symbol === "*") {
    const nextFactor = factor(tokens, next + 1, current, end);
    if (!nextFactor.ok) {
      return nextFactor;
    }
    const left = numberFrom(value, firstPos, textAt(tokens, index));
    if (!left.ok) {
      return left;
    }
    const right = numberFrom(
      nextFactor.value.value,
      tokens[next + 1]?.pos ?? end,
      textAt(tokens, next + 1),
    );
    if (!right.ok) {
      return right;
    }
    value = left.value * right.value;
    operated = true;
    next = nextFactor.value.next;
    current = nextFactor.value.scope;
    token = tokens[next];
  }
  if (!operated) {
    return ok({ value, next, scope: current });
  }
  const numeric = numberFrom(value, firstPos, textAt(tokens, index));
  if (!numeric.ok) {
    return numeric;
  }
  return ok({
    value: sign === 0 ? numeric.value : sign * numeric.value,
    next,
    scope: current,
  });
}

// Parses an optional leading sign, then terms joined by "+" or "-". Stops
// before the first token that is not "+" or "-"; the caller decides whether
// that token is valid there.
function parseExpression(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
  factor: Parser,
): Result<Parsed> {
  const leadingSign = signAt(tokens, index);
  const firstIndex = leadingSign === undefined ? index : index + 1;
  const first = parseTerm(
    tokens,
    firstIndex,
    leadingSign ?? 0,
    scope,
    end,
    factor,
  );
  if (!first.ok) {
    return first;
  }
  let next = first.value.next;
  let current = first.value.scope;

  let sign = signAt(tokens, next);
  if (sign === undefined) {
    return ok({ value: first.value.value, next, scope: current });
  }
  const firstValue = numberFrom(
    first.value.value,
    tokens[firstIndex]?.pos ?? end,
    textAt(tokens, firstIndex),
  );
  if (!firstValue.ok) {
    return firstValue;
  }
  let sum = firstValue.value;
  while (sign !== undefined) {
    const term = parseTerm(tokens, next + 1, sign, current, end, factor);
    if (!term.ok) {
      return term;
    }
    const termValue = numberFrom(
      term.value.value,
      tokens[next + 1]?.pos ?? end,
      textAt(tokens, next + 1),
    );
    if (!termValue.ok) {
      return termValue;
    }
    sum += termValue.value;
    next = term.value.next;
    current = term.value.scope;
    sign = signAt(tokens, next);
  }

  return ok({ value: sum, next, scope: current });
}

// The value of a let or assignment: "&name" or "&mut name" makes a reference;
// anything else is a number expression.
function parseValue(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
  factor: Parser,
): Result<Evaluated> {
  if (tokens[index]?.kind !== "ampersand") {
    const expression = parseExpression(tokens, index, scope, end, factor);
    if (!expression.ok) {
      return expression;
    }
    return ok({
      value: expression.value.value,
      next: expression.value.next,
      scope: expression.value.scope,
    });
  }
  const mutable = tokens[index + 1]?.kind === "mut";
  const nameIndex = mutable ? index + 2 : index + 1;
  const nameToken = tokens[nameIndex];
  if (nameToken === undefined) {
    return err({
      what: "Missing name",
      where: end,
      why: "& must be followed by a variable name",
      fix: "Add a variable name after &, such as &x",
    });
  }
  if (nameToken.kind !== "name") {
    return err({
      what: "Missing name",
      where: nameToken.pos,
      why: `Found "${tokenText(nameToken)}" where a variable name is required`,
      fix: "Put a variable name after & or &mut, such as &x",
    });
  }
  const variable = scope.names.get(nameToken.name);
  if (variable === undefined) {
    return undefinedVariable(nameToken.name, nameToken.pos);
  }
  if (mutable && !variable.mutable) {
    return err({
      what: "Cannot borrow mutably",
      where: nameToken.pos,
      why: `"${nameToken.name}" was declared with let, so it cannot be borrowed with &mut`,
      fix: `Declare it with let mut ${nameToken.name} = ...; to allow &mut`,
    });
  }
  return ok({
    value: { target: variable.id, mutable },
    next: nameIndex + 1,
    scope,
  });
}

// Parses zero or more statements, then one expression. A statement is
// "let [mut] name = value ;", "name = value ;", or "*name = expression ;".
// The value of the sequence is its final expression.
function parseSequence(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
  factor: Parser,
): Result<Parsed> {
  const token = tokens[index];
  if (token?.kind === "let") {
    return parseLet(tokens, index, scope, end, factor);
  }
  if (token?.kind === "name" && tokens[index + 1]?.kind === "equals") {
    return parseAssign(tokens, index, token, scope, end, factor);
  }
  const nameToken = tokens[index + 1];
  if (
    isStarAt(tokens, index) &&
    nameToken?.kind === "name" &&
    tokens[index + 2]?.kind === "equals"
  ) {
    return parseDerefAssign(tokens, index, nameToken, scope, end, factor);
  }
  return parseExpression(tokens, index, scope, end, factor);
}

// Parses "let [mut] name = value ;" and then the rest of the sequence. `index`
// points at "let".
function parseLet(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
  factor: Parser,
): Result<Parsed> {
  const mutable = tokens[index + 1]?.kind === "mut";
  const nameIndex = mutable ? index + 2 : index + 1;
  const nameToken = tokens[nameIndex];
  if (nameToken === undefined) {
    return letNameAtEnd(end);
  }
  if (nameToken.kind !== "name") {
    return letNotName(nameToken);
  }
  const name = nameToken.name;
  const equalsIndex = nameIndex + 1;
  const equals = tokens[equalsIndex];
  if (equals === undefined) {
    return err({
      what: "Missing =",
      where: end,
      why: `Expected "=" after "${name}"`,
      fix: `Add "=" and a value after "${name}"`,
    });
  }
  if (equals.kind !== "equals") {
    return err({
      what: "Missing =",
      where: equals.pos,
      why: `Found "${tokenText(equals)}" where "=" is required`,
      fix: `Put "=" after "${name}"`,
    });
  }
  const value = parseValue(tokens, equalsIndex + 1, scope, end, factor);
  if (!value.ok) {
    return value;
  }
  const semicolonIndex = value.value.next;
  const semicolon = tokens[semicolonIndex];
  if (semicolon?.kind !== "semicolon") {
    return missingSemicolon(
      semicolon?.pos ?? end,
      `The let statement for "${name}"`,
    );
  }
  const current = value.value.scope;
  if (current.own.has(name)) {
    return err({
      what: "Duplicate variable",
      where: nameToken.pos,
      why: `"${name}" is already declared in this block`,
      fix: "Rename this variable, or delete this declaration",
    });
  }
  return parseSequence(
    tokens,
    semicolonIndex + 1,
    declare(current, name, mutable, value.value.value),
    end,
    factor,
  );
}

// Parses "name = value ;" and then the rest of the sequence. Only a `let mut`
// variable may be assigned. `index` points at the name.
function parseAssign(
  tokens: Token[],
  index: number,
  nameToken: NameToken,
  scope: Scope,
  end: number,
  factor: Parser,
): Result<Parsed> {
  const name = nameToken.name;
  const variable = scope.names.get(name);
  if (variable === undefined) {
    return err({
      what: "Undefined variable",
      where: nameToken.pos,
      why: `"${name}" has not been declared`,
      fix: `Declare it first with let mut ${name} = ...;, or fix the spelling`,
    });
  }
  if (!variable.mutable) {
    return err({
      what: "Immutable variable",
      where: nameToken.pos,
      why: `"${name}" was declared with let, so it cannot be reassigned`,
      fix: `Declare it with let mut ${name} = ...; to allow reassignment`,
    });
  }
  const value = parseValue(tokens, index + 2, scope, end, factor);
  if (!value.ok) {
    return value;
  }
  const semicolonIndex = value.value.next;
  const semicolon = tokens[semicolonIndex];
  if (semicolon?.kind !== "semicolon") {
    return missingSemicolon(
      semicolon?.pos ?? end,
      `The assignment to "${name}"`,
    );
  }
  return parseSequence(
    tokens,
    semicolonIndex + 1,
    setCell(value.value.scope, variable.id, value.value.value),
    end,
    factor,
  );
}

// Parses "*name = expression ;" and then the rest of the sequence. The reference
// must be a `&mut`. `index` points at the "*"; `nameToken` is the name after it.
function parseDerefAssign(
  tokens: Token[],
  index: number,
  nameToken: NameToken,
  scope: Scope,
  end: number,
  factor: Parser,
): Result<Parsed> {
  const name = nameToken.name;
  const variable = scope.names.get(name);
  if (variable === undefined) {
    return undefinedVariable(name, nameToken.pos);
  }
  const cell = scope.cells.get(variable.id);
  if (cell === undefined || typeof cell !== "object") {
    return err({
      what: "Not a reference",
      where: nameToken.pos,
      why: `"${name}" does not hold a reference`,
      fix: "Only a variable that holds &mut x can be written through with *name = ...;",
    });
  }
  if (!cell.mutable) {
    return err({
      what: "Read-only reference",
      where: nameToken.pos,
      why: `"${name}" holds a read-only reference, so it cannot be written through`,
      fix: `Borrow the variable with &mut to allow writing through *${name}`,
    });
  }
  const value = parseExpression(tokens, index + 3, scope, end, factor);
  if (!value.ok) {
    return value;
  }
  const semicolonIndex = value.value.next;
  const semicolon = tokens[semicolonIndex];
  if (semicolon?.kind !== "semicolon") {
    return missingSemicolon(
      semicolon?.pos ?? end,
      `The assignment through "*${name}"`,
    );
  }
  return parseSequence(
    tokens,
    semicolonIndex + 1,
    setCell(value.value.scope, cell.target, value.value.value),
    end,
    factor,
  );
}

// Rejects source whose parentheses and braces nest deeper than MAX_NESTING.
function checkNesting(tokens: Token[]): Result<true> {
  let depth = 0;
  for (const token of tokens) {
    if (token.kind === "open") {
      depth++;
      if (depth > MAX_NESTING) {
        return err({
          what: "Nesting too deep",
          where: token.pos,
          why: `Groups nest more than ${MAX_NESTING} levels deep`,
          fix: "Reduce the nesting of parentheses and braces",
        });
      }
    } else if (token.kind === "close") {
      depth = Math.max(0, depth - 1);
    }
  }
  return ok(true);
}

export function interpretTuff(tuffSource: string): Result<number> {
  // Grammar:
  //   sequence   = { statement } expression
  //   statement  = "let" [ "mut" ] name "=" value ";"
  //              | name "=" value ";"
  //              | "*" name "=" expression ";"
  //   value      = expression | "&" name | "&" "mut" name
  //   expression = [sign] term { ("+" | "-") term }
  //   term       = factor { "*" factor }
  //   factor     = number | "true" | "false" | name | "*" name | "(" expression ")" | "{" sequence "}"
  // A boolean is a value on its own, but arithmetic needs numbers; a final boolean
  // is returned as 1 or 0. "*" binds tighter than "+" and "-". Parentheses group an expression. Braces
  // group a block, whose lets are visible only inside it. Only a `let mut`
  // variable may be assigned, and "&mut" needs one. A reference may not outlive
  // the block that declares its target. Parentheses and braces nest freely, but
  // each opener must close with its own kind.
  const tokenized = tokenize(tuffSource);
  if (!tokenized.ok) {
    return tokenized;
  }
  const tokens = tokenized.value;
  const end = tuffSource.length;
  if (tokens.length === 0) {
    return ok(0);
  }
  const nesting = checkNesting(tokens);
  if (!nesting.ok) {
    return nesting;
  }

  const sequence = parseSequence(tokens, 0, rootScope(), end, parseFactor);
  if (!sequence.ok) {
    return sequence;
  }
  const stop = tokens[sequence.value.next];
  if (stop === undefined) {
    return ok(asNumber(sequence.value.value));
  }
  if (stop.kind === "close") {
    const opener = openerFor(stop.symbol);
    return err({
      what: `Unmatched ${groupName(stop.symbol)}`,
      where: stop.pos,
      why: `This "${stop.symbol}" has no matching "${opener}"`,
      fix: `Add a "${opener}" before its expression, or delete this "${stop.symbol}"`,
    });
  }
  return missingOperator(stop);
}
