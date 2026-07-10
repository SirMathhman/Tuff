export function compileTuffToJS(source) {
  const trimmed = source.trim();
  if (trimmed === "") return "return 0;";

  // Tokenize into statements and braces
  const tokens = tokenize(trimmed);

  // Mutable-var tracking stack: each scope level has its own Set
  const mutStack = [new Set()];

  function compile(tokens, isTopLevel) {
    let lines = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];

      if (t.type === "open") {
        // Enter new scope — wrap block in IIFE so inner vars don't leak out
        mutStack.push(new Set());

        // Find matching close, collecting inner stmts
        let depth = 1;
        i++;
        const innerStmts = [];
        while (i < tokens.length && depth > 0) {
          if (tokens[i].type === "open") depth++;
          else if (tokens[i].type === "close") {
            depth--;
            if (depth === 0) break;
          } else {
            innerStmts.push(tokens[i]);
          }
          i++;
        }

        // Recurse into block — blocks never return, so isTopLevel=false
        const innerLines = compile(innerStmts, false);
        lines.push("(function(){" + innerLines.join("") + "})();");

        mutStack.pop();
      } else if (t.type === "close") {
        // Should not happen at top level; skip
      } else {
        const stmt = t.value;
        const isLast = i === tokens.length - 1 && !hasLaterStmts(tokens, i);

        // let / let mut declaration
        const letMatch = /^let\s+(?:mut\s+)?(\w+)\s*=\s*(.+)$/.exec(stmt);
        if (letMatch) {
          const varName = letMatch[1];
          const isMut = stmt.startsWith("let mut");
          if (isMut) mutStack[mutStack.length - 1].add(varName);
          lines.push(
            translateExpr("var " + varName + " = " + letMatch[2] + ";"),
          );
        } else {
          // Assignment or plain expression
          const assignMatch = /^(\w+)\s*=\s*(.+)$/.exec(stmt);
          if (assignMatch && !isLast) {
            const targetVar = assignMatch[1];
            if (!mutStack.some((s) => s.has(targetVar))) {
              throw new Error(
                "cannot assign to immutable variable `" + targetVar + "`",
              );
            }
          }

          const translated = translateExpr(stmt);
          lines.push(
            isLast && isTopLevel
              ? "return " + translated + ";"
              : translated + ";",
          );
        }
      }
    }
    return lines;
  }

  function hasLaterStmts(tokens, fromIdx) {
    for (let i = fromIdx + 1; i < tokens.length; i++) {
      if (tokens[i].type === "stmt") return true;
      // A block after this statement means it's not the last meaningful expr
      if (tokens[i].type === "open") return true;
    }
    return false;
  }

  let result = compile(tokens, true);

  // If no return was emitted (e.g. only declarations), default to returning 0
  if (!result.some((l) => l.includes("return"))) {
    result.push("return 0;");
  }

  const preamble = "var _tuff_args = [null].concat(args);";
  return preamble + result.join("");
}

function tokenize(source) {
  const tokens = [];
  let buf = "";
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") {
      flush();
      tokens.push({ type: "open" });
    } else if (ch === "}") {
      flush();
      tokens.push({ type: "close" });
    } else if (ch === ";") {
      const v = buf.trim();
      buf = "";
      if (v) tokens.push({ type: "stmt", value: v });
    } else {
      buf += ch;
    }
  }
  flush();
  return tokens;

  function flush() {
    const v = buf.trim();
    buf = "";
    if (v) tokens.push({ type: "stmt", value: v });
  }
}

function translateExpr(expr) {
  // Replace __args__ with _tuff_args so property/index access works naturally
  return expr.replace(/__args__/g, "_tuff_args");
}
