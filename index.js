export function execute(source) {
  if (!source || source.trim().length === 0) return 0;

  // Tokenize: numbers, strings ("...", with \" escapes), operators (+, -, *, /, ||, &&, <=, >=, ==, !=, +=, =>), delimiters ( ) { } [ ] , . identifiers/keywords, ; = ..
  const tokens = source.match(
    /\d+|"(?:[^\\"]*|(?:\\.))*"|[|]{2}|[&]{2}|<=|>=|==|!=|=>|\+=|\.\.|[+\-*/(){}<>=;,\[\].]|[a-zA-Z_]\w*/g,
  );
  if (!tokens) throw new Error("Invalid source: " + source);

  let pos = 0;
  // Scope stack for block scoping — inner blocks shadow outer declarations
  const scopeStack = [{}];

  function lookup(name) {
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      if (name in scopeStack[i]) return scopeStack[i][name];
    }
    throw new Error("Invalid source: " + source);
  }

  function assign(name, value) {
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      if (name in scopeStack[i]) {
        const entry = scopeStack[i][name];
        if (!entry.mutable)
          throw new Error("Cannot reassign immutable variable");
        entry.value = value;
        return;
      }
    }
    throw new Error("Invalid source: " + source);
  }

  function resolveProperty(value, prop) {
    if (typeof value === "string" && prop === "length") return value.length;
    throw new Error("Invalid source: " + source);
  }

  function applyChains(value, src) {
    while (
      pos < tokens.length &&
      (tokens[pos] === "[" || tokens[pos] === ".")
    ) {
      if (tokens[pos] === "[") {
        pos++; // consume '['
        const idx = parseOrExpr();
        if (pos >= tokens.length || tokens[pos] !== "]")
          throw new Error("Invalid source: " + src);
        pos++; // consume ']'
        value = value[idx];
      } else {
        pos++; // consume '.'
        const prop = tokens[pos];
        if (!prop || !/^[a-zA-Z_]\w*$/.test(prop))
          throw new Error("Invalid source: " + src);
        pos++; // consume property name
        value = resolveProperty(value, prop);
      }
    }
    return value;
  }

  function parseIfCondition() {
    // Shared: consume `if (` and evaluate condition, expect `)`
    if (tokens[pos] !== "(") throw new Error("Invalid source: " + source);
    pos++; // consume '('
    const condition = parseOrExpr();
    if (pos >= tokens.length || tokens[pos] !== ")")
      throw new Error("Invalid source: " + source);
    pos++; // consume ')'
    return condition;
  }

  function parseComparisonExpr() {
    // Parse comparison operators (<, >, <=, >=, ==, !=) between logical AND and arithmetic
    let result = parseExpr();
    let hasComparison = false;

    while (
      pos < tokens.length &&
      (tokens[pos] === "<" ||
        tokens[pos] === ">" ||
        tokens[pos] === "<=" ||
        tokens[pos] === ">=" ||
        tokens[pos] === "==" ||
        tokens[pos] === "!=")
    ) {
      const op = tokens[pos++];
      const right = parseExpr();
      if (op === "<") {
        result = result < right;
      } else if (op === ">") {
        result = result > right;
      } else if (op === "<=") {
        result = result <= right;
      } else if (op === ">=") {
        result = result >= right;
      } else if (op === "==") {
        result = result == right;
      } else {
        result = result != right;
      }
      hasComparison = true;
    }

    return hasComparison ? (result ? 1 : 0) : result;
  }

  function parseAndExpr() {
    // Parse logical AND (higher precedence than ||, lower than comparisons)
    let result = parseComparisonExpr();
    let hasAnd = false;

    while (pos < tokens.length && tokens[pos] === "&&") {
      pos++; // consume '&&'
      const right = parseComparisonExpr();
      result = result && right;
      hasAnd = true;
    }

    return hasAnd ? (result ? 1 : 0) : result;
  }

  function parseOrExpr() {
    // Parse logical OR (lowest precedence)
    let result = parseAndExpr();
    let hasOr = false;

    while (pos < tokens.length && tokens[pos] === "||") {
      pos++; // consume '||'
      const right = parseAndExpr();
      result = result || right;
      hasOr = true;
    }

    return hasOr ? (result ? 1 : 0) : result;
  }

  function parseExpr() {
    // Parse addition/subtraction
    let result = parseTerm();

    while (
      pos < tokens.length &&
      (tokens[pos] === "+" || tokens[pos] === "-")
    ) {
      const op = tokens[pos++];
      const right = parseTerm();
      if (op === "+") {
        result += right;
      } else {
        result -= right;
      }
    }

    return result;
  }

  function parseTerm() {
    // Parse multiplication/division (higher precedence)
    let result = parseFactor();

    while (
      pos < tokens.length &&
      (tokens[pos] === "*" || tokens[pos] === "/")
    ) {
      const op = tokens[pos++];
      const right = parseFactor();
      if (op === "*") {
        result *= right;
      } else {
        result /= right;
      }
    }

    return result;
  }

  function parseFactor() {
    // Parse numbers, grouped expressions: (...) or {...}, and variable references
    const token = tokens[pos];

    if (token === "(") {
      pos++; // consume '('
      const result = parseExpr();
      if (pos >= tokens.length || tokens[pos] !== ")")
        throw new Error("Invalid source: " + source);
      pos++; // consume ')'
      return applyChains(result, source);
    }

    if (token === "{") {
      pos++; // consume '{'
      scopeStack.push({}); // push new block scope
      let lastResult = 0;
      // Parse statements separated by ; until closing }
      while (pos < tokens.length && tokens[pos] !== "}") {
        const val = parseStatement();
        lastResult = val;
      }
      if (pos >= tokens.length || tokens[pos] !== "}")
        throw new Error("Invalid source: " + source);
      pos++; // consume '}'
      scopeStack.pop(); // pop block scope
      return applyChains(lastResult, source);
    }

    // Boolean literals
    if (token === "true") {
      pos++;
      return 1;
    }
    if (token === "false") {
      pos++;
      return 0;
    }

    // if/else expression: if (condition) thenExpr else elseExpr
    if (token === "if") {
      pos++; // consume 'if'
      const condition = parseIfCondition();
      const thenResult = parseFactor();
      if (tokens[pos] !== "else") throw new Error("Invalid source: " + source);
      pos++; // consume 'else'
      const elseResult = parseFactor();
      const condVal = condition ? 1 : 0;
      return condVal === 1 ? thenResult : elseResult;
    }

    // Array literal [expr, expr, ...]
    if (token === "[") {
      pos++; // consume '['
      const arr = [];
      while (pos < tokens.length && tokens[pos] !== "]") {
        arr.push(parseOrExpr());
        if (tokens[pos] === ",") pos++; // optionally consume ','
      }
      if (pos >= tokens.length || tokens[pos] !== "]")
        throw new Error("Invalid source: " + source);
      pos++; // consume ']'
      return applyChains(arr, source);
    }

    // String literal — check for trailing .prop or [idx] chains
    if (/^".*"$/.test(token)) {
      pos++;
      const value = token.slice(1, -1).replace(/\\"/g, '"'); // strip quotes + unescape \"
      return applyChains(value, source);
    }

    // Variable reference or function call: name(args) with optional index access array[expr] and dot property .prop
    if (/^[a-zA-Z_]\w*$/.test(token)) {
      pos++;
      const entry = lookup(token);
      let value;
      if (entry.type === "fn") {
        // Parse arguments: name(arg1, arg2)
        if (tokens[pos] !== "(") throw new Error("Invalid source: " + source);
        pos++; // consume '('
        const args = [];
        while (pos < tokens.length && tokens[pos] !== ")") {
          args.push(parseOrExpr());
          if (tokens[pos] === ",") pos++; // consume ','
        }
        if (tokens[pos] !== ")") throw new Error("Invalid source: " + source);
        pos++; // consume ')'
        value = evalBody(
          entry.bodyStart,
          entry.bodyEnd,
          entry.params || [],
          args,
        );
      } else {
        value = entry.value;
      }
      return applyChains(value, source);
    }

    if (/^\d+$/.test(token)) {
      pos++;
      return parseInt(token, 10);
    }

    // Should not reach here — all token types are handled above
  }

  // Evaluate a saved body token range [bodyStart, bodyEnd) in an isolated scope
  function evalBody(bodyStart, bodyEnd, params = [], args = []) {
    const savedPos = pos;
    const savedScopeStackLen = scopeStack.length;
    pos = bodyStart;
    // Create new scope with parameter bindings
    const paramScope = {};
    for (let i = 0; i < params.length; i++) {
      paramScope[params[i]] = { value: args[i] || 0, mutable: false };
    }
    scopeStack.push(paramScope);
    let lastResult = 0;
    while (pos < bodyEnd) {
      lastResult = parseOrExpr();
    }
    scopeStack.pop();
    if (scopeStack.length > savedScopeStackLen)
      scopeStack.length = savedScopeStackLen;
    pos = savedPos;
    return lastResult;
  }

  function parseStatement() {
    // Parse `fn name() => expr` function declarations
    if (tokens[pos] === "fn") {
      pos++; // consume 'fn'
      const name = tokens[pos];
      if (!name || !/^[a-zA-Z_]\w*$/.test(name))
        throw new Error("Invalid source: " + source);
      pos++; // consume function name
      if (tokens[pos] !== "(") throw new Error("Invalid source: " + source);
      pos++; // consume '('
      const params = [];
      while (pos < tokens.length && tokens[pos] !== ")") {
        const paramName = tokens[pos];
        if (!paramName || !/^[a-zA-Z_]\w*$/.test(paramName))
          throw new Error("Invalid source: " + source);
        params.push(paramName);
        pos++;
        if (tokens[pos] === ",") pos++; // consume ','
      }
      if (tokens[pos] !== ")") throw new Error("Invalid source: " + source);
      pos++; // consume ')'
      if (tokens[pos] !== "=>") throw new Error("Invalid source: " + source);
      pos++; // consume '=>'
      const bodyStart = pos;
      // Push dummy parameter values so parseOrExpr doesn't fail on unknown identifiers
      scopeStack.push(
        Object.fromEntries(
          params.map((p) => [p, { value: 0, mutable: false }]),
        ),
      );
      parseOrExpr();
      scopeStack.pop();
      const bodyEnd = pos;
      scopeStack[scopeStack.length - 1][name] = {
        type: "fn",
        bodyStart,
        bodyEnd,
        params,
      };
      if (pos < tokens.length && tokens[pos] === ";") {
        pos++; // consume ';'
      }
      return 0;
    }

    // Parse `let x = expr` or `let mut x = expr` declarations
    if (tokens[pos] === "let") {
      pos++; // consume 'let'
      const mutable = tokens[pos] === "mut";
      if (mutable) pos++; // optionally consume 'mut'
      const name = tokens[pos];
      if (!name || !/^[a-zA-Z_]\w*$/.test(name))
        throw new Error("Invalid source: " + source);
      pos++; // consume variable name
      if (tokens[pos] !== "=") throw new Error("Invalid source: " + source);
      pos++; // consume '='
      const value = parseOrExpr();
      scopeStack[scopeStack.length - 1][name] = { value, mutable };
      if (pos < tokens.length && tokens[pos] === ";") {
        pos++; // consume ';'
      }
      return value;
    }

    // Parse assignment `x = expr` or compound assignment `x += expr` for mutable variables
    if (/^[a-zA-Z_]\w*$/.test(tokens[pos]) && tokens[pos + 1] === "=") {
      const name = tokens[pos];
      pos++; // consume variable name
      pos++; // consume '='
      const value = parseOrExpr();
      assign(name, value);
      if (pos < tokens.length && tokens[pos] === ";") {
        pos++; // consume ';'
      }
      return value;
    }

    // Parse compound assignment `x += expr` for mutable variables
    if (/^[a-zA-Z_]\w*$/.test(tokens[pos]) && tokens[pos + 1] === "+=") {
      const name = tokens[pos];
      pos++; // consume variable name
      pos++; // consume '+='
      const value = parseOrExpr();
      assign(name, lookup(name).value + value);
      if (pos < tokens.length && tokens[pos] === ";") {
        pos++; // consume ';'
      }
      return value;
    }

    // Lookahead: only treat as indexed assignment/compound-assignment if there's '=' or '+=' after the closing ']'
    function isIndexedAssignment() {
      if (!/^[a-zA-Z_]\w*$/.test(tokens[pos]) || tokens[pos + 1] !== "[")
        return false;
      let scan = pos + 2; // skip identifier and '['
      while (scan < tokens.length && tokens[scan] !== "]") scan++;
      if (scan >= tokens.length) return false;
      const nextToken = tokens[scan + 1];
      return nextToken === "=" || nextToken === "+=";
    }

    if (isIndexedAssignment()) {
      const name = tokens[pos];
      pos++; // consume variable name
      pos++; // consume '['
      const idx = parseOrExpr();
      if (pos >= tokens.length || tokens[pos] !== "]")
        throw new Error("Invalid source: " + source);
      pos++; // consume ']'
      const op = tokens[pos];
      if (op !== "=" && op !== "+=")
        throw new Error("Invalid source: " + source);
      pos++; // consume '=' or '+='
      const value = parseOrExpr();
      const entry = lookup(name);
      if (!entry.mutable) throw new Error("Cannot reassign immutable variable");
      if (op === "=") {
        entry.value[idx] = value;
      } else {
        // += compound assignment on array element
        entry.value[idx] = entry.value[idx] + value;
      }
      if (pos < tokens.length && tokens[pos] === ";") {
        pos++; // consume ';'
      }
      return value;
    }

    // Parse `for (i in start..end) bodyStmt` range-based for-loop
    if (tokens[pos] === "for") {
      pos++; // consume 'for'
      if (tokens[pos] !== "(") throw new Error("Invalid source: " + source);
      pos++; // consume '('
      const loopVar = tokens[pos];
      if (!loopVar || !/^[a-zA-Z_]\w*$/.test(loopVar))
        throw new Error("Invalid source: " + source);
      pos++; // consume identifier
      if (tokens[pos] !== "in") throw new Error("Invalid source: " + source);
      pos++; // consume 'in'
      const start = parseOrExpr();
      if (tokens[pos] !== "..") throw new Error("Invalid source: " + source);
      pos++; // consume '..'
      const end = parseOrExpr();
      if (pos >= tokens.length || tokens[pos] !== ")")
        throw new Error("Invalid source: " + source);
      pos++; // consume ')'

      const bodyStartPos = pos; // position of the first body statement token
      scopeStack[scopeStack.length - 1][loopVar] = {
        value: start,
        mutable: true,
      };
      let lastResult;
      for (let v = start; v < end; v++) {
        pos = bodyStartPos; // re-parse same body statement with updated scope values
        assign(loopVar, v);
        scopeStack.push({});
        lastResult = parseStatement();
        scopeStack.pop();
      }

      return lastResult;
    }

    // Parse `while (condition) bodyStmt` loop — re-evaluate condition each iteration by saving/restoring token positions
    if (tokens[pos] === "while") {
      pos++; // consume 'while'
      const condStart = pos; // position of '('
      parseIfCondition(); // first evaluation to find end of condition tokens
      let lastResult;
      let bodyEndPos = pos; // track where the last successful iteration ended
      while (true) {
        pos = condStart; // re-parse condition with current scope values
        const condition = parseIfCondition();
        if ((condition ? 1 : 0) === 0) break;
        scopeStack.push({});
        lastResult = parseStatement();
        scopeStack.pop();
        bodyEndPos = pos; // remember position after successful iteration
      }
      pos = bodyEndPos; // restore to end of last executed body (or condEnd if no iterations ran)
      return lastResult;
    }

    // Parse `if (condition) thenStmt else elseStmt` statement
    if (tokens[pos] === "if") {
      pos++; // consume 'if'
      const condition = parseIfCondition();

      let lastResult;
      scopeStack.push({});
      lastResult = parseStatement();
      scopeStack.pop();

      const condVal = condition ? 1 : 0;

      function deepCloneScopes() {
        return scopeStack.map((s) => {
          const clone = {};
          for (const key in s) {
            clone[key] = { value: s[key].value, mutable: s[key].mutable };
          }
          return clone;
        });
      }

      if (condVal === 1 && pos < tokens.length && tokens[pos] === "else") {
        // Execute else branch but restore scope to discard side effects
        const savedScopes = deepCloneScopes();
        pos++; // consume 'else'
        scopeStack.push({});
        parseStatement();
        scopeStack.pop();
        Object.assign(scopeStack, savedScopes);
      } else if (
        condVal === 0 &&
        pos < tokens.length &&
        tokens[pos] === "else"
      ) {
        // Execute else branch when condition is false
        pos++; // consume 'else'
        scopeStack.push({});
        lastResult = parseStatement();
        scopeStack.pop();
      }

      return lastResult;
    }

    // Plain expression — only valid as the last statement without trailing ;
    const result = parseOrExpr();
    if (pos < tokens.length && tokens[pos] === ";")
      throw new Error("Invalid source: " + source);
    return result;
  }

  // Parse top-level statements, returning the last value
  let lastResult = 0;
  let iterations = 0;
  while (pos < tokens.length) {
    if (++iterations > 1024) throw new Error("Execution limit exceeded");
    lastResult = parseStatement();
  }
  return lastResult;
}
