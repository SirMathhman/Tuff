import { EvalErrorCode, err } from "./errors.ts";
import type { Token } from "./tokens.ts";
import type { Env } from "./env.ts";
import {
  parseExpression,
  type ParseBlockFn,
  type ParseResult,
} from "./expressions.ts";
import {
  parseAssignment,
  parseBindingValue,
  parseDerefAssignment,
} from "./assignments.ts";
import { parseCompoundAssignment } from "./compound.ts";
import { parseIf } from "./if.ts";

/**
 * Parses a `let [mut] ident = expr ;` binding. `pos` points at the `let`
 * keyword. Returns `next` just past the terminating `;`.
 */
export function parseLetBinding(
  tokens: Token[],
  pos: number,
  env: Env,
  parseBlock: ParseBlockFn,
): ParseResult {
  let cursor = pos + 1;
  let mutable = false;
  const maybeMut = tokens[cursor];
  if (maybeMut && maybeMut.type === "keyword" && maybeMut.keyword === "mut") {
    mutable = true;
    cursor++;
  }
  const ident = tokens[cursor];
  if (!ident || ident.type !== "ident") {
    return err(
      EvalErrorCode.ExpectedIdentifier,
      "",
      "An identifier was expected after 'let'.",
      cursor,
    );
  }
  const assign = tokens[cursor + 1];
  if (!assign || assign.type !== "assign") {
    return err(
      EvalErrorCode.ExpectedAssign,
      "",
      `"=" was expected after the variable name "${ident.name}".`,
      cursor + 1,
    );
  }
  return parseBindingValue(
    tokens,
    cursor + 2,
    env,
    ident.name,
    mutable,
    parseBlock,
  );
}

/**
 * Parses zero or more statements (`let [mut] ident = expr ;`,
 * `ident = expr ;`, `ident += expr ;`, or `*ident = expr ;`) followed by a
 * trailing expression.
 * Statements run in a child env so bindings don't leak out. Returns the
 * trailing expression's value and `next` just past it.
 */
export function parseStatements(
  tokens: Token[],
  pos: number,
  env: Env,
): ParseResult {
  const localEnv = new Map(env);
  let cursor = pos;
  while (cursor < tokens.length) {
    const tok = tokens[cursor];
    if (!tok) break;
    if (tok.type === "keyword" && tok.keyword === "let") {
      const binding = parseLetBinding(tokens, cursor, localEnv, parseBlock);
      if (!binding.ok) return binding;
      cursor = binding.next;
      continue;
    }
    if (tok.type === "ident") {
      const nextTok = tokens[cursor + 1];
      if (nextTok && nextTok.type === "assign") {
        const assignment = parseAssignment(
          tokens,
          cursor,
          localEnv,
          parseBlock,
        );
        if (!assignment.ok) return assignment;
        cursor = assignment.next;
        continue;
      }
      if (nextTok && nextTok.type === "plusAssign") {
        const assignment = parseCompoundAssignment(
          tokens,
          cursor,
          localEnv,
          parseBlock,
        );
        if (!assignment.ok) return assignment;
        cursor = assignment.next;
        continue;
      }
    }
    if (tok.type === "paren" && tok.paren === "{" && cursor > pos) {
      // A bare "{ ... }" that follows a statement (i.e. after a ";") is a
      // block statement; its value is discarded and parsing continues with
      // the next statement. A "{" at the start of the list is a block
      // expression (e.g. "{ 2 + 3 } * 4") and is left to the trailing
      // expression parse.
      const block = parseBlock(tokens, cursor + 1, localEnv);
      if (!block.ok) return block;
      cursor = block.next;
      continue;
    }
    if (tok.type === "keyword" && tok.keyword === "if" && cursor > pos) {
      // An "if" that follows a statement (i.e. after a ";") is an if
      // statement; its value is discarded and parsing continues with the
      // next statement. An "if" at the start of the list is an expression
      // and is left to the trailing expression parse.
      const branch = parseIf(
        tokens,
        cursor,
        localEnv,
        parseBlock,
        parseExpression,
      );
      if (!branch.ok) return branch;
      cursor = branch.next;
      continue;
    }
    if (tok.type === "op" && tok.op === "*") {
      const derefTarget = tokens[cursor + 1];
      const assignTok = tokens[cursor + 2];
      if (
        derefTarget &&
        derefTarget.type === "ident" &&
        assignTok &&
        assignTok.type === "assign"
      ) {
        const assignment = parseDerefAssignment(
          tokens,
          cursor,
          localEnv,
          parseBlock,
        );
        if (!assignment.ok) return assignment;
        cursor = assignment.next;
        continue;
      }
    }
    break;
  }
  // A trailing expression is optional: a block (or the top level) may end
  // right after its statements, in which case the value is 0.
  const trailing = tokens[cursor];
  if (!trailing || (trailing.type === "paren" && trailing.paren === "}")) {
    return { ok: true, value: { kind: "num", num: 0 }, next: cursor };
  }
  return parseExpression(tokens, cursor, localEnv, parseBlock);
}

/**
 * Parses the body of a `{ ... }` block: statements followed by a closing `}`.
 * `pos` points just past the opening `{`. Returns `next` just past the `}`.
 */
export function parseBlock(
  tokens: Token[],
  pos: number,
  env: Env,
): ParseResult {
  const body = parseStatements(tokens, pos, env);
  if (!body.ok) return body;
  if (body.next === pos) {
    return err(
      EvalErrorCode.EmptyBlock,
      "",
      `A block must contain at least one statement or expression. Add a statement or expression inside the "{ }".`,
      pos,
    );
  }
  const close = tokens[body.next];
  if (!close || close.type !== "paren" || close.paren !== "}") {
    return err(
      EvalErrorCode.ExpectedCloseParen,
      "",
      'A closing "}" was expected. Add a matching "}".',
      body.next,
    );
  }
  return { ok: true, value: body.value, next: body.next + 1 };
}
