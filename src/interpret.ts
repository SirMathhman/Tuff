function replaceBraces(expr: string): string {
  const braceRegex = /\{[^{}]*\}/;
  while (braceRegex.test(expr)) {
    expr = expr.replace(braceRegex, (match) => {
      let inner = match.slice(1, -1).trim();

      // Minimal let-binding support: allow multiple `let <ident> : I32 = <rhs>;` declarations
      // followed by a body expression. Use Map instead of Record.
      const vars = new Map<string, number>();
      let letDecl: RegExpMatchArray | null = null;
      while (
        (letDecl = inner.match(
          /^let\s+([a-zA-Z_$][\w$]*)\s*:\s*I32\s*=\s*([\s\S]*?)\s*;\s*/
        )) !== null
      ) {
        const name = letDecl[1];
        let rhs = letDecl[2].trim();
        // Substitute any already-declared vars into rhs
        for (const [n, v] of vars) {
          rhs = rhs.replace(new RegExp("\\b" + n + "\\b", "g"), String(v));
        }
        const rhsVal = interpret(rhs);
        if (Number.isNaN(rhsVal)) return "NaN";
        vars.set(name, rhsVal);
        inner = inner.slice(letDecl[0].length).trim();
      }

      if (vars.size > 0) {
        // Remaining inner is the body; replace variable names with values and evaluate
        let body = inner;
        for (const [name, val] of vars) {
          body = body.replace(
            new RegExp("\\b" + name + "\\b", "g"),
            String(val)
          );
        }
        const v = interpret(body);
        return Number.isNaN(v) ? "NaN" : String(v);
      }

      const val = interpret(inner);
      return Number.isNaN(val) ? "NaN" : String(val);
    });
  }
  return expr;
}

function replaceParens(expr: string): string {
  const parenRegex = /\([^()]*\)/;
  while (parenRegex.test(expr)) {
    expr = expr.replace(parenRegex, (match) => {
      const inner = match.slice(1, -1);
      const val = interpret(inner);
      return Number.isNaN(val) ? "NaN" : String(val);
    });
  }
  return expr;
}

function replaceIfExpressions(expr: string): string {
  let processing = true;
  while (expr.indexOf("if") !== -1 && processing) {
    const idx = expr.indexOf("if");
    let pos = idx + 2;
    while (pos < expr.length && expr[pos] === " ") pos++;

    let condStr = "";
    let malformed = false;
    if (expr[pos] === "(") {
      const end = expr.indexOf(")", pos + 1);
      if (end === -1) {
        malformed = true;
      } else {
        condStr = expr.slice(pos + 1, end).trim();
        pos = end + 1;
      }
    } else {
      const m = expr.slice(pos).match(/^\S+/);
      if (!m) {
        malformed = true;
      } else {
        condStr = m[0];
        pos += m[0].length;
      }
    }

    const elseIdx = expr.indexOf("else", pos);
    if (elseIdx === -1) malformed = true;

    if (!malformed) {
      const thenStr = expr.slice(pos, elseIdx).trim();
      const elseStr = expr.slice(elseIdx + 4).trim();

      const condVal = interpret(condStr);
      const chosenStr = condVal && !Number.isNaN(condVal) ? thenStr : elseStr;
      const chosenVal = interpret(chosenStr);

      expr = expr.slice(0, idx) + String(chosenVal);
    } else {
      processing = false;
    }
  }
  return expr;
}

function evalTokens(expr: string): number {
  const tokens = expr.match(/-?\d+(?:\.\d+)?|[+\-*/]/g);
  if (!tokens || tokens.length === 0) return Number(expr);
  if (!/^(-?\d)/.test(tokens[0])) return Number(expr);

  const afterMulDiv: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if ((tk === "*" || tk === "/") && afterMulDiv.length > 0) {
      const prev = Number(afterMulDiv.pop());
      const next = Number(tokens[++i]);
      const res = tk === "*" ? prev * next : prev / next;
      afterMulDiv.push(String(res));
    } else {
      afterMulDiv.push(tk);
    }
  }

  let acc = Number(afterMulDiv[0]);
  for (let i = 1; i < afterMulDiv.length; i += 2) {
    const op = afterMulDiv[i];
    const next = Number(afterMulDiv[i + 1]);
    if (op === "+") acc += next;
    else if (op === "-") acc -= next;
    else return Number(expr);
  }
  return acc;
}

export function interpret(input: string): number {
  let expr = input.trim();
  if (expr === "true") return 1;
  if (expr === "false") return 0;

  expr = replaceBraces(expr);
  expr = replaceParens(expr);
  expr = replaceIfExpressions(expr);

  return evalTokens(expr);
}
