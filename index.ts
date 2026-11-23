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

interface EqualsToken {
  kind: "equals";
  pos: number;
}

interface SemicolonToken {
  kind: "semicolon";
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
  | EqualsToken
  | SemicolonToken;

// A variable's current value. `mutable` is true only for `let mut`.
interface Binding {
  value: number;
  mutable: boolean;
}

// The variables visible at one point of the source. `names` holds every
// visible variable, including those of enclosing blocks. `own` holds the names
// declared by this block itself.
interface Scope {
  names: ReadonlyMap<string, Binding>;
  own: ReadonlySet<string>;
}

interface Parsed {
  value: number;
  next: number;
  scope: Scope;
}

// A parser for one factor. The grammar functions receive it as a parameter
// instead of calling parseFactor directly, which breaks the recursion cycle.
type Parser = (tokens: Token[], index: number, scope: Scope, end: number) => Result<Parsed>;

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
  return (char >= "a" && char <= "z") || (char >= "A" && char <= "Z") || char === "_";
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
  return { kind: "name", name: word, pos };
}

// The source text a token stands for, for use in messages.
function tokenText(token: Token): string {
  if (token.kind === "number") {
    return String(token.value);
  }
  if (token.kind === "operator" || token.kind === "open" || token.kind === "close") {
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
  if (token.kind === "equals") {
    return "=";
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

// A block's scope starts with every variable of the enclosing scope and no
// declarations of its own.
function childScope(outer: Scope): Scope {
  return { names: outer.names, own: new Set<string>() };
}

function rootScope(): Scope {
  return { names: new Map<string, Binding>(), own: new Set<string>() };
}

// Returns the scope of the enclosing block after the block `inner` has closed.
// Assignments made inside the block to outer variables are kept. Variables the
// block declared itself shadow outer ones only inside the block, so the outer
// binding stays.
function closeBlock(outer: Scope, inner: Scope): Scope {
  const names = new Map<string, Binding>(
    [...outer.names].map(
      ([name, binding]) =>
        [name, inner.own.has(name) ? binding : (inner.names.get(name) ?? binding)] as const,
    ),
  );
  return { names, own: outer.own };
}

// Returns a new scope with `name` declared in this block.
function declare(scope: Scope, name: string, binding: Binding): Scope {
  return {
    names: new Map<string, Binding>([...scope.names, [name, binding] as const]),
    own: new Set<string>([...scope.own, name]),
  };
}

// Returns a new scope where `name` holds `value`, keeping its mutability.
function assign(scope: Scope, name: string, value: number): Scope {
  return {
    names: new Map<string, Binding>([...scope.names, [name, { value, mutable: true }] as const]),
    own: scope.own,
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

// A factor is a number, a variable, or a grouped expression. Signs are not
// allowed directly before a factor; a sign inside a group belongs to that
// expression.
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
    const binding = scope.names.get(token.name);
    if (binding === undefined) {
      return err({
        what: "Undefined variable",
        where: token.pos,
        why: `"${token.name}" has not been declared`,
        fix: `Declare it first with let ${token.name} = ...;, or fix the spelling`,
      });
    }
    return ok({ value: binding.value, next: index + 1, scope });
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
  const closedScope =
    openSymbol === "{" ? closeBlock(scope, inner.value.scope) : inner.value.scope;
  return ok({ value: inner.value.value, next: next + 1, scope: closedScope });
}

function parseTerm(
  tokens: Token[],
  index: number,
  sign: 1 | -1,
  scope: Scope,
  end: number,
  factor: Parser,
): Result<Parsed> {
  const first = factor(tokens, index, scope, end);
  if (!first.ok) {
    return first;
  }
  let value = sign * first.value.value;
  let next = first.value.next;
  let current = first.value.scope;
  let token = tokens[next];
  while (token?.kind === "operator" && token.symbol === "*") {
    const nextFactor = factor(tokens, next + 1, current, end);
    if (!nextFactor.ok) {
      return nextFactor;
    }
    value *= nextFactor.value.value;
    next = nextFactor.value.next;
    current = nextFactor.value.scope;
    token = tokens[next];
  }
  return ok({ value, next, scope: current });
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
  const first = parseTerm(
    tokens,
    leadingSign === undefined ? index : index + 1,
    leadingSign ?? 1,
    scope,
    end,
    factor,
  );
  if (!first.ok) {
    return first;
  }
  let sum = first.value.value;
  let next = first.value.next;
  let current = first.value.scope;

  let sign = signAt(tokens, next);
  while (sign !== undefined) {
    const term = parseTerm(tokens, next + 1, sign, current, end, factor);
    if (!term.ok) {
      return term;
    }
    sum += term.value.value;
    next = term.value.next;
    current = term.value.scope;
    sign = signAt(tokens, next);
  }

  return ok({ value: sum, next, scope: current });
}

// Parses zero or more statements, then one expression. A statement is either
// "let [mut] name = expression ;" or "name = expression ;". Each let adds its
// name to the current block. The value of the sequence is its final expression.
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
  return parseExpression(tokens, index, scope, end, factor);
}

// Parses "let [mut] name = expression ;" and then the rest of the sequence.
// `index` points at "let".
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
  const value = parseExpression(tokens, equalsIndex + 1, scope, end, factor);
  if (!value.ok) {
    return value;
  }
  const semicolonIndex = value.value.next;
  const semicolon = tokens[semicolonIndex];
  if (semicolon?.kind !== "semicolon") {
    return missingSemicolon(semicolon?.pos ?? end, `The let statement for "${name}"`);
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
    declare(current, name, { value: value.value.value, mutable }),
    end,
    factor,
  );
}

// Parses "name = expression ;" and then the rest of the sequence. Only a
// `let mut` variable may be assigned. `index` points at the name.
function parseAssign(
  tokens: Token[],
  index: number,
  nameToken: NameToken,
  scope: Scope,
  end: number,
  factor: Parser,
): Result<Parsed> {
  const name = nameToken.name;
  const binding = scope.names.get(name);
  if (binding === undefined) {
    return err({
      what: "Undefined variable",
      where: nameToken.pos,
      why: `"${name}" has not been declared`,
      fix: `Declare it first with let mut ${name} = ...;, or fix the spelling`,
    });
  }
  if (!binding.mutable) {
    return err({
      what: "Immutable variable",
      where: nameToken.pos,
      why: `"${name}" was declared with let, so it cannot be reassigned`,
      fix: `Declare it with let mut ${name} = ...; to allow reassignment`,
    });
  }
  const value = parseExpression(tokens, index + 2, scope, end, factor);
  if (!value.ok) {
    return value;
  }
  const semicolonIndex = value.value.next;
  const semicolon = tokens[semicolonIndex];
  if (semicolon?.kind !== "semicolon") {
    return missingSemicolon(semicolon?.pos ?? end, `The assignment to "${name}"`);
  }
  return parseSequence(
    tokens,
    semicolonIndex + 1,
    assign(value.value.scope, name, value.value.value),
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
  //   statement  = "let" [ "mut" ] name "=" expression ";"
  //              | name "=" expression ";"
  //   expression = [sign] term { ("+" | "-") term }
  //   term       = factor { "*" factor }
  //   factor     = number | name | "(" expression ")" | "{" sequence "}"
  // "*" binds tighter than "+" and "-". Parentheses group an expression. Braces
  // group a block, whose lets are visible only inside it. Only a `let mut`
  // variable may be assigned. Parentheses and braces nest freely, but each opener
  // must close with its own kind.
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
    return ok(sequence.value.value);
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
