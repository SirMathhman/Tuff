/**
 * Interpret the given string and return a numeric result.
 *
 * Minimal implementation: parse a numeric string and simple `a + b` expressions.
 */
export function interpret(input: string): number {
  // Normalize and handle boolean literals
  let expr = input.trim();
  if (expr === "true") return 1;
  if (expr === "false") return 0;

  // Evaluate innermost parentheses first by recursion, then evaluate the resulting expression.
  const parenRegex = /\([^()]*\)/;
  while (parenRegex.test(expr)) {
    expr = expr.replace(parenRegex, (match) => {
      const inner = match.slice(1, -1);
      const val = interpret(inner);
      if (Number.isNaN(val)) return "NaN";
      return String(val);
    });
  }

  // Handle simple `if (cond) thenExpr else elseExpr` occurrences (minimal support).
  while (expr.indexOf("if") !== -1) {
    const idx = expr.indexOf("if");
    let pos = idx + 2;
    // skip spaces
    while (pos < expr.length && expr[pos] === " ") pos++;

    // parse condition
    let condStr = "";
    if (expr[pos] === "(") {
      const end = expr.indexOf(")", pos + 1);
      if (end === -1) break; // malformed
      condStr = expr.slice(pos + 1, end).trim();
      pos = end + 1;
    } else {
      const m = expr.slice(pos).match(/^\S+/);
      if (!m) break;
      condStr = m[0];
      pos += m[0].length;
    }

    // find else
    const elseIdx = expr.indexOf("else", pos);
    if (elseIdx === -1) break; // malformed

    const thenStr = expr.slice(pos, elseIdx).trim();
    const elseStr = expr.slice(elseIdx + 4).trim();

    const condVal = interpret(condStr);
    const chosenStr = condVal && !Number.isNaN(condVal) ? thenStr : elseStr;
    const chosenVal = interpret(chosenStr);

    // replace from idx to end with chosenVal
    expr = expr.slice(0, idx) + String(chosenVal);
  }

  // Tokenize numbers and operators (+, -, *, /). Negative numbers are allowed.
  const tokens = expr.match(/-?\d+(?:\.\d+)?|[+\-*/]/g);
  if (tokens && tokens.length > 0) {
    // If the first token isn't a number, fallback to numeric coercion
    if (!/^(-?\d)/.test(tokens[0])) {
      return Number(expr);
    }

    // First pass: handle * and / with higher precedence.
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

    // Second pass: evaluate + and - left-to-right.
    let acc = Number(afterMulDiv[0]);
    for (let i = 1; i < afterMulDiv.length; i += 2) {
      const op = afterMulDiv[i];
      const next = Number(afterMulDiv[i + 1]);
      if (op === "+") acc += next;
      else if (op === "-") acc -= next;
      else return Number(expr); // unexpected token
    }
    return acc;
  }

  // Default: coerce to number
  return Number(expr);
}
