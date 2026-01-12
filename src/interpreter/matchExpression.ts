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

function evaluateMatchArms(
  arms: MatchArm[],
  scrVal: number,
  env?: Env
): number | undefined {
  for (const a of arms) {
    if (a.pattern === "_") {
      const res = interpret(a.expr, env);
      if (typeof res !== "number")
        throw new Error("Match arm must return number");
      return res as number;
    }
    const patValRaw = interpret(a.pattern, env);
    if (typeof patValRaw !== "number")
      throw new Error("Match pattern must be numeric");
    const patVal = patValRaw as number;
    if (scrVal === patVal) {
      const res = interpret(a.expr, env);
      if (typeof res !== "number")
        throw new Error("Match arm must return number");
      return res as number;
    }
  }
  return undefined;
}

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

  function parseArm(arm: string): MatchArm {
    ensure(arm.startsWith("case "), "Invalid match arm");
    const after = sliceTrim(arm, 4);
    const arrowIdx = after.indexOf("=>");
    ensure(arrowIdx !== -1, "Invalid match arm");
    const pattern = after.slice(0, arrowIdx).trim();
    const expr = after.slice(arrowIdx + 2).trim();
    return { pattern, expr } as MatchArm;
  }
  const arms: MatchArm[] = armsRaw.map((arm) => parseArm(arm));

  const scrValRaw = interpret(scrutineeStr, env);
  if (typeof scrValRaw !== "number")
    throw new Error("Match scrutinee must be numeric");
  const scrVal = scrValRaw as number;
  const matched = evaluateMatchArms(arms, scrVal, env);
  if (matched !== undefined) return matched;

  throw new Error("No match arm matched");
}
