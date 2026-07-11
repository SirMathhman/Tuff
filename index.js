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

/** Handle yield/return early exit statements. Returns true if handled. */
function tryCompileEarlyExit(stmt, isTopLevel, lines) {
  // yield statement: early return from block expression (only valid in IIFE context)
  const yieldMatch = /^yield\s+(.+)$/.exec(stmt);
  if (yieldMatch && isTopLevel) {
    lines.push("return " + translateExpr(yieldMatch[1]) + ";");
    return true;
  }

  // return statement: throw sentinel to escape fn-level try/catch, bypassing trailing ops
  const returnMatch = /^return\s+(.+)$/.exec(stmt);
  if (returnMatch && isTopLevel) {
    lines.push(
      "throw {_tuff_return: true, value: " +
        translateExpr(returnMatch[1]) +
        "};",
    );
    return true;
  }

  return false;
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

  // Control flow: while / if / for-in-range → delegate to helpers
  const handledControl = tryCompileControlFlow(
    stmt,
    isTopLevel,
    mutStack,
    lines,
  );
  if (handledControl) {
    return;
  }

  // yield/return: early exit from block expression or fn body
  const handledEarlyExit = tryCompileEarlyExit(stmt, isTopLevel, lines);
  if (handledEarlyExit) return;

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
      ") { try { return (function(){" +
      result.innerLines.join("") +
      "}())" +
      trailingInfo.op +
      "; } catch (_tuff_e) { if (_tuff_e && _tuff_e._tuff_return !== undefined) return _tuff_e.value; throw _tuff_e; } }",
  );

  return trailingInfo.found ? result.afterBlock : result.afterBlock - 1; // for-loop's i++ will advance past consumed tokens
}

