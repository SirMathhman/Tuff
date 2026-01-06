import {
  Result,
  InterpretError,
  Value,
  Token,
  ok,
  err,
  ReturnSignalValue,
} from "./types";

interface ParserLike {
  peek(): Token | undefined;
  peekNext(): Token | undefined;
  consume(): Token | undefined;
  parseExpr(): Result<Value, InterpretError>;
  parseStructDeclaration(): Result<Value, InterpretError>;
  parseLetDeclaration(): Result<Value, InterpretError>;
  parseFunctionDeclaration(): Result<Value, InterpretError>;
  assignVar(name: string, value: Value): Result<Value, InterpretError>;
  pushScope(): void;
  popScope(): void;
  createChildParser(tokens: Token[]): ParserLike;
  getTypeScopesPublic(): Map<string, string[]>[];
  getVarTypeScopesPublic(): Map<string, string | undefined>[];
  getScopes(): Map<string, Value>[];
  parse(): Result<Value, InterpretError>;
}

function isReturnSignalValue(value: Value): value is ReturnSignalValue {
  if (typeof value === "number") return false;
  if (value instanceof Map) return false;
  return value.type === "return";
}

function handleIdToken(
  parser: ParserLike,
  p: Token
): Result<Value, InterpretError> | undefined {
  if (p.type !== "id") return undefined;
  if (p.value === "struct") {
    const sR = parser.parseStructDeclaration();
    if (!sR.ok) return sR;
    return ok(sR.value);
  }
  if (p.value === "let") {
    const declR = parser.parseLetDeclaration();
    if (!declR.ok) return declR;
    return ok(declR.value);
  }
  if (p.value === "fn") {
    const fR = parser.parseFunctionDeclaration();
    if (!fR.ok) return fR;
    return ok(fR.value);
  }

  if (p.value === "yield") {
    // consume 'yield' and evaluate expression, then return a return-signal value
    parser.consume();
    const exprR = parser.parseExpr();
    if (!exprR.ok) return exprR;
    if (typeof exprR.value !== "number")
      return err({
        type: "InvalidInput",
        message: "Yield expression must be numeric",
      });
    const next = parser.peek();
    if (next && next.type === "op" && next.value === ";") parser.consume();
    return ok({ type: "return", value: exprR.value });
  }

  return undefined;
}

// Helper: collect tokens until top-level 'else' is encountered
function collectUntilElse(parser: ParserLike): Result<Token[], InterpretError> {
  const out: Token[] = [];
  let depth = 0;
  let tk = parser.peek();
  while (tk) {
    if (tk.type === "id" && tk.value === "else" && depth === 0) return ok(out);
    if (tk.type === "op" && tk.value === "(") {
      const c = parser.consume();
      if (!c)
        return err({ type: "InvalidInput", message: "Missing token in consequent" });
      depth++;
      out.push(c);
    } else if (tk.type === "op" && tk.value === ")") {
      const c = parser.consume();
      if (!c)
        return err({ type: "InvalidInput", message: "Missing token in consequent" });
      if (depth > 0) depth--;
      out.push(c);
    } else {
      const c = parser.consume();
      if (!c)
        return err({ type: "InvalidInput", message: "Missing token in consequent" });
      out.push(c);
    }
    tk = parser.peek();
  }
  return err({ type: "InvalidInput", message: "Missing else in conditional" });
}

type AltOpResult =
  | { type: "ok"; done: boolean; depth: number }
  | { type: "return"; value: Result<Token[], InterpretError> };

function handleAltOpToken(
  parser: ParserLike,
  tk: Token,
  depth: number,
  out: Token[]
): AltOpResult {
  if (tk.type !== "op") return { type: "ok", done: false, depth };

  if (tk.value === ";" && depth === 0) {
    const c = parser.consume();
    if (!c) return { type: "return", value: ok(out) };
    out.push(c);
    return { type: "return", value: ok(out) };
  }

  if (tk.value === "{") {
    const c = parser.consume();
    if (!c) return { type: "return", value: err({ type: "InvalidInput", message: "Missing token in alternative" }) };
    return { type: "ok", done: false, depth: depth + 1 };
  }

  if (tk.value === "}") {
    if (depth === 0) return { type: "ok", done: true, depth };
    const c = parser.consume();
    if (!c) return { type: "return", value: err({ type: "InvalidInput", message: "Missing token in alternative" }) };
    return { type: "ok", done: false, depth: depth - 1 };
  }

  if (tk.value === ")" && depth === 0) return { type: "ok", done: true, depth };

  return { type: "ok", done: false, depth };
}

function collectAltTokens(parser: ParserLike): Result<Token[], InterpretError> {
  const out: Token[] = [];
  let depth = 0;
  let tk = parser.peek();
  while (tk) {
    const res = handleAltOpToken(parser, tk, depth, out);
    if (res.type === "return") return res.value;
    // res.type === 'ok'
    if (res.done) return ok(out);
    const newDepth = res.depth;
    if (newDepth !== depth) {
      // either entered or exited a block; consume the token that changed depth
      const c = parser.consume();
      if (!c) return err({ type: "InvalidInput", message: "Missing token in alternative" });
      out.push(c);
      depth = newDepth;
      tk = parser.peek();
    } else {
      // default: consume one token
      const c = parser.consume();
      if (!c) return err({ type: "InvalidInput", message: "Missing token in alternative" });
      out.push(c);
      tk = parser.peek();
    }
  }
  return ok(out);
}

