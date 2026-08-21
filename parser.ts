import type { AstNode, EvalError, Result, Token } from "./types.ts";

const NUMBER_RE = /^\d+(\.\d+)?$/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type ParserState = {
  tokens: Token[];
  pos: number;
  inputLength: number;
};

type LetDecl = { name: string; mut: boolean; value: AstNode; index: number };

function wrapDecls(decls: LetDecl[], body: AstNode): AstNode {
  let node: AstNode = body;
  for (let i = decls.length - 1; i >= 0; i--) {
    const d = decls[i];
    if (d === undefined) continue;
    node = {
      kind: "let",
      name: d.name,
      mut: d.mut,
      value: d.value,
      body: node,
      index: d.index,
    };
  }
  return node;
}

// letDecl := "let" "mut"? ident "=" expr ";"
function parseLetDecl(state: ParserState): Result<LetDecl, EvalError> {
  const letTok = state.tokens[state.pos];
  state.pos++; // consume "let" (checked by caller)
  let mut = false;
  const mutTok = state.tokens[state.pos];
  if (mutTok !== undefined && mutTok.value === "mut") {
    mut = true;
    state.pos++;
  }
  const name = state.tokens[state.pos];
  if (
    name === undefined ||
    !IDENT_RE.test(name.value) ||
    name.value === "let" ||
    name.value === "mut"
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
      mut,
      value: v.value,
      index: letTok?.index ?? name.index,
    },
  };
}

// assignStmt := ident "=" expr ";"
function parseAssignStmt(state: ParserState): Result<AstNode, EvalError> {
  const nameTok = state.tokens[state.pos];
  state.pos++; // consume ident (checked by caller)
  const eq = state.tokens[state.pos];
  if (eq === undefined || eq.value !== "=") {
    return {
      ok: false,
      error: {
        kind: "invalid-token",
        index: eq?.index ?? nameTok?.index ?? state.inputLength,
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
      kind: "assign",
      name: nameTok?.value ?? "",
      value: v.value,
      index: nameTok?.index ?? state.inputLength,
    },
  };
}

// blockContents := (letDecl | assignStmt)*
function parseBlockContents(
  state: ParserState,
): Result<{ decls: LetDecl[]; assigns: AstNode[] }, EvalError> {
  const decls: LetDecl[] = [];
  const assigns: AstNode[] = [];
  for (;;) {
    const t = state.tokens[state.pos];
    if (t === undefined || t.value === "}") break;
    if (t.value === "let") {
      const d = parseLetDecl(state);
      if (!d.ok) return d;
      decls.push(d.value);
    } else if (IDENT_RE.test(t.value) && t.value !== "mut") {
      const next = state.tokens[state.pos + 1];
      if (next === undefined || next.value !== "=") break;
      const a = parseAssignStmt(state);
      if (!a.ok) return a;
      assigns.push(a.value);
    } else {
      break;
    }
  }
  return { ok: true, value: { decls, assigns } };
}

function chainStmts(stmts: AstNode[], body: AstNode): AstNode {
  let node: AstNode = body;
  for (let i = stmts.length - 1; i >= 0; i--) {
    const s = stmts[i];
    if (s === undefined) continue;
    node = { kind: "seq", first: s, rest: node, index: s.index };
  }
  return node;
}

// blockExpr := "{" (letDecl | assignStmt)* expr "}"
function parseBlock(state: ParserState): Result<AstNode, EvalError> {
  const open = state.tokens[state.pos];
  state.pos++; // consume "{" (checked by caller)
  const contents = parseBlockContents(state);
  if (!contents.ok) return contents;
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
      body: wrapDecls(
        contents.value.decls,
        chainStmts(contents.value.assigns, body.value),
      ),
      index: open?.index ?? state.inputLength,
    },
  };
}

// blockStmt := "{" (letDecl | assignStmt)* "}"  (no body expr; evaluates to 0)
function parseBlockStmt(state: ParserState): Result<AstNode, EvalError> {
  const open = state.tokens[state.pos];
  state.pos++; // consume "{" (checked by caller)
  const contents = parseBlockContents(state);
  if (!contents.ok) return contents;
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
  const body: AstNode = { kind: "num", value: 0, index: state.inputLength };
  return {
    ok: true,
    value: {
      kind: "block",
      body: wrapDecls(
        contents.value.decls,
        chainStmts(contents.value.assigns, body),
      ),
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
    if (token.value === "let" || token.value === "mut") {
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

// program := (letDecl | assignStmt)* expr
export function parse(state: ParserState): Result<AstNode, EvalError> {
  const decls: LetDecl[] = [];
  const assigns: AstNode[] = [];
  for (;;) {
    const t = state.tokens[state.pos];
    if (t === undefined) break;
    if (t.value === "let") {
      const d = parseLetDecl(state);
      if (!d.ok) return d;
      decls.push(d.value);
    } else if (IDENT_RE.test(t.value) && t.value !== "mut") {
      const next = state.tokens[state.pos + 1];
      if (next === undefined || next.value !== "=") break;
      const a = parseAssignStmt(state);
      if (!a.ok) return a;
      assigns.push(a.value);
    } else if (t.value === "{") {
      const saved = state.pos;
      const b = parseBlockStmt(state);
      if (!b.ok) {
        // Not a statements-only block; it's a block expression. Backtrack and
        // let the trailing expression parse handle it.
        state.pos = saved;
        break;
      }
      assigns.push(b.value);
    } else {
      break;
    }
  }
  const body: Result<AstNode, EvalError> =
    state.tokens[state.pos] === undefined
      ? { ok: true, value: { kind: "num", value: 0, index: state.inputLength } }
      : parseExpr(state);
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
  return { ok: true, value: wrapDecls(decls, chainStmts(assigns, body.value)) };
}
