import { Token } from "../tokenize";
import { Result, ok, err } from "../result";
import { Binding } from "../matchEval";
import { allocateAddress } from "../pointers";

export interface AmpSubstResult {
  token: Token;
  consumed: number;
}

export function handleAmpSubst(
  tokens: Token[],
  i: number,
  env: Map<string, Binding>
): Result<AmpSubstResult, string> {
  const next = tokens[i + 1];
  if (!next) return err("Invalid numeric input");
  let mut = false;
  let nameTok = next;
  if (next.type === "ident" && next.value === "mut") {
    mut = true;
    nameTok = tokens[i + 2];
  }
  if (!nameTok || nameTok.type !== "ident") return err("Invalid numeric input");
  const name = nameTok.value;
  const b = env.get(name);
  if (!b) return err("Undefined variable");
  if (b.type !== "var") return err("Invalid numeric input");
  if (mut && !b.mutable)
    return err("Cannot take mutable address of immutable variable");
  const id = allocateAddress(env, name);
  return ok({ token: { type: "num", value: id }, consumed: mut ? 3 : 2 });
}
