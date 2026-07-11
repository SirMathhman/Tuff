export function compileTuffToJS(source) {
  const trimmed = source.trim();
  if (trimmed === "") return "return 0;";

  // Tokenize into statements and braces
  const tokens = tokenize(trimmed);

  // Mutable-var tracking stack: each scope level has its own Set
  const mutStack = [new Set()];

  let result = compileTokens(tokens, true, mutStack, false);

  // If no return was emitted (e.g. only declarations), default to returning 0
  if (!result.some((l) => l.includes("return"))) {
    result.push("return 0;");
  }

  const preamble = "var _tuff_args = [null].concat(args);";
  return preamble + result.join("");
}

function compileTokens(tokens, isTopLevel, mutStack, inIife) {
  let lines = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    if (t.type === "open") {
      i = processBlock(tokens, i, mutStack, lines);
    } else if (t.type !== "close") {
      let stmt = t.value;

      // Try special statement handlers (pending assign with block, if with blocks)
      const handled = tryCompileSpecialStmt(
        stmt,
        tokens,
        i,
        isTopLevel,
        mutStack,
        lines,
        inIife,
      );
      if (handled === true) continue;
      if (typeof handled === "number") {
        i = handled;
        continue;
      }

      // Fall back to normal statement compilation
      const isLast2 = i === tokens.length - 1 && !hasLaterStmts(tokens, i);
      compileStatement(stmt, isLast2, isTopLevel, mutStack, lines);
    }
  }
  return lines;
}

/** Try to handle special statement patterns. Returns index-to-jump, or false for normal path. */
function tryCompileSpecialStmt(
  stmt,
  tokens,
  i,
  isTopLevel,
  mutStack,
  lines,
  inIife,
) {
  // If this statement ends with `=>`, check for fn definition with block body
  const handledFn = tryCompilePendingFn(stmt, tokens, i, mutStack, lines);
  if (handledFn !== false) return handledFn;

  // If this statement ends with `=`, check for block expression: `let x = { ... }`
  const handledAssign = tryCompilePendingAssign(
    stmt,
    tokens,
    i,
    mutStack,
    lines,
  );
  if (handledAssign !== false) return handledAssign;

  // If this statement starts with `if`, handle it specially to support block bodies
  if (stmt.startsWith("if ") && i + 1 < tokens.length) {
    return tryCompileIfStmt(
      stmt,
      tokens,
      i,
      isTopLevel,
      mutStack,
      lines,
      inIife,
    );
  }

  return false; // fall through to normal statement compilation
}

/** Check for pending fn with block body: `fn name(params) => { ... }`. Returns index-to-jump or false. */
function tryCompilePendingFn(stmt, tokens, i, mutStack, lines) {
  const pendingFnMatch = /^(.+)\s*=>$/.exec(stmt);
  if (
    pendingFnMatch &&
    /^fn\s+\w+\s*\([^)]*\)$/.test(pendingFnMatch[1].trim()) &&
    i + 1 < tokens.length &&
    tokens[i + 1].type === "open"
  ) {
    return compileFnBlockBody(
      pendingFnMatch[1].trim(),
      tokens,
      mutStack,
      lines,
      i + 1,
    );
  }
  return false;
}

/** Check for pending assignment with block body: `let x = { ... }`. Returns index-to-jump or false. */
function tryCompilePendingAssign(stmt, tokens, i, mutStack, lines) {
  const pendingAssignMatch = /^(.+)\s*=$/.exec(stmt);
  if (
    pendingAssignMatch &&
    i + 1 < tokens.length &&
    tokens[i + 1].type === "open"
  ) {
    return compileBlockAssignment(
      pendingAssignMatch[1],
      tokens,
      mutStack,
      lines,
      i + 1,
    );
  }
  return false;
}

