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
  | EqualsToken
  | SemicolonToken;

interface Parsed {
  value: number;
  next: number;
}

// The names visible at one point of the source. `names` holds the names
// declared in this block; `outer` is the block that encloses it.
interface Scope {
  names: ReadonlyMap<string, number>;
  outer: Scope | undefined;
}

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
      tokens = [
        ...tokens,
        word === "let"
          ? { kind: "let", pos: index }
          : { kind: "name", name: word, pos: index },
      ];
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

// Reported when two numbers (or a number and a group) appear with no operator
// between them. A ";" here is a statement end with no let to close.
function missingOperator<T>(token: Token): Result<T> {
  if (token.kind === "semicolon") {
    return err({
      what: "Unexpected semicolon",
      where: token.pos,
      why: 'A ";" may only end a let statement',
      fix: 'Delete this ";", or put a let statement before it',
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

// Reported when a let statement does not end with ";". `where` is the offset of
// the token where the ";" was expected, or the source length.
function missingSemicolon<T>(where: number, name: string): Result<T> {
  return err({
    what: "Missing ;",
    where,
    why: `The let statement for "${name}" must end with ";"`,
    fix: 'Add ";" after its value',
  });
}

function emptyScopeIn(outer: Scope): Scope {
  return { names: new Map<string, number>(), outer };
}

function rootScope(): Scope {
  return { names: new Map<string, number>(), outer: undefined };
}

// Returns the value of `name` in the nearest block that declares it.
function lookup(scope: Scope, name: string): number | undefined {
  const own = scope.names.get(name);
  if (own !== undefined) {
    return own;
  }
  return scope.outer === undefined ? undefined : lookup(scope.outer, name);
}

// Returns a new scope with `name` added to the block's own names.
function declare(scope: Scope, name: string, value: number): Scope {
  return {
    names: new Map<string, number>([...scope.names, [name, value] as const]),
    outer: scope.outer,
  };
}

function parseNumber(
  tokens: Token[],
  index: number,
  end: number,
): Result<Parsed> {
  const token = tokens[index];
  if (token === undefined) {
    return missingNumberAtEnd(end);
  }
  if (token.kind !== "number") {
    return missingNumber(token);
  }
  return ok({ value: token.value, next: index + 1 });
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
    return parseGroup(tokens, index, scope, end);
  }
  if (token?.kind === "name") {
    const value = lookup(scope, token.name);
    if (value === undefined) {
      return err({
        what: "Undefined variable",
        where: token.pos,
        why: `"${token.name}" has not been declared`,
        fix: `Declare it first with let ${token.name} = ...;, or fix the spelling`,
      });
    }
    return ok({ value, next: index + 1 });
  }
  return parseNumber(tokens, index, end);
}

// Parses "(" expression ")" or "{" sequence "}". `index` points at the opener.
// A brace group is a block: its lets are visible only inside it.
function parseGroup(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
): Result<Parsed> {
  const open = tokens[index];
  const openSymbol = open?.kind === "open" ? open.symbol : "(";
  const inner =
    openSymbol === "{"
      ? parseSequence(tokens, index + 1, emptyScopeIn(scope), end)
      : parseExpression(tokens, index + 1, scope, end);
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
  return ok({ value: inner.value.value, next: next + 1 });
}

function parseTerm(
  tokens: Token[],
  index: number,
  sign: 1 | -1,
  scope: Scope,
  end: number,
): Result<Parsed> {
  const first = parseFactor(tokens, index, scope, end);
  if (!first.ok) {
    return first;
  }
  let value = sign * first.value.value;
  let next = first.value.next;
  let token = tokens[next];
  while (token?.kind === "operator" && token.symbol === "*") {
    const factor = parseFactor(tokens, next + 1, scope, end);
    if (!factor.ok) {
      return factor;
    }
    value *= factor.value.value;
    next = factor.value.next;
    token = tokens[next];
  }
  return ok({ value, next });
}

// Parses an optional leading sign, then terms joined by "+" or "-". Stops
// before the first token that is not "+" or "-"; the caller decides whether
// that token is valid there.
function parseExpression(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
): Result<Parsed> {
  const leadingSign = signAt(tokens, index);
  const first = parseTerm(
    tokens,
    leadingSign === undefined ? index : index + 1,
    leadingSign ?? 1,
    scope,
    end,
  );
  if (!first.ok) {
    return first;
  }
  let sum = first.value.value;
  let next = first.value.next;

  let sign = signAt(tokens, next);
  while (sign !== undefined) {
    const term = parseTerm(tokens, next + 1, sign, scope, end);
    if (!term.ok) {
      return term;
    }
    sum += term.value.value;
    next = term.value.next;
    sign = signAt(tokens, next);
  }

  return ok({ value: sum, next });
}

// Parses zero or more "let name = expression ;" statements, then one
// expression. Each let adds its name to the current block for the rest of the
// sequence. The value of the sequence is its final expression.
function parseSequence(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
): Result<Parsed> {
  if (tokens[index]?.kind !== "let") {
    return parseExpression(tokens, index, scope, end);
  }
  const nameToken = tokens[index + 1];
  if (nameToken === undefined) {
    return letNameAtEnd(end);
  }
  if (nameToken.kind !== "name") {
    return letNotName(nameToken);
  }
  const name = nameToken.name;
  const equals = tokens[index + 2];
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
  const value = parseExpression(tokens, index + 3, scope, end);
  if (!value.ok) {
    return value;
  }
  const semicolonIndex = value.value.next;
  const semicolon = tokens[semicolonIndex];
  if (semicolon?.kind !== "semicolon") {
    return missingSemicolon(semicolon?.pos ?? end, name);
  }
  if (scope.names.has(name)) {
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
    declare(scope, name, value.value.value),
    end,
  );
}

export function interpretTuff(tuffSource: string): Result<number> {
  // Grammar:
  //   sequence   = { "let" name "=" expression ";" } expression
  //   expression = [sign] term { ("+" | "-") term }
  //   term       = factor { "*" factor }
  //   factor     = number | name | "(" expression ")" | "{" sequence "}"
  // "*" binds tighter than "+" and "-". Parentheses group an expression. Braces
  // group a block, whose lets are visible only inside it. Parentheses and braces
  // nest freely, but each opener must close with its own kind.
  const tokenized = tokenize(tuffSource);
  if (!tokenized.ok) {
    return tokenized;
  }
  const tokens = tokenized.value;
  const end = tuffSource.length;
  if (tokens.length === 0) {
    return ok(0);
  }

  const sequence = parseSequence(tokens, 0, rootScope(), end);
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
