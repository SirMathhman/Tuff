import { tokenize, Token } from "./tokenize";
import { evalLeftToRight } from "./evalLeftToRight";
import { Result, ok, err, isOk, isErr } from "./result";

function evalExprWithEnv(tokens: Token[], env: Map<string, number>) {
  // Replace identifier tokens with numbers from env
  const substituted: Token[] = [];
  for (const t of tokens) {
    if (t.type === "ident") {
      const v = env.get(t.value);
      if (v === undefined) return err("Undefined variable");
      substituted.push({ type: "num", value: v });
    } else if (t.type === "punct") {
      return err("Invalid numeric input");
    } else {
      substituted.push(t);
    }
  }
  return evalLeftToRight(substituted);
}

export function interpret(input: string): Result<number, string> {
  const trimmed = input.trim();

  // Direct numeric literal (fast path)
  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric) && trimmed !== "") {
    return ok(numeric);
  }

  const tokensRes = tokenize(trimmed);
  if (isErr(tokensRes)) return err(tokensRes.error);
  const tokens = tokensRes.value;

  // Program-level evaluation supporting 'let' and ';'
  const env = new Map<string, number>();
  let i = 0;
  let lastVal: number | undefined = undefined;

  while (i < tokens.length) {
    // skip stray semicolons
    if (tokens[i].type === "punct" && tokens[i].value === ";") {
      i++;
      continue;
    }

    const t = tokens[i];

    // let statement: let <ident> [: <type>] = <expr> ;
    if (t.type === "ident" && t.value === "let") {
      i++;
      const nameTok = tokens[i];
      if (!nameTok || nameTok.type !== "ident")
        return err("Invalid numeric input");
      const name = nameTok.value;
      i++;

      let typeName: string | undefined;
      if (tokens[i] && tokens[i].type === "punct" && tokens[i].value === ":") {
        i++;
        const typeTok = tokens[i];
        if (!typeTok || typeTok.type !== "ident")
          return err("Invalid numeric input");
        typeName = typeTok.value;
        i++;
      }

      if (!tokens[i] || tokens[i].type !== "punct" || tokens[i].value !== "=")
        return err("Invalid numeric input");
      i++;

      // collect expression tokens until semicolon
      const start = i;
      let j = i;
      while (
        j < tokens.length &&
        !(tokens[j].type === "punct" && tokens[j].value === ";")
      )
        j++;
      if (j >= tokens.length) return err("Invalid numeric input");
      const exprTokens = tokens.slice(start, j);
      const valRes = evalExprWithEnv(exprTokens, env);
      if (isErr(valRes)) return err(valRes.error);
      let val = valRes.value;
      if (typeName === "I32") val = Math.trunc(val);
      env.set(name, val);
      lastVal = val;
      i = j + 1; // skip semicolon
      continue;
    }

    // otherwise expression: evaluate until semicolon or end
    const start = i;
    let j = i;
    while (
      j < tokens.length &&
      !(tokens[j].type === "punct" && tokens[j].value === ";")
    )
      j++;
    const exprTokens = tokens.slice(start, j);
    const valRes = evalExprWithEnv(exprTokens, env);
    if (isErr(valRes)) return err(valRes.error);
    lastVal = valRes.value;
    i = j + (j < tokens.length && tokens[j].type === "punct" ? 1 : 0);
  }

  if (lastVal === undefined) return err("Invalid numeric input");
  return ok(lastVal);
}
