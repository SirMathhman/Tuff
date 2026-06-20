// Expression parsing — recursive descent (comparison → add/sub → primary).
import state, { parseBraceIdentList, parseBraceBlock } from "./parser_state";

// Shared helper: try to parse '(' args ')' at current position.
// Returns the parsed args array if found, null otherwise.
function tryParseCallArgs() {
  if (
    state.pos < state.tokens.length &&
    state.tokens[state.pos].type === "paren_open"
  ) {
    state.pos++; // skip '('

    const args = [];
    while (
      state.pos < state.tokens.length &&
      state.tokens[state.pos].type !== "paren_close"
    ) {
      args.push(parseExpr());
      if (
        state.pos < state.tokens.length &&
        state.tokens[state.pos].type === "comma"
      ) {
        state.pos++;
      }
    }

    if (
      state.pos >= state.tokens.length ||
      state.tokens[state.pos].type !== "paren_close"
    ) {
      throw new Error("Expected ')'");
    }
    state.pos++; // skip ')'

    return args;
  }
  return null;
}

// Logical OR — lowest precedence, short-circuit via JS ||
function parseLogicalOr() {
  let left = parseLogicalAnd();
  while (
    state.pos < state.tokens.length &&
    state.tokens[state.pos].type === "logical_or"
  ) {
    state.pos++; // skip '||'
    const right = parseLogicalAnd();
    left = { type: "binop", op: "||", left, right };
  }
  return left;
}

// Logical AND — higher than OR, short-circuit via JS &&
function parseLogicalAnd() {
  let left = parseComparison();
  while (
    state.pos < state.tokens.length &&
    state.tokens[state.pos].type === "logical_and"
  ) {
    state.pos++; // skip '&&'
    const right = parseComparison();
    left = { type: "binop", op: "&&", left, right };
  }
  return left;
}

export function parseExpr() {
  let left = parseLogicalOr();
  while (
    state.pos < state.tokens.length &&
    state.tokens[state.pos].type === "semi"
  ) {
    state.pos++; // skip ';'
  }
  return left;
}

function parseComparison() {
  let left = parseAddSub();
  while (
    state.pos < state.tokens.length &&
    state.tokens[state.pos].type === "cmp"
  ) {
    const opVal = state.tokens[state.pos++].value;
    const right = parseAddSub();
    left = { type: "binop", op: opVal, left, right };
  }
  return left;
}

function parseAddSub() {
  let left = parsePrimary();
  while (
    state.pos < state.tokens.length &&
    state.tokens[state.pos].type === "op" &&
    "+-".includes(state.tokens[state.pos].value)
  ) {
    const opVal = state.tokens[state.pos++].value;
    const right = parsePrimary();
    left = { type: "binop", op: opVal, left, right };
  }
  return left;
}