/** Shared helper: compile block body as IIFE with yield support. Returns { innerLines, afterBlock }. */
function compileBlockAsExpr(tokens, mutStack, blockIdx) {
  mutStack.push(new Set());
  const innerStmts = collectBlockInner(tokens, blockIdx);

  // Check if any statement contains 'yield' or 'return' in control flow bodies (if/while/for)
  const hasYield = innerStmts.some(
    (t) => t.type === "stmt" && /\byield\b/.test(t.value),
  );
  const hasReturnInControlFlow = innerStmts.some(
    (t) =>
      t.type === "stmt" &&
      /^(if|while|for)\s*\(/.test(t.value) &&
      /\breturn\b/.test(t.value),
  );

  let innerLines;
  if (hasYield || hasReturnInControlFlow) {
    // Translate yield → return and/or return → sentinel throw for the block body
    const translatedStmts = translateStatementsForBlock(innerStmts);
    innerLines = compileTokens(translatedStmts, true, mutStack, false);
  } else {
    innerLines = compileTokens(innerStmts, true, mutStack, true); // inIife=true for return sentinel support
  }
  mutStack.pop();

  const afterBlock = findAfterClose(tokens, blockIdx) + 1;
  return { innerLines, hasYield, afterBlock };
}

/** Translate yield statements to return statements in a token array. */
function translateStatementsForBlock(stmts) {
  return stmts.map((t) => {
    if (t.type === "stmt") {
      // Direct yield: `yield X` → `return X`
      const yieldMatch = /^yield\s+(.+)$/.exec(t.value);
      if (yieldMatch) return { type: "stmt", value: "return " + yieldMatch[1] };

      // Control flow with nested yield in body: replace 'yield' keyword with 'return' in the statement text
      if (/^(if|while|for)\s*\(/.test(t.value) && /\byield\b/.test(t.value)) {
        return {
          type: "stmt",
          value: t.value.replace(/\byield\s+/g, "return "),
        };
      }

      // Control flow with nested return in body: replace 'return' keyword with sentinel throw
      if (/^(if|while|for)\s*\(/.test(t.value) && /\breturn\b/.test(t.value)) {
        const translated = t.value.replace(
          /return\s+/g,
          "throw {_tuff_return: true, value: ",
        );
        return { type: "stmt", value: translated + "};" };
      }
    }
    return t;
  });
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
      ") { try { return (function(){" +
      innerLines.join("") +
      "}()); } catch (_tuff_e) { if (_tuff_e && _tuff_e._tuff_return !== undefined) return _tuff_e.value; throw _tuff_e; } }",
  );
}

/** Try to match and compile control flow statements: for-in-range / while / if. Returns true if handled. */
function tryCompileControlFlow(stmt, isTopLevel, mutStack, lines) {
  // For loops: literal range, variable range, or literal array
  const handledFor = tryCompileForLoop(stmt, mutStack, lines);
  if (handledFor) return true;

  // while loop: `while (cond) body`
  const whileMatch = /^while\s*\((.+)\)\s+(.+)$/.exec(stmt);
  if (whileMatch) {
    compileWhile(whileMatch[1], whileMatch[2], mutStack, lines);
    return true;
  }

  // if statement: `if (cond) body` or `if (cond) body; else otherBody`
  const ifMatch = /^if\s*\((.+)\)\s+(.+)$/.exec(stmt);
  if (ifMatch) {
    compileIf(ifMatch[1], ifMatch[2], mutStack, lines, isTopLevel);
    return true;
  }

  return false;
}

/** Try to match and compile for-in loops. Returns true if handled. */
function tryCompileForLoop(stmt, mutStack, lines) {
  // for-in-range loop with literal range: `for (i in start..end) body`
  const forLiteralRange = /^for\s*\((\w+)\s+in\s+(\d+)\.\.(\d+)\)\s+(.+)$/.exec(
    stmt,
  );
  if (forLiteralRange) {
    compileForInRange(
      forLiteralRange[1],
      +forLiteralRange[2],
      +forLiteralRange[3],
      forLiteralRange[4],
      mutStack,
      lines,
    );
    return true;
  }

  // for-in-range loop with variable range: `for (i in rangeVar) body`
  const forVariableRange = /^for\s*\((\w+)\s+in\s+(\w+)\)\s+(.+)$/.exec(stmt);
  if (forVariableRange) {
    compileForInVariable(
      forVariableRange[1],
      forVariableRange[2],
      forVariableRange[3],
      mutStack,
      lines,
    );
    return true;
  }

  // for-in-array loop with literal array: `for (i in [1, 2, 3]) body`
  const forLiteralArray = /^for\s*\((\w+)\s+in\s+(\[[^\]]+\])\)\s+(.+)$/.exec(
    stmt,
  );
  if (forLiteralArray) {
    compileForInLiteralArray(
      forLiteralArray[1],
      forLiteralArray[2],
      forLiteralArray[3],
      mutStack,
      lines,
    );
    return true;
  }

  return false;
}

/** Compile `for (i in start..end) body` with literal numeric range. */
function compileForInRange(varName, start, end, bodyRaw, mutStack, lines) {
  const body = translateExpr(bodyRaw);
  checkAssignmentMutability(bodyRaw, mutStack);
  lines.push(
    "for (let " +
      varName +
      " = " +
      start +
      "; " +
      varName +
      " < " +
      end +
      "; " +
      varName +
      "++) {" +
      body +
      "}",
  );
}

/** Compile `for (i in rangeVar) body` where rangeVar holds a [start, end] array. */
function compileForInVariable(varName, rangeVar, bodyRaw, mutStack, lines) {
  const body = translateExpr(bodyRaw);
  checkAssignmentMutability(bodyRaw, mutStack);
  lines.push(
    "for (let " +
      varName +
      " = " +
      rangeVar +
      "[0]; " +
      varName +
      " < " +
      rangeVar +
      "[1]; " +
      varName +
      "++) {" +
      body +
      "}",
  );
}

/** Compile `for (i in [a, b, c]) body` with literal array elements. */
function compileForInLiteralArray(varName, arrLit, bodyRaw, mutStack, lines) {
  const body = translateExpr(bodyRaw);
  checkAssignmentMutability(bodyRaw, mutStack);
  lines.push(
    "var _tuff_arr = " +
      arrLit +
      "; for (let " +
      varName +
      " of _tuff_arr) {" +
      body +
      "}",
  );
}

/** Compile `while (cond) body`. */
function compileWhile(condRaw, bodyRaw, mutStack, lines) {
  const condExpr = translateExpr(condRaw);
  const body = translateExpr(bodyRaw);
  checkAssignmentMutability(bodyRaw, mutStack);
  lines.push("while (" + condExpr + ") {" + body + "}");
}

/** Compile `if (cond) thenBody` or `if (cond) thenBody; else elseBody`. */
function compileIf(condRaw, bodyRaw, mutStack, lines) {
  const condExpr = translateExpr(condRaw);
  // Check for else clause: `thenBody; else otherBody`
  const elseMatch = /^(.+);\s*else\s*(.+)$/.exec(bodyRaw);
  if (elseMatch) {
    const thenBody = translateExpr(elseMatch[1]);
    const elseBody = translateExpr(elseMatch[2]);
    checkAssignmentMutability(elseMatch[1], mutStack);
    checkAssignmentMutability(elseMatch[2], mutStack);
    lines.push(
      "if (" + condExpr + ") {" + thenBody + "} else {" + elseBody + "}",
    );
  } else {
    const body = translateExpr(bodyRaw);
    checkAssignmentMutability(bodyRaw, mutStack);
    lines.push("if (" + condExpr + ") {" + body + "}");
  }
}

/** Collect the body of an if/else branch from tokens. Returns { bodyLines, nextIdx }. */
function collectBranchBody(tokens, idx, mutStack, inIife) {
  const bodyLines = [];
  let i = idx;

  if (i < tokens.length && tokens[i].type === "open") {
    compileBlockBody(tokens, i, mutStack, inIife).forEach((l) =>
      bodyLines.push(l),
    );
    i = findAfterClose(tokens, i) + 1;
  } else if (i < tokens.length && tokens[i].type === "stmt") {
    checkAssignmentMutability(tokens[i].value, mutStack);
    bodyLines.push(translateExpr(tokens[i].value) + ";");
    i++;
  }

  return { bodyLines, nextIdx: i };
}

/** Collect else clause lines from tokens. Returns { elseLines, consumed }. */
function collectElseClause(tokens, idx, mutStack, inIife) {
  const elseLines = [];

  if (idx >= tokens.length || tokens[idx].type !== "stmt")
    return { elseLines, consumed: false };

  const stmtVal = tokens[idx].value;

  // Chained `else if (...)` — recurse into handleIf for the nested condition
  if (stmtVal.startsWith("else if ")) {
    const nestedMatch = /^else\s+if\s*\((.+)\)$/.exec(stmtVal);
    if (nestedMatch)
      return {
        elseLines,
        consumed: true,
        isChained: true,
        condRaw: nestedMatch[1],
      };
  }

  // Plain `else expr` or `else { ... }`
  if (stmtVal.startsWith("else ")) {
    const afterElse = idx + 1;
    if (afterElse < tokens.length && tokens[afterElse].type === "open") {
      compileBlockBody(tokens, afterElse, mutStack, inIife).forEach((l) =>
        elseLines.push(l),
      );
      return {
        elseLines,
        consumed: true,
        closeAfter: findAfterClose(tokens, afterElse),
      };
    }

    const rawElse = stmtVal.substring(5);
    if (rawElse.trim()) {
      checkAssignmentMutability(rawElse, mutStack);
      elseLines.push(translateExpr(rawElse) + ";");
    }
    return { elseLines, consumed: true };
  }

  return { elseLines, consumed: false };
}

/** Handle block-based if statements (when followed by `{ ... }` blocks). */
function handleIf(condRaw, tokens, mutStack, lines, isLast, idx, inIife) {
  const condExpr = translateExpr(condRaw);
  let i = idx;

  // Collect then-body: could be a block `{ ... }` or a plain expression token
  const thenResult = collectBranchBody(tokens, i, mutStack, inIife);
  i = thenResult.nextIdx;

  // Check for else clause: could be `else if (...)`, `else { ... }`, or `else expr`
  let elseLines = [];
  const elseInfo = collectElseClause(tokens, i, mutStack, inIife);

  if (elseInfo.consumed) {
    if (elseInfo.isChained) {
      // Recurse for chained else-if — handleIf populates elseLines directly
      i = handleIf(
        elseInfo.condRaw,
        tokens,
        mutStack,
        elseLines,
        isLast,
        i + 1,
        inIife,
      );
    } else {
      elseLines = elseInfo.elseLines;
      if (elseInfo.closeAfter !== undefined) {
        i = elseInfo.closeAfter + 1;
      } else {
        i++; // consumed one stmt token
      }
    }
  }

  buildIfOutput(condExpr, thenResult.bodyLines, elseLines, lines);
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
  const assignMatch = /^(\w+)\s*[+\-*/%]?=\s*(.+)$/.exec(stmt);
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
  // Replace range literals (e.g., `0..4`) with JS arrays [start, end]
  let result = expr.replace(/(\d+)\.\.(\d+)/g, function (_m, start, end) {
    return "[" + start + "," + end + "]";
  });
  // Replace __args__ with _tuff_args so property/index access works naturally
  result = result.replace(/__args__/g, "_tuff_args");
  return result;
}