/** Handle `if` statements with block bodies or plain-expr else clauses. */
function tryCompileIfStmt(
  stmt,
  tokens,
  i,
  isTopLevel,
  mutStack,
  lines,
  inIife,
) {
  const nextT = tokens[i + 1];
  const isLast = i === tokens.length - 1 && !hasLaterStmts(tokens, i);

  // Parse the condition from "if (...)"
  const condMatch = /^if\s*\((.+)\)$/.exec(stmt);
  if (condMatch) {
    return handleIf(condMatch[1], tokens, mutStack, lines, isLast, ++i, inIife);
  }

  // Fallback: plain-expr else clause — merge and delegate to compileStatement
  if (nextT.type === "stmt" && nextT.value.startsWith("else ")) {
    stmt += "; " + nextT.value;
    i++;
    compileStatement(stmt, isLast, isTopLevel, mutStack, lines);
    return i; // caller sets loop's i to this, for-loop i++ advances past consumed else token
  }

  return false; // no block or else — plain if with expression body (handled below)
}

function processBlock(tokens, startIdx, mutStack, lines) {
  // Enter new scope — wrap block in IIFE so inner vars don't leak out
  mutStack.push(new Set());

  const innerStmts = collectBlockInner(tokens, startIdx);

  // Recurse into block — blocks never return, so isTopLevel=false
  const innerLines = compileTokens(innerStmts, false, mutStack, false);
  lines.push("(function(){" + innerLines.join("") + "})();");

  mutStack.pop();

  return findAfterClose(tokens, startIdx); // for-loop's i++ will skip to next token
}

/** Translate a body expression, handling yield→return when inside an IIFE. */
function translateBody(bodyRaw, inIife) {
  if (inIife) {
    const yieldMatch = /^yield\s+(.+)$/.exec(bodyRaw);
    if (yieldMatch) return "return " + translateExpr(yieldMatch[1]) + ";";
  }
  return translateExpr(bodyRaw) + ";";
}

function compileStatement(stmt, isLast, isTopLevel, mutStack, lines) {
  // let / let mut declaration
  const letMatch = /^let\s+(?:mut\s+)?(\w+)\s*=\s*(.+)$/.exec(stmt);
  if (letMatch) return compileLet(letMatch, stmt, mutStack, lines);

  // fn definition: `fn name(params) => body` → JS function declaration
  const fnMatch = /^fn\s+(\w+)\s*\(([^)]*)\)\s*=>\s*(.+)$/.exec(stmt);
  if (fnMatch) {
    compileFnExprBody(fnMatch[1], fnMatch[2], fnMatch[3], mutStack, lines);
    return;
  }

  // if statement: if (cond) body or if (cond) body; else otherBody
  const ifMatch = /^if\s*\((.+)\)\s+(.+)$/.exec(stmt);
  if (ifMatch) {
    compileIf(ifMatch[1], ifMatch[2], mutStack, lines, isTopLevel); // pass inIife via isTopLevel for plain-stmt context
    return;
  }

  // yield statement: early return from block expression (only valid in IIFE context)
  const yieldMatch = /^yield\s+(.+)$/.exec(stmt);
  if (yieldMatch && isTopLevel) {
    lines.push("return " + translateExpr(yieldMatch[1]) + ";");
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

/** Detect trailing binary operator after a block. Returns { op, found }. */
function detectTrailingOp(tokens, idx) {
  if (idx < tokens.length && tokens[idx].type === "stmt") {
    const nextVal = tokens[idx].value;
    const opMatch = /^[-+*/%]\s*(.+)$/.exec(nextVal);
    if (opMatch) return { op: translateExpr(" " + nextVal), found: true };
  }
  return { op: "", found: false };
}

function compileBlockAssignment(lhs, tokens, mutStack, lines, blockIdx) {
  // Compile block as expression — last inner expr becomes the value
  const result = compileBlockAsExpr(tokens, mutStack, blockIdx);
  const trailingInfo = detectTrailingOp(tokens, result.afterBlock);

  if (lhs.includes("let")) {
    // Re-parse as let declaration with block value
    const letM = /^let\s+(?:mut\s+)?(\w+)\s*$/.exec(lhs);
    if (letM) {
      const varName = letM[1];
      const isMut = lhs.startsWith("let mut");
      // Push back to track in outer scope since we already popped above
      if (isMut) mutStack[mutStack.length - 1].add(varName);
      lines.push(
        "var " +
          varName +
          " = (function(){" +
          result.innerLines.join("") +
          "}())" +
          trailingInfo.op +
          ";",
      );
    } else {
      lines.push(
        "(function(){" +
          result.innerLines.join("") +
          "}())" +
          trailingInfo.op +
          ";",
      );
    }
  }

  return trailingInfo.found ? result.afterBlock : result.afterBlock - 1; // for-loop's i++ will advance past consumed tokens
}

/** Compile `fn name(params) => { ... }` where body is a block (detected via pending-fn in tryCompileSpecialStmt). */
function compileFnBlockBody(fnPrefix, tokens, mutStack, lines, blockIdx) {
  const fnMatch = /^fn\s+(\w+)\s*\(([^)]*)\)$/.exec(fnPrefix);
  const fnName = fnMatch[1];
  const paramsStr = fnMatch[2];

  // Compile block body as IIFE with yield support
  const result = compileBlockAsExpr(tokens, mutStack, blockIdx);
  const trailingInfo = detectTrailingOp(tokens, result.afterBlock);

  lines.push(
    "function " +
      fnName +
      "(" +
      paramsStr +
      ") { return (function(){" +
      result.innerLines.join("") +
      "}())" +
      trailingInfo.op +
      "; }",
  );

  return trailingInfo.found ? result.afterBlock : result.afterBlock - 1; // for-loop's i++ will advance past consumed tokens
}