export function parsePrimary() {
  if (state.pos >= state.tokens.length) throw new Error("Unexpected end");
  const token = state.tokens[state.pos];

  // Object literal: { key : expr , key : expr } or block expression: { stmts; lastExpr }
  if (token.type === "brace_open") {
    // Peek ahead to disambiguate object vs block without consuming the brace yet:
    // - identifier → object literal ({ key : value })
    // - keyword/other → block expression ({ let y = ...; expr })
    const nextToken = state.tokens[state.pos + 1];
    const isObjectLiteral = !nextToken || (nextToken.type === "identifier" || nextToken.type === "brace_close");

    if (isObjectLiteral) {
      return parseObjectLiteral();
    }

    // Block expression: { stmts; lastExpr } — evaluates to the value of the last statement
    const blockStmts = parseBraceBlock(() => {
      // Inline minimal statement parsing for block expressions:
      // let/var, or bare expression
      const stmtToken = state.tokens[state.pos];

      // let x = expr ; or let mut x = expr ;
      if (stmtToken.type === "keyword" && stmtToken.value === "let") {
        state.pos++; // skip 'let'
        const mutable =
          state.pos < state.tokens.length &&
          state.tokens[state.pos].type === "keyword" &&
          state.tokens[state.pos].value === "mut";
        if (mutable) state.pos++;

        if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "identifier") {
          throw new Error("Expected identifier after 'let'");
        }
        const name = state.tokens[state.pos++].value;

        if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "assign") {
          throw new Error("Expected '=' after variable name");
        }
        state.pos++; // skip '='
        return { type: "let", name, mutable, init: parseExpr() };
      }

      // Bare expression (also the last statement)
      return parseExpr();
    });

    return { type: "block_expr", stmts: blockStmts };
  }

  // '&' reference operator — optional 'mut' keyword for &mut syntax
  if (token.type === "ref") {
    state.pos++;
    // Consume optional 'mut' after '&' (&mut x)
    if (
      state.pos < state.tokens.length &&
      state.tokens[state.pos].type === "keyword" &&
      state.tokens[state.pos].value === "mut"
    ) {
      state.pos++;
    }
    const inner = parsePrimary();
    return { type: "ref", expr: inner };
  }

  // Parenthesized expression: ( expr )
  if (token.type === "paren_open") {
    state.pos++; // skip '('
    const inner = parseExpr();
    if (
      state.pos >= state.tokens.length ||
      state.tokens[state.pos].type !== "paren_close"
    )
      throw new Error("Expected ')'");
    state.pos++; // skip ')'
    return inner;
  }

  // '*' dereference operator — pass-through
  if (token.type === "op" && token.value === "*") {
    state.pos++;
    const inner = parsePrimary();
    return { type: "deref", expr: inner };
  }

  // '!' unary logical NOT operator
  if (token.type === "op" && token.value === "!") {
    state.pos++;
    const operand = parsePrimary();
    return { type: "unary", op: "!", operand };
  }

  // Boolean literal — true / false → number coercion in emitter
  if (token.type === "bool") {
    state.pos++;
    return { type: "boollit", value: token.value };
  }

  // 'this' keyword — scope variable access via this.x syntax
  if (token.type === "keyword" && token.value === "this") {
    state.pos++;
    const base = { type: "this" };
    return parseIndexAccess(base);
  }

  // Function call with args: read(arg1, arg2) or bare identifier; also module::name references
  if (token.type === "identifier") {
    const moduleName = state.tokens[state.pos++].value;

    // Check for module path: identifier :: identifier
    let isModuleRef = false;
    let name = moduleName;
    if (
      state.pos < state.tokens.length &&
      state.tokens[state.pos].type === "module_sep"
    ) {
      state.pos++; // skip '::'
      if (
        state.pos >= state.tokens.length ||
        state.tokens[state.pos].type !== "identifier"
      ) {
        throw new Error("Expected identifier after '::'");
      }
      name = `${moduleName}::${state.tokens[state.pos++].value}`;
      isModuleRef = true;
    }

    // Check for function call: identifier followed by '('
    const callArgs = tryParseCallArgs();
    if (callArgs !== null) {
      return parseIndexAccess({ type: "call", name, args: callArgs });
    }

    return parseIndexAccess({
      type: isModuleRef ? "module_ref" : "varref",
      name,
    });
  }

  // String literal — chain into index/property access for `"hello".length` etc.
  if (token.type === "string") {
    state.pos++;
    return parseIndexAccess({ type: "strlit", value: token.value });
  }

  // Numeric literal
  if (token.type === "number") {
    state.pos++;
    return { type: "numlit", value: token.value };
  }

  // Array literal: [ expr , expr ] or [ expr ; expr ]
  if (token.type === "bracket_open") {
    state.pos++; // skip '['
    const elements = [];
    while (
      state.pos < state.tokens.length &&
      state.tokens[state.pos].type !== "bracket_close"
    ) {
      elements.push(parseExpr());
      // Skip optional comma or semicolon separators
      if (
        state.pos < state.tokens.length &&
        (state.tokens[state.pos].type === "comma" ||
          state.tokens[state.pos].type === "semi")
      ) {
        state.pos++;
      }
    }
    if (state.pos >= state.tokens.length) throw new Error("Expected ']'");
    state.pos++; // skip ']'
    return { type: "array", elements };
  }

  throw new Error(
    `Unsupported token at ${state.pos}: ${JSON.stringify(token)}`,
  );
}

export function parseIndexAccess(base) {
  while (
    state.pos < state.tokens.length &&
    state.tokens[state.pos].type === "bracket_open"
  ) {
    state.pos++; // skip '['
    const from = parseExpr();

    // Check for range slice: [start..end]
    if (
      state.pos < state.tokens.length &&
      state.tokens[state.pos].type === "range"
    ) {
      state.pos++; // skip '..'
      const to = parseExpr();
      if (
        state.pos >= state.tokens.length ||
        state.tokens[state.pos].type !== "bracket_close"
      )
        throw new Error("Expected ']'");
      state.pos++; // skip ']'
      base = { type: "slice", target: base, from, to };
    } else {
      // Regular index access
      if (
        state.pos >= state.tokens.length ||
        state.tokens[state.pos].type !== "bracket_close"
      )
        throw new Error("Expected ']'");
      state.pos++; // skip ']'
      base = { type: "index", target: base, index: from };
    }
  }

  // Chain property access via dot notation: .key or method calls .method(args)
  while (
    state.pos < state.tokens.length &&
    state.tokens[state.pos].type === "dot"
  ) {
    state.pos++;
    if (
      state.pos >= state.tokens.length ||
      (state.tokens[state.pos].type !== "identifier" &&
        state.tokens[state.pos].type !== "keyword")
    ) {
      throw new Error("Expected property name after '.'");
    }
    const prop = state.tokens[state.pos++].value;

    // Check for method call: .method(args)
    const methodArgs = tryParseCallArgs();
    if (methodArgs !== null) {
      base = { type: "method", target: base, name: prop, args: methodArgs };
    } else {
      base = { type: "prop", target: base, key: prop };
    }
  }

  return base;
}

function parseObjectLiteral() {
  const fields = parseBraceIdentList((key) => {
    if (
      state.pos >= state.tokens.length ||
      state.tokens[state.pos].type !== "colon"
    ) {
      throw new Error("Expected ':' after object field name");
    }
    state.pos++; // skip ':'

    const value = parseExpr();
    return { key, value };
  });
  return { type: "object", fields };
}
