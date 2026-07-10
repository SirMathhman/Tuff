export function compileTuffToJS(source) {
  const trimmed = source.trim();
  if (trimmed === "") return "return 0;";

  // Split into statements by semicolons, filter empty
  const rawStatements = trimmed
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let jsLines = [];
  // Create __args__ as [null, ...args] so index 1 maps to args[0], etc.
  jsLines.push("var _tuff_args = [null].concat(args);");

  // Track which variables are mutable (declared with `let mut`)
  const mutableVars = new Set();

  for (let i = 0; i < rawStatements.length; i++) {
    const stmt = rawStatements[i];
    const isLast = i === rawStatements.length - 1;

    // Match let declarations: "let varname = expr" or "let mut varname = expr"
    const letMatch = /^let\s+(?:mut\s+)?(\w+)\s*=\s*(.+)$/.exec(stmt);
    if (letMatch) {
      const varName = letMatch[1];
      const isMut = stmt.startsWith("let mut");
      if (isMut) mutableVars.add(varName);
      const expr = translateExpr(letMatch[2]);
      jsLines.push("var " + varName + " = " + expr + ";");
      continue;
    }

    // Check for assignment: "varname = expr"
    const assignMatch = /^(\w+)\s*=\s*(.+)$/.exec(stmt);
    if (assignMatch && !isLast) {
      const targetVar = assignMatch[1];
      // If variable is not declared as mutable, reassignment is an error
      if (!mutableVars.has(targetVar)) {
        throw new Error(
          "cannot assign to immutable variable `" + targetVar + "`",
        );
      }
    }

    // Expression statement - last one is returned, others are evaluated for side effects
    const translated = translateExpr(stmt);
    if (isLast) {
      jsLines.push("return " + translated + ";");
    } else {
      jsLines.push(translated + ";");
    }
  }

  return jsLines.join("");
}

function translateExpr(expr) {
  // Replace __args__ with _tuff_args so property/index access works naturally
  let result = expr.replace(/__args__/g, "_tuff_args");
  return result;
}
