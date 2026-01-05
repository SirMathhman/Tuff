function replaceBraces(expr: string): string {
  const braceRegex = /\{[^{}]*\}/;
  while (braceRegex.test(expr)) {
    expr = expr.replace(braceRegex, (match) => {
      const inner = match.slice(1, -1).trim();
      const { vars, body, error } = parseLetBindings(inner, { inBraces: true });

      if (error) return "NaN";

      if (vars.size > 0) {
        const substituted = substituteVarsInString(body, vars);
        return evalToString(substituted);
      }

      return evalToString(body);
    });
  }
  return expr;
}

function replaceParens(expr: string): string {
  const parenRegex = /\([^()]*\)/;
  while (parenRegex.test(expr)) {
    expr = expr.replace(parenRegex, (match) => {
      const inner = match.slice(1, -1);
      return evalToString(inner);
    });
  }
  return expr;
}

function evalToString(expr: string): string {
  const val = interpret(expr);
  return Number.isNaN(val) ? "NaN" : String(val);
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

function findSemicolonAtDepthZero(s: string, startPos: number): number {
  let pos = startPos;
  let depth = 0;
  while (pos < s.length) {
    const ch = s[pos];
    if (ch === "(" || ch === "{") depth++;
    else if (ch === ")" || ch === "}") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0) return pos;
    pos++;
  }
  return -1;
}

function substituteVarsInString(s: string, vars: Map<string, number>): string {
  let out = s;
  for (const [n, v] of vars) {
    out = out.replace(new RegExp("\\b" + n + "\\b", "g"), String(v));
  }
  return out;
}

function parseLetBindings(
  input: string,
  options: { inBraces?: boolean } = {}
): {
  vars: Map<string, number>;
  body: string;
  error?: "rhsNaN" | "duplicate" | "badType";
} {
  let text = input;
  const vars = new Map<string, number>();
  let done = false;

  while (!done) {
    const header = text.match(
      /^let\s+([a-zA-Z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)\s*=\s*/
    );
    if (!header) {
      done = true;
    } else {
      const name = header[1];
      let endPos = -1;

      if (options.inBraces) {
        // In braces: let declaration ends at semicolon
        const semiIdx = text.indexOf(";", header[0].length);
        if (semiIdx !== -1) {
          endPos = semiIdx;
        }
      } else {
        // At top level: use depth tracking
        endPos = findSemicolonAtDepthZero(text, header[0].length);
      }

      if (endPos === -1) {
        done = true;
      } else {
        const type = header[2];
        if (type !== "I32" && type !== "Bool") {
          return { vars: new Map(), body: text, error: "badType" };
        }
        if (vars.has(name)) {
          return { vars: new Map(), body: text, error: "duplicate" };
        }

        const rhs = text.slice(header[0].length, endPos).trim();
        const substituted = substituteVarsInString(rhs, vars);
        let rhsVal = interpret(substituted);
        if (Number.isNaN(rhsVal)) {
          return { vars: new Map(), body: text, error: "rhsNaN" };
        }

        // Coerce bools to 0/1
        if (type === "Bool") rhsVal = rhsVal ? 1 : 0;

        vars.set(name, rhsVal);
        text = text.slice(endPos + 1).trim();
      }
    }
  }

  return { vars, body: text };
}

function processTopLevelLets(expr: string): number | undefined {
  const s = expr.trim();
  const { vars, body, error } = parseLetBindings(s);

  if (error) return NaN;

  if (vars.size > 0) {
    const substituted = substituteVarsInString(body, vars);
    return interpret(substituted);
  }
  return undefined;
}

export function interpret(input: string): number {
  let expr = input.trim();

  const top = processTopLevelLets(expr);
  if (top !== undefined) return top;

  if (expr === "true") return 1;
  if (expr === "false") return 0;

  expr = replaceBraces(expr);
  expr = replaceParens(expr);
  expr = replaceIfExpressions(expr);

  return evalTokens(expr);
}
