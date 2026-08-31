import type { AstNode } from "../ast.ts";
import type { EvalFailure } from "../errors.ts";
import type { Token } from "../lexer.ts";

export type Stmt =
  | {
      kind: "let";
      name: string;
      mutable: boolean;
      value: AstNode;
      position: number;
    }
  | { kind: "assign"; name: string; position: number; value: AstNode }
  | {
      kind: "derefAssign";
      operand: AstNode;
      value: AstNode;
      position: number;
    };

type StmtResult = { ok: true; value: Stmt } | { ok: false; error: EvalFailure };

type AstResult =
  | { ok: true; value: AstNode }
  | { ok: false; error: EvalFailure };

type ExprResult =
  | { ok: true; ast: AstNode }
  | { ok: false; error: EvalFailure };

// The subset of the Parser that statement parsing needs.
export interface StmtParser {
  next(): Token | undefined;
  advance(): Token | undefined;
  parseExpr(): ExprResult;
}

// letStmt := let (mut)? ident '=' expr ';'
export function parseLetStmt(p: StmtParser): StmtResult {
  const letTok = p.next()!;
  p.advance(); // consume let
  let mutable = false;
  const mutTok = p.next();
  if (mutTok !== undefined && mutTok.type === "mut") {
    mutable = true;
    p.advance();
  }
  const nameTok = p.next();
  if (nameTok === undefined || nameTok.type !== "ident") {
    return {
      ok: false,
      error: {
        kind: "syntax",
        message: "expected a variable name",
        position: nameTok?.position ?? 0,
      },
    };
  }
  p.advance();
  const value = parseEqExprSemi(p);
  if (!value.ok) {
    return value;
  }
  return {
    ok: true,
    value: {
      kind: "let",
      name: nameTok.value,
      mutable,
      value: value.value,
      position: letTok.position,
    },
  };
}

// assignStmt := ident '=' expr ';'
export function parseAssignStmt(
  p: StmtParser,
  nameTok: { type: "ident"; value: string; position: number },
): StmtResult {
  p.advance(); // consume ident
  const value = parseEqExprSemi(p);
  if (!value.ok) {
    return value;
  }
  return {
    ok: true,
    value: {
      kind: "assign",
      name: nameTok.value,
      position: nameTok.position,
      value: value.value,
    },
  };
}

// eqExprSemi := '=' expr ';'
export function parseEqExprSemi(p: StmtParser): AstResult {
  const eq = p.next();
  if (eq === undefined || eq.type !== "equals") {
    return {
      ok: false,
      error: {
        kind: "syntax",
        message: "expected =",
        position: eq?.position ?? 0,
      },
    };
  }
  p.advance();
  const valueRes = p.parseExpr();
  if (!valueRes.ok) {
    return valueRes;
  }
  const semi = p.next();
  if (semi === undefined || semi.type !== "semicolon") {
    return {
      ok: false,
      error: {
        kind: "syntax",
        message: "expected ;",
        position: semi?.position ?? 0,
      },
    };
  }
  p.advance();
  return { ok: true, value: valueRes.ast };
}

// derefAssignStmt := '*' unary '=' expr ';'
// Called after the operand has been parsed and '=' confirmed as next.
export function parseDerefAssignRest(
  p: StmtParser,
  operand: AstNode,
  position: number,
): StmtResult {
  p.advance(); // consume '='
  const valueRes = p.parseExpr();
  if (!valueRes.ok) {
    return valueRes;
  }
  const semi = p.next();
  if (semi === undefined || semi.type !== "semicolon") {
    return {
      ok: false,
      error: {
        kind: "syntax",
        message: "expected ;",
        position: semi?.position ?? 0,
      },
    };
  }
  p.advance();
  return {
    ok: true,
    value: {
      kind: "derefAssign",
      operand,
      value: valueRes.ast,
      position,
    },
  };
}
