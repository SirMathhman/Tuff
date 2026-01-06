/**
 * Interpret a string and return a Result<number, InterpretError>.
 * Use Result<T, E> instead of throwing errors.
 * Minimal rules for now:
 * - empty or whitespace-only -> 0
 * - numeric literal (integer or float) -> parsed number
 * - identifiers -> UndefinedIdentifier error
 * - otherwise -> InvalidInput error
 */
import {
  Result,
  InterpretError,
  Token,
  OpToken,
  IdToken,
  NumToken,
  err,
} from "./types";
import { Parser } from "./parser";

// Parser implementation moved to src/parser.ts

export function interpret(input: string): Result<number, InterpretError> {
  const s = input.trim();

  // tokenize numbers, identifiers, parentheses/braces, operators and punctuation
  const tokenRe = /\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|[+\-*/(){}:;=,]/g;
  const raw = s.match(tokenRe) ?? [];

  // ensure no unexpected characters (allow parentheses, braces, letters, and punctuation : ; = ,)
  const compact = s.replace(/\s+/g, "");
  if (compact.match(/[^+\-*/0-9.(){}:;=,A-Za-z_]/)) {
    return err({ type: "InvalidInput", message: "Unable to interpret input" });
  }

  // helpers to create strongly-typed tokens (avoid 'as' assertions)
  function makeOpToken(v: string): OpToken {
    return { type: "op", value: v };
  }
  function makeIdToken(v: string): IdToken {
    return { type: "id", value: v };
  }
  function makeNumToken(n: number): NumToken {
    return { type: "num", value: n };
  }

  const tokens: Token[] = raw.map((t) => {
    if (/^[+\-*/(){}:;=,]$/.test(t)) return makeOpToken(t);
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) return makeIdToken(t);
    return makeNumToken(Number(t));
  });

  const parser = new Parser(tokens);
  return parser.parse();
}
