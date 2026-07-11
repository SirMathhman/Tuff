export function compileTuffToJS(source) {
  const trimmed = source.trim();
  if (trimmed === "") return "return 0;";

  // Tokenize into statements and braces
  const tokens = tokenize(trimmed);

  // Mutable-var tracking stack: each scope level has its own Set
  const mutStack = [new Set()];

  let result = compileTokens(tokens, true, mutStack);

  // If no return was emitted (e.g. only declarations), default to returning 0
  if (!result.some((l) => l.includes("return"))) {
    result.push("return 0;");
  }

  const preamble = "var _tuff_args = [null].concat(args);";
  return preamble + result.join("");
}

function compileTokens(tokens, isTopLevel, mutStack) {
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
      const innerLines = compileTokens(innerStmts, false, mutStack);
      lines.push("(function(){" + innerLines.join("") + "})();");

      mutStack.pop();
    } else if (t.type === "close") {
      // Should not happen at top level; skip
    } else {
      let stmt = t.value;

      // If this statement starts with `if` and the next token starts with `else`, merge them
      if (stmt.startsWith("if ") && i + 1 < tokens.length) {
        const nextT = tokens[i + 1];
        if (nextT.type === "stmt" && nextT.value.startsWith("else ")) {
          stmt = stmt + "; " + nextT.value;
          i++; // consume the else token
        }
      }

      const isLast = i === tokens.length - 1 && !hasLaterStmts(tokens, i);

      compileStatement(stmt, isLast, isTopLevel, mutStack, lines);
    }
  }
  return lines;
}

function compileStatement(stmt, isLast, isTopLevel, mutStack, lines) {
  // let / let mut declaration
  const letMatch = /^let\s+(?:mut\s+)?(\w+)\s*=\s*(.+)$/.exec(stmt);
  if (letMatch) return compileLet(letMatch, stmt, mutStack, lines);

  // if statement: if (cond) body or if (cond) body; else otherBody
  const ifMatch = /^if\s*\((.+)\)\s+(.+)$/.exec(stmt);
  if (ifMatch) {
    compileIf(ifMatch[1], ifMatch[2], mutStack, lines);
    return;
  }

  // Assignment or plain expression
  if (!isLast) checkAssignmentMutability(stmt, mutStack);

  const translated = translateExpr(stmt);
  lines.push(
    isLast && isTopLevel ? "return " + translated + ";" : translated + ";",
  );
}

function compileLet(letMatch, stmt, mutStack, lines) {
  const varName = letMatch[1];
  const isMut = stmt.startsWith("let mut");
  if (isMut) mutStack[mutStack.length - 1].add(varName);
  lines.push(translateExpr("var " + varName + " = " + letMatch[2] + ";"));
}

function compileIf(condRaw, bodyRaw, mutStack, lines) {
  const condExpr = translateExpr(condRaw);

  // Split on "; else " to separate then-body from else-body
  const elseIdx = bodyRaw.indexOf("; else ");
  if (elseIdx >= 0) {
    const thenBody = bodyRaw.substring(0, elseIdx);
    const elseBody = bodyRaw.substring(elseIdx + 7).trim();

    checkAssignmentMutability(thenBody, mutStack);
    checkAssignmentMutability(elseBody, mutStack);

    lines.push(
      "if (" + condExpr + ") {" + translateExpr(thenBody) + "} else {" + translateExpr(elseBody) + "}",
    );
  } else {
    checkAssignmentMutability(bodyRaw, mutStack);
    lines.push("if (" + condExpr + ") {" + translateExpr(bodyRaw) + "}");
  }
}

function checkAssignmentMutability(stmt, mutStack) {
  const assignMatch = /^(\w+)\s*=\s*(.+)$/.exec(stmt);
  if (assignMatch) {
    const targetVar = assignMatch[1];
    if (!mutStack.some((s) => s.has(targetVar))) {
      throw new Error(
        "cannot assign to immutable variable `" + targetVar + "`",
      );
    }
  }
}

function hasLaterStmts(tokens, fromIdx) {
  for (let i = fromIdx + 1; i < tokens.length; i++) {
    if (tokens[i].type === "stmt") return true;
    // A block after this statement means it's not the last meaningful expr
    if (tokens[i].type === "open") return true;
  }
  return false;
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
