import type { Env } from "./types";
import { interpret } from "./interpret";
import {
  ensure,
  extractBracketContent,
  findMatchingParen,
  sliceTrim,
  startsWithKeyword,
  topLevelSplitTrim,
} from "./shared";

interface MatchArm {
  pattern: string;
  expr: string;
}

export function tryHandleMatchExpression(
  s: string,
  env?: Env
): number | undefined {
  const ss = s.trim();
  if (!startsWithKeyword(ss, "match")) return undefined;

  // parse 'match (scrutinee) { case p => expr; case _ => expr; }'
  const paren = ss.indexOf("(");
  ensure(paren !== -1, "Invalid match expression");
  const res = extractBracketContent(ss, paren);
  ensure(res !== undefined, "Unterminated match condition");
  const scrutineeStr = res!.content;

  // find brace block after condition
  const close = res!.close;
  const rest = ss.slice(close + 1).trim();
  ensure(rest.startsWith("{"), "Invalid match expression body");
  const braceClose = findMatchingParen(rest, 0);
  ensure(braceClose >= 0, "Unterminated match body");
  const body = rest.slice(1, braceClose).trim();

  const armsRaw = topLevelSplitTrim(body, ";");
  ensure(armsRaw.length !== 0, "Match has no arms");

  const arms: MatchArm[] = armsRaw.map((arm) => {
    ensure(arm.startsWith("case "), "Invalid match arm");
    const after = sliceTrim(arm, 4);
    const arrowIdx = after.indexOf("=>");
    ensure(arrowIdx !== -1, "Invalid match arm");
    const pattern = after.slice(0, arrowIdx).trim();
    const expr = after.slice(arrowIdx + 2).trim();
    return { pattern, expr } as MatchArm;
  });

  const scrVal = interpret(scrutineeStr, env);
  for (const a of arms) {
    if (a.pattern === "_") return interpret(a.expr, env);
    const patVal = interpret(a.pattern, env);
    if (scrVal === patVal) return interpret(a.expr, env);
  }

  throw new Error("No match arm matched");
}
