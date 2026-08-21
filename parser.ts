import type { AstNode, EvalError, Result, Token } from "./types.ts";

const NUMBER_RE = /^\d+(\.\d+)?$/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type ParserState = {
  tokens: Token[];
  pos: number;
  inputLength: number;
};

type LetDecl = { name: string; value: AstNode; index: number };

function wrapDecls(decls: LetDecl[], body: AstNode): AstNode {
  let node: AstNode = body;
  for (let i = decls.length - 1; i >= 0; i--) {
    const d = decls[i];
    if (d === undefined) continue;
    node = {
      kind: "let",
      name: d.name,
      value: d.value,
      body: node,
      index: d.index,
    };
  }
  return node;
}

// letDecl := "let" ident "=" expr ";"
function parseLetDecl(state: ParserState): Result<LetDecl, EvalError> {
  const letTok = state.tokens[state.pos];
  state.pos++; // consume "let" (checked by caller)
  const name = state.tokens[state.pos];
  if (
    name === undefined ||
    !IDENT_RE.test(name.value) ||
    name.value === "let"
  ) {
    return {
      ok: false,
      error: {
        kind: "invalid-token",
        index: name?.index ?? letTok?.index ?? state.inputLength,
        token: name?.value ?? "",
      },
    };
  }
  state.pos++;
  const eq = state.tokens[state.pos];
  if (eq === undefined || eq.value !== "=") {
    return {
      ok: false,
      error: {
        kind: "invalid-token",
        index: eq?.index ?? name.index,
        token: eq?.value ?? "",
      },
    };
  }
  state.pos++;
  const v = parseExpr(state);
  if (!v.ok) return v;
  const semi = state.tokens[state.pos];
  if (semi === undefined || semi.value !== ";") {
    return {
      ok: false,
      error: {
        kind: "invalid-token",
        index: semi?.index ?? eq.index,
        token: semi?.value ?? "",
      },
    };
  }
  state.pos++;
  return {
    ok: true,
    value: {
      name: name.value,
      value: v.value,
      index: letTok?.index ?? name.index,
    },
  };
}

// block := "{" (letDecl)* expr "}"
function parseBlock(state: ParserState): Result<AstNode, EvalError> {
  const open = state.tokens[state.pos];
  state.pos++; // consume "{" (checked by caller)
  const decls: LetDecl[] = [];
  for (;;) {
    const t = state.tokens[state.pos];
    if (t === undefined || t.value === "}" || t.value !== "let") break;
    const d = parseLetDecl(state);
    if (!d.ok) return d;
    decls.push(d.value);
  }
  const body = parseExpr(state);
  if (!body.ok) return body;
  const close = state.tokens[state.pos];
  if (close === undefined || close.value !== "}") {
    return {
      ok: false,
      error: {
        kind: "unbalanced-paren",
        index: open?.index ?? state.inputLength,
      },
    };
  }
  state.pos++;
  return {
    ok: true,
    value: {
      kind: "block",
      body: wrapDecls(decls, body.value),
      index: open?.index ?? state.inputLength,
    },
  };
}

// factor := ("-" | "+")? (number | ident | "(" expr ")" | "{" block "}")
function parseFactor(state: ParserState): Result<AstNode, EvalError> {
  let neg = false;
  let negIndex = 0;
  const signToken = state.tokens[state.pos];
  if (
    signToken !== undefined &&
    (signToken.value === "-" || signToken.value === "+")
  ) {
    neg = signToken.value === "-";
    negIndex = signToken.index;
    state.pos++;
  }
  const token = state.tokens[state.pos];
  if (token === undefined) {
    return {
      ok: false,
      error: { kind: "unexpected-end", index: state.inputLength },
    };
  }
  let node: AstNode;
  if (token.value === "(") {
    state.pos++;
    const inner = parseExpr(state);
    if (!inner.ok) return inner;
    const close = state.tokens[state.pos];
    if (close === undefined || close.value !== ")") {
      return {
        ok: false,
        error: { kind: "unbalanced-paren", index: token.index },
      };
    }
    state.pos++;
    node = inner.value;
  } else if (token.value === "{") {
    const block = parseBlock(state);
    if (!block.ok) return block;
    node = block.value;
  } else if (IDENT_RE.test(token.value)) {
    if (token.value === "let") {
      return {
        ok: false,
        error: {
          kind: "invalid-token",
          index: token.index,
          token: token.value,
        },
      };
    }
    state.pos++;
    node = { kind: "var", name: token.value, index: token.index };
  } else if (NUMBER_RE.test(token.value)) {
    state.pos++;
    node = { kind: "num", value: Number(token.value), index: token.index };
  } else {
    return {
      ok: false,
      error: { kind: "invalid-token", index: token.index, token: token.value },
    };
  }
  if (neg) {
    node = { kind: "neg", operand: node, index: negIndex };
  }
  return { ok: true, value: node };
}

// term := factor ("*" factor)*
function parseTerm(state: ParserState): Result<AstNode, EvalError> {
  let left = parseFactor(state);
  if (!left.ok) return left;
  while (state.tokens[state.pos]?.value === "*") {
    const opTok = state.tokens[state.pos];
    state.pos++;
    const right = parseFactor(state);
    if (!right.ok) return right;
    left = {
      ok: true,
      value: {
        kind: "binary",
        op: "*",
        left: left.value,
        right: right.value,
        index: opTok?.index ?? state.inputLength,
      },
    };
  }
  return left;
}

// expr := term (("+" | "-") term)*
function parseExpr(state: ParserState): Result<AstNode, EvalError> {
  let result = parseTerm(state);
  if (!result.ok) return result;
  while (
    state.tokens[state.pos]?.value === "+" ||
    state.tokens[state.pos]?.value === "-"
  ) {
    const opTok = state.tokens[state.pos];
    const op = opTok?.value;
    state.pos++;
    const right = parseTerm(state);
    if (!right.ok) return right;
    result = {
      ok: true,
      value: {
        kind: "binary",
        op: op === "-" ? "-" : "+",
        left: result.value,
        right: right.value,
        index: opTok?.index ?? state.inputLength,
      },
    };
  }
  return result;
}

// program := (letDecl)* expr
export function parse(state: ParserState): Result<AstNode, EvalError> {
  const decls: LetDecl[] = [];
  while (state.tokens[state.pos]?.value === "let") {
    const d = parseLetDecl(state);
    if (!d.ok) return d;
    decls.push(d.value);
  }
  const body = parseExpr(state);
  if (!body.ok) return body;
  const leftover = state.tokens[state.pos];
  if (leftover !== undefined) {
    return {
      ok: false,
      error: {
        kind: "invalid-token",
        index: leftover.index,
        token: leftover.value,
      },
    };
  }
  return { ok: true, value: wrapDecls(decls, body.value) };
}