/** Shared helper: compile block body as IIFE with yield support. Returns { innerLines, afterBlock }. */
function compileBlockAsExpr(tokens, mutStack, blockIdx) {
  mutStack.push(new Set());
  const innerStmts = collectBlockInner(tokens, blockIdx);
  const innerLines = compileTokens(innerStmts, true, mutStack, true); // inIife=true for yield support
  mutStack.pop();

  const afterBlock = findAfterClose(tokens, blockIdx) + 1;
  return { innerLines, afterBlock };
}

/** Compile `fn name(params) => expr` where body is a simple expression (no block). */
function compileFnExprBody(fnName, paramsStr, bodyRaw, mutStack, lines) {
  const tokens = tokenize(bodyRaw);
  let innerLines = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "open") continue; // skip braces — shouldn't happen in simple fn body
    const stmt2 = t.value;
    const isLast2 = i === tokens.length - 1 && !hasLaterStmts(tokens, i);

    compileStatement(stmt2, isLast2, true, mutStack, innerLines);
  }

  lines.push(
    "function " +
      fnName +
      "(" +
      paramsStr +
      ") { return (function(){" +
      innerLines.join("") +
      "}()); }",
  );
}

function compileIf(condRaw, bodyRaw, mutStack, lines, inIife) {
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
        translateBody(thenBody, inIife) +
        "} else {" +
        translateBody(elseBody, inIife) +
        "}",
    );
  } else {
    checkAssignmentMutability(bodyRaw, mutStack);
    lines.push(
      "if (" + condExpr + ") {" + translateBody(bodyRaw, inIife) + "}",
    );
  }
}

function handleIf(condRaw, tokens, mutStack, lines, isLast, idx, inIife) {
  const condExpr = translateExpr(condRaw);
  let i = idx;

  // Collect then-body: could be a block `{ ... }` or a plain expression token
  let thenLines = [];
  if (i < tokens.length && tokens[i].type === "open") {
    compileBlockBody(tokens, i, mutStack, inIife).forEach((l) =>
      thenLines.push(l),
    );
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
      compileBlockBody(tokens, i, mutStack, inIife).forEach((l) =>
        elseLines.push(l),
      );
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

function compileBlockBody(tokens, startIdx, mutStack, inIife) {
  const innerStmts = collectBlockInner(tokens, startIdx);
  mutStack.push(new Set());
  const result = compileTokens(innerStmts, false, mutStack, inIife); // inherit inIife flag
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
