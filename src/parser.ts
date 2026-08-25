import type { Result } from "./errors.ts";
import { fail } from "./errors.ts";
import type { Token } from "./lexer.ts";

export type Expr =
  | { literal: number | boolean; position: number }
  | { identifier: string; position: number }
  | {
      binary: { op: "||" | "&&" | "<" | "=="; left: Expr; right: Expr };
      position: number;
    };

export type IfStatement = {
  condition: Expr;
  thenBlock: Statement[];
  elseBlock?: Statement[];
};

export type WhileStatement = { condition: Expr; body: Statement[] };

export type Declaration = {
  name: string;
  mutable: boolean;
  expr: Expr;
  position: number;
};

export type Assignment = {
  name: string;
  op: "=" | "+=";
  expr: Expr;
  position: number;
};

export type Return = { expr: Expr; position: number };

export type Statement =
  | { block: Statement[]; position: number }
  | { declaration: Declaration; position: number }
  | { assignment: Assignment; position: number }
  | { return: Return; position: number }
  | { if: IfStatement; position: number }
  | { while: WhileStatement; position: number };

const NAME_KEYWORDS = [
  "let",
  "mut",
  "return",
  "true",
  "false",
  "if",
  "else",
  "while",
];

type ParsedStatements = { statements: Statement[]; next: number };

function parseStatements(
  tokens: Token[],
  start: number,
): Result<ParsedStatements> {
  const statements: Statement[] = [];
  let i = start;
  while (i < tokens.length) {
    const token = tokens[i]!;
    if (token.value === "}") {
      return { ok: true, value: { statements, next: i + 1 } };
    }
    if (token.value === "{") {
      const inner = parseStatements(tokens, i + 1);
      if (!inner.ok) return inner;
      const { statements: innerStatements, next } = inner.value;
      if (tokens[next - 1]?.value !== "}")
        return fail({
          kind: "UnbalancedBrace",
          position: tokens[next - 1]?.position ?? token.position,
        });
      statements.push({ block: innerStatements, position: token.position });
      i = next;
      continue;
    }
    if (token.value === "if") {
      const parsed = parseIf(tokens, i);
      if (!parsed.ok) return parsed;
      const { ifStatement, next } = parsed.value;
      statements.push({ if: ifStatement, position: token.position });
      i = next;
      continue;
    }
    if (token.value === "while") {
      const parsed = parseWhile(tokens, i);
      if (!parsed.ok) return parsed;
      const { whileStatement, next } = parsed.value;
      statements.push({ while: whileStatement, position: token.position });
      i = next;
      continue;
    }
    let j = i;
    while (j < tokens.length && tokens[j]!.value !== ";") j++;
    if (j >= tokens.length)
      return fail({ kind: "MissingTerminator", position: token.position });
    const stmtTokens = tokens.slice(i, j);
    const parsed = parsePlainStatement(stmtTokens);
    if (!parsed.ok) return parsed;
    statements.push(parsed.value);
    i = j + 1;
  }
  return { ok: true, value: { statements, next: i } };
}

function parsePlainStatement(stmtTokens: Token[]): Result<Statement> {
  if (stmtTokens.length === 0)
    return fail({ kind: "EmptyStatement", position: 0 });
  const first = stmtTokens[0]!;
  if (first.value === "let") {
    let idx = 1;
    let mutable = false;
    if (stmtTokens[idx]?.value === "mut") {
      mutable = true;
      idx++;
    }
    const nameToken = stmtTokens[idx];
    if (!nameToken || NAME_KEYWORDS.includes(nameToken.value))
      return fail({
        kind: "ExpectedToken",
        expected: "variable name",
        found: nameToken?.value,
        position: nameToken?.position ?? first.position,
      });
    if (stmtTokens[idx + 1]?.value !== "=")
      return fail({
        kind: "ExpectedToken",
        expected: "'='",
        found: stmtTokens[idx + 1]?.value,
        position: stmtTokens[idx + 1]?.position ?? first.position,
      });
    const expr = parseExpr(stmtTokens.slice(idx + 2));
    if (!expr.ok) return expr;
    return {
      ok: true,
      value: {
        declaration: {
          name: nameToken.value,
          mutable,
          expr: expr.value,
          position: first.position,
        },
        position: first.position,
      },
    };
  }
  if (first.value === "return") {
    const expr = parseExpr(stmtTokens.slice(1));
    if (!expr.ok) return expr;
    return {
      ok: true,
      value: {
        return: { expr: expr.value, position: first.position },
        position: first.position,
      },
    };
  }
  if (first.kind === "keyword")
    return fail({
      kind: "ExpectedToken",
      expected: "statement",
      found: first.value,
      position: first.position,
    });
  const op = stmtTokens[1]?.value;
  if (op !== "=" && op !== "+=")
    return fail({
      kind: "ExpectedToken",
      expected: "'='",
      found: op,
      position: stmtTokens[1]?.position ?? first.position,
    });
  const expr = parseExpr(stmtTokens.slice(2));
  if (!expr.ok) return expr;
  return {
    ok: true,
    value: {
      assignment: {
        name: first.value,
        op: op as "=" | "+=",
        expr: expr.value,
        position: first.position,
      },
      position: first.position,
    },
  };
}