function evaluateTokensWithParentScopes(
  parser: ParserLike,
  tokens: Token[]
): Result<Value, InterpretError> {
  // create child parser via the factory method on parser
  const child = parser.createChildParser([
    { type: "op", value: "{" },
    ...tokens,
    { type: "op", value: "}" },
  ]);
  // copy parent scopes and type scopes
  const parentScopes = parser.getScopes();
  const parentTypeScopes = parser.getTypeScopesPublic();
  const parentVarTypeScopes = parser.getVarTypeScopesPublic();
  const childScopes = child.getScopes();
  for (let i = 0; i < parentScopes.length; i++) childScopes.push(parentScopes[i]);
  const childTypeScopes = child.getTypeScopesPublic();
  for (let i = 0; i < parentTypeScopes.length; i++)
    childTypeScopes.push(parentTypeScopes[i]);
  const childVarTypeScopes = child.getVarTypeScopesPublic();
  for (let i = 0; i < parentVarTypeScopes.length; i++)
    childVarTypeScopes.push(parentVarTypeScopes[i]);
  return child.parse();
}

function tryHandleAssignment(
  parser: ParserLike,
  p: Token
): Result<Value, InterpretError> | undefined {
  if (p.type !== "id") return undefined;
  const next = parser.peekNext();
  if (!next || next.type !== "op" || next.value !== "=") return undefined;

  const varName = p.value;
  parser.consume(); // consume identifier
  parser.consume(); // consume '='
  const rhs = parser.parseExpr();
  if (!rhs.ok) return rhs;
  const semi = parser.peek();
  if (semi && semi.type === "op" && semi.value === ";") parser.consume();
  const assignR = parser.assignVar(varName, rhs.value);
  if (!assignR.ok) return assignR;
  return ok(assignR.value);
}

export function parseStatement(
  parser: ParserLike,
  allowEof: boolean
): Result<Value, InterpretError> {
  const p = parser.peek();
  if (!p)
    return err({ type: "InvalidInput", message: "Unable to interpret input" });

  const idR = handleIdToken(parser, p);
  if (idR !== undefined) return idR;

  // assignment handling delegated to a helper to reduce complexity
  const assignR = tryHandleAssignment(parser, p);
  if (assignR !== undefined) return assignR;

  const exprR = parser.parseExpr();
  if (!exprR.ok) return exprR;
  const val = exprR.value;

  const next = parser.peek();
  if (next && next.type === "op") {
    if (next.value === ";") {
      parser.consume();
      return ok(val);
    }
    if (next.value === "}") return ok(val);
  }

  if (!next && allowEof) return ok(val);

  return err({
    type: "InvalidInput",
    message: "Unexpected token in statement",
  });
}

function skipToMatchingBrace(parser: ParserLike): Result<void, InterpretError> {
  // consumes tokens until the matching closing brace (handles nested braces)
  let depth = 0;
  for (;;) {
    const t = parser.peek();
    if (!t)
      return err({ type: "InvalidInput", message: "Missing closing brace" });
    if (t.type === "op" && t.value === "{") {
      depth++;
      parser.consume();
    } else if (t.type === "op" && t.value === "}") {
      if (depth === 0) {
        parser.consume();
        return ok(undefined);
      }
      depth--;
      parser.consume();
    } else {
      parser.consume();
    }
  }
}

export function parseBraced(parser: ParserLike): Result<Value, InterpretError> {
  // assume current token is '{'
  parser.consume();
  parser.pushScope();
  let lastVal: Value = 0;

  for (;;) {
    const p = parser.peek();
    if (!p) {
      parser.popScope();
      return err({ type: "InvalidInput", message: "Missing closing brace" });
    }

    if (p.type === "op" && p.value === "}") {
      parser.consume();
      parser.popScope();
      return ok(lastVal);
    }

    const stmtR = parseStatement(parser, false);
    if (!stmtR.ok) {
      parser.popScope();
      return stmtR;
    }
    // propagate return signals immediately: skip to matching closing brace then return
    if (isReturnSignalValue(stmtR.value)) {
      const skip = skipToMatchingBrace(parser);
      if (!skip.ok) return skip;
      parser.popScope();
      return ok(stmtR.value);
    }
    lastVal = stmtR.value;
  }
}

export function parseIfExpression(
  parser: ParserLike
): Result<Value, InterpretError> {
  // assume current token is 'if'
  parser.consume();
  const open = parser.consume();
  if (!open || open.type !== "op" || open.value !== "(")
    return err({ type: "InvalidInput", message: "Expected ( after if" });
  const cond = parser.parseExpr();
  if (!cond.ok) return cond;
  if (typeof cond.value !== "number")
    return err({ type: "InvalidInput", message: "Condition must be numeric" });
  const close = parser.consume();
  if (!close || close.type !== "op" || close.value !== ")")
    return err({ type: "InvalidInput", message: "Expected ) after condition" });

  const consTokensR = collectUntilElse(parser);
  if (!consTokensR.ok) return consTokensR;
  const consTokens2 = consTokensR.value;

  const elseTok = parser.consume();
  if (!elseTok || elseTok.type !== "id" || elseTok.value !== "else")
    return err({ type: "InvalidInput", message: "Expected else in conditional" });

  const altTokensR = collectAltTokens(parser);
  if (!altTokensR.ok) return altTokensR;
  const altTokens2 = altTokensR.value;

  if (cond.value !== 0) return evaluateTokensWithParentScopes(parser, consTokens2);
  return evaluateTokensWithParentScopes(parser, altTokens2);
}
