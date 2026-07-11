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
      i = processBlock(tokens, i, mutStack, lines);
    } else if (t.type !== "close") {
      let stmt = t.value;

      // If this statement ends with `=`, check for block expression: `let x = { ... }`
      const pendingAssignMatch = /^(.+)\s*=$/.exec(stmt);
      if (pendingAssignMatch && i + 1 < tokens.length && tokens[i + 1].type === "open") {
        i = compileBlockAssignment(pendingAssignMatch[1], tokens, mutStack, lines, i + 1);
        continue;
      }

      // If this statement starts with `if`, handle it specially to support block bodies
      if (stmt.startsWith("if ") && i + 1 < tokens.length) {
        const nextT = tokens[i + 1];
        const isLast = i === tokens.length - 1 && !hasLaterStmts(tokens, i);

        // Parse the condition from "if (...)"
        const condMatch = /^if\s*\((.+)\)$/.exec(stmt);
        if (condMatch) {
          i = handleIf(condMatch[1], tokens, mutStack, lines, isLast, ++i);
          continue;
        }

        // Fallback: plain-expr else clause — merge and delegate to compileStatement
        if (nextT.type === "stmt" && nextT.value.startsWith("else ")) {
          stmt += "; " + nextT.value;
          i++;
          compileStatement(stmt, isLast, isTopLevel, mutStack, lines);
          continue;
        }

        // No block or else — just a plain if with expression body (handled below)
      }

      const isLast2 = i === tokens.length - 1 && !hasLaterStmts(tokens, i);

      compileStatement(stmt, isLast2, isTopLevel, mutStack, lines);
    }
  }
  return lines;
}

function processBlock(tokens, startIdx, mutStack, lines) {
  // Enter new scope — wrap block in IIFE so inner vars don't leak out
  mutStack.push(new Set());

  const innerStmts = collectBlockInner(tokens, startIdx);

  // Recurse into block — blocks never return, so isTopLevel=false
  const innerLines = compileTokens(innerStmts, false, mutStack);
  lines.push("(function(){" + innerLines.join("") + "})();");

  mutStack.pop();

  return findAfterClose(tokens, startIdx); // for-loop's i++ will skip to next token
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

function compileBlockAssignment(lhs, tokens, mutStack, lines, blockIdx) {
  // Compile block as expression — last inner expr becomes the value
  mutStack.push(new Set());
  const innerStmts = collectBlockInner(tokens, blockIdx);
  const innerLines = compileTokens(innerStmts, true, mutStack);
  mutStack.pop();

  if (lhs.includes("let")) {
    // Re-parse as let declaration with block value
    const letM = /^let\s+(?:mut\s+)?(\w+)\s*$/.exec(lhs);
    if (letM) {
      const varName = letM[1];
      const isMut = lhs.startsWith("let mut");
      // Push back to track in outer scope since we already popped above
      if (isMut) mutStack[mutStack.length - 1].add(varName);
      lines.push(
        "var " + varName + " = (function(){" + innerLines.join("") + "})();",
      );
    } else {
      lines.push("(function(){" + innerLines.join("") + "})();");
    }
  }

  return findAfterClose(tokens, blockIdx); // for-loop's i++ will skip past close brace
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
      "if (" +
        condExpr +
        ") {" +
        translateExpr(thenBody) +
        "} else {" +
        translateExpr(elseBody) +
        "}",
    );
  } else {
    checkAssignmentMutability(bodyRaw, mutStack);
    lines.push("if (" + condExpr + ") {" + translateExpr(bodyRaw) + "}");
  }
}

function handleIf(condRaw, tokens, mutStack, lines, isLast, idx) {
  const condExpr = translateExpr(condRaw);
  let i = idx;

  // Collect then-body: could be a block `{ ... }` or a plain expression token
  let thenLines = [];
  if (i < tokens.length && tokens[i].type === "open") {
    compileBlockBody(tokens, i, mutStack).forEach((l) => thenLines.push(l));
    i = findAfterClose(tokens, i) + 1;
  } else if (i < tokens.length && tokens[i].type === "stmt") {
    checkAssignmentMutability(tokens[i].value, mutStack);
    thenLines.push(translateExpr(tokens[i].value) + ";");
    i++;
  }

  // Check for else clause: could be `else ...` or `else { ... }`
  let elseLines = [];
  if (
    i < tokens.length &&
    tokens[i].type === "stmt" &&
    tokens[i].value.startsWith("else ")
  ) {
    const afterElse = i + 1;

    // Check mutability for plain-expr else body
    if (!tokens[afterElse] || tokens[afterElse].type !== "open") {
      checkAssignmentMutability(tokens[i].value.substring(5), mutStack);
    }

    if (afterElse < tokens.length && tokens[afterElse].type === "open") {
      i++; // skip the "else ..." stmt token
      compileBlockBody(tokens, i, mutStack).forEach((l) => elseLines.push(l));
      i = findAfterClose(tokens, i) + 1;
    } else {
      const rawElse = tokens[i].value.substring(5);
      if (rawElse.trim()) elseLines.push(translateExpr(rawElse) + ";");
      i++;
    }
  }

  buildIfOutput(condExpr, thenLines, elseLines, lines);

  return i;
}

function compileBlockBody(tokens, startIdx, mutStack) {
  const innerStmts = collectBlockInner(tokens, startIdx);
  mutStack.push(new Set());
  const result = compileTokens(innerStmts, false, mutStack);
  mutStack.pop();
  return result;
}

function findAfterClose(tokens, startIdx) {
  const result = walkBlock(tokens, startIdx);
  return result.closeIndex;
}

function collectBlockInner(tokens, startIdx) {
  const result = walkBlock(tokens, startIdx);
  return result.innerStmts;
}

/** Walk tokens inside a block starting at an open-brace token. */
function walkBlock(tokens, startIdx) {
  let depth = 1;
  const innerStmts = [];
  for (let j = startIdx + 1; j < tokens.length && depth > 0; j++) {
    if (tokens[j].type === "open") depth++;
    else if (tokens[j].type === "close") {
      depth--;
      if (depth === 0) return { innerStmts, closeIndex: j };
    } else {
      innerStmts.push(tokens[j]);
    }
  }
  return { innerStmts, closeIndex: startIdx }; // fallback — shouldn't happen with valid input
}

function buildIfOutput(condExpr, thenLines, elseLines, lines) {
  if (elseLines.length > 0) {
    lines.push(
      "if (" +
        condExpr +
        ") {" +
        thenLines.join("") +
        "} else {" +
        elseLines.join("") +
        "}",
    );
  } else {
    lines.push("if (" + condExpr + ") {" + thenLines.join("") + "}");
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