function parseOperand(token: Token): Result<Expr> {
  if (token.kind === "number")
    return {
      ok: true,
      value: { literal: Number(token.value), position: token.position },
    };
  if (token.kind === "keyword") {
    if (token.value === "true")
      return { ok: true, value: { literal: true, position: token.position } };
    if (token.value === "false")
      return { ok: true, value: { literal: false, position: token.position } };
    return fail({ kind: "UnsupportedExpression", position: token.position });
  }
  if (token.kind === "identifier")
    return {
      ok: true,
      value: { identifier: token.value, position: token.position },
    };
  return fail({ kind: "UnsupportedExpression", position: token.position });
}

function parseExpr(tokens: Token[]): Result<Expr> {
  if (tokens.length === 0)
    return fail({ kind: "UnsupportedExpression", position: 0 });
  if (tokens.length === 1) return parseOperand(tokens[0]!);
  if (
    tokens.length === 3 &&
    (tokens[1]?.value === "||" ||
      tokens[1]?.value === "&&" ||
      tokens[1]?.value === "<" ||
      tokens[1]?.value === "==")
  ) {
    const left = parseOperand(tokens[0]!);
    if (!left.ok) return left;
    const right = parseOperand(tokens[2]!);
    if (!right.ok) return right;
    return {
      ok: true,
      value: {
        binary: {
          op: tokens[1]!.value as "||" | "&&" | "<" | "==",
          left: left.value,
          right: right.value,
        },
        position: tokens[0]!.position,
      },
    };
  }
  return fail({ kind: "UnsupportedExpression", position: tokens[0]!.position });
}

type ParsedConditionBlock = {
  condition: Expr;
  body: Statement[];
  next: number;
};

function parseConditionBlock(
  tokens: Token[],
  start: number,
): Result<ParsedConditionBlock> {
  const keywordToken = tokens[start]!;
  if (tokens[start + 1]?.value !== "(")
    return fail({
      kind: "ExpectedToken",
      expected: "'('",
      found: tokens[start + 1]?.value,
      position: tokens[start + 1]?.position ?? keywordToken.position,
    });
  let k = start + 2;
  let parenDepth = 1;
  while (k < tokens.length && parenDepth > 0) {
    if (tokens[k]!.value === "(") parenDepth++;
    else if (tokens[k]!.value === ")") parenDepth--;
    k++;
  }
  if (parenDepth !== 0)
    return fail({
      kind: "UnbalancedParen",
      position: tokens[tokens.length - 1]?.position ?? keywordToken.position,
    });
  const condition = parseExpr(tokens.slice(start + 2, k - 1));
  if (!condition.ok) return condition;
  if (tokens[k]?.value !== "{")
    return fail({
      kind: "ExpectedToken",
      expected: "'{'",
      found: tokens[k]?.value,
      position: tokens[k]?.position ?? keywordToken.position,
    });
  const bodyResult = parseStatements(tokens, k + 1);
  if (!bodyResult.ok) return bodyResult;
  return {
    ok: true,
    value: {
      condition: condition.value,
      body: bodyResult.value.statements,
      next: bodyResult.value.next,
    },
  };
}

function parseIf(
  tokens: Token[],
  start: number,
): Result<{ ifStatement: IfStatement; next: number }> {
  const parsed = parseConditionBlock(tokens, start);
  if (!parsed.ok) return parsed;
  const { condition, body: thenBlock, next: afterThen } = parsed.value;
  let elseBlock: Statement[] | undefined;
  let next = afterThen;
  if (tokens[afterThen]?.value === "else") {
    if (tokens[afterThen + 1]?.value !== "{")
      return fail({
        kind: "ExpectedToken",
        expected: "'{'",
        found: tokens[afterThen + 1]?.value,
        position:
          tokens[afterThen + 1]?.position ?? tokens[afterThen]!.position,
      });
    const elseResult = parseStatements(tokens, afterThen + 2);
    if (!elseResult.ok) return elseResult;
    elseBlock = elseResult.value.statements;
    next = elseResult.value.next;
  }
  return {
    ok: true,
    value: {
      ifStatement: { condition, thenBlock, elseBlock },
      next,
    },
  };
}

function parseWhile(
  tokens: Token[],
  start: number,
): Result<{ whileStatement: WhileStatement; next: number }> {
  const parsed = parseConditionBlock(tokens, start);
  if (!parsed.ok) return parsed;
  const { condition, body, next } = parsed.value;
  return {
    ok: true,
    value: {
      whileStatement: { condition, body },
      next,
    },
  };
}

export function groupStatements(tokens: Token[]): Result<Statement[]> {
  const result = parseStatements(tokens, 0);
  if (!result.ok) return result;
  return { ok: true, value: result.value.statements };
}
