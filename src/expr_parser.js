// Expression parsing — recursive descent (comparison → add/sub → primary).
import state from "./parser_state";

export function parseExpr() {
  let left = parseComparison();
  while (state.pos < state.tokens.length && state.tokens[state.pos].type === "semi") {
    state.pos++; // skip ';'
  }
  return left;
}

function parseComparison() {
  let left = parseAddSub();
  while (state.pos < state.tokens.length && state.tokens[state.pos].type === "cmp") {
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

  // Object literal: { key : expr , key : expr }
  if (
    token.type === "brace_open" &&
    state.pos + 1 < state.tokens.length &&
    (state.tokens[state.pos + 1].type === "identifier" ||
      state.tokens[state.pos + 1].type === "brace_close")
  ) {
    return parseObjectLiteral();
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
    if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "paren_close")
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

  // Function call with args: read(arg1, arg2) or bare identifier; also module::name references
  if (token.type === "identifier") {
    const moduleName = state.tokens[state.pos++].value;

    // Check for module path: identifier :: identifier
    let isModuleRef = false;
    let name = moduleName;
    if (state.pos < state.tokens.length && state.tokens[state.pos].type === "module_sep") {
      state.pos++; // skip '::'
      if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "identifier") {
        throw new Error("Expected identifier after '::'");
      }
      name = `${moduleName}::${state.tokens[state.pos++].value}`;
      isModuleRef = true;
    }

    // Check for function call: identifier followed by '('
    if (state.pos < state.tokens.length && state.tokens[state.pos].type === "paren_open") {
      state.pos++; // skip '('

      // Parse optional comma-separated argument expressions
      const args = [];
      while (state.pos < state.tokens.length && state.tokens[state.pos].type !== "paren_close") {
        args.push(parseExpr());
        // Skip optional comma
        if (state.pos < state.tokens.length && state.tokens[state.pos].type === "comma") {
          state.pos++;
        }
      }

      if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "paren_close") {
        throw new Error("Expected ')'");
      }
      state.pos++; // skip ')'

      return parseIndexAccess({ type: "call", name, args });
    }

    return parseIndexAccess({
      type: isModuleRef ? "module_ref" : "varref",
      name,
    });
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
    while (state.pos < state.tokens.length && state.tokens[state.pos].type !== "bracket_close") {
      elements.push(parseExpr());
      // Skip optional comma or semicolon separators
      if (
        state.pos < state.tokens.length &&
        (state.tokens[state.pos].type === "comma" || state.tokens[state.pos].type === "semi")
      ) {
        state.pos++;
      }
    }
    if (state.pos >= state.tokens.length) throw new Error("Expected ']'");
    state.pos++; // skip ']'
    return { type: "array", elements };
  }

  throw new Error(`Unsupported token at ${state.pos}: ${JSON.stringify(token)}`);
}

export function parseIndexAccess(base) {
  while (state.pos < state.tokens.length && state.tokens[state.pos].type === "bracket_open") {
    state.pos++; // skip '['
    const from = parseExpr();

    // Check for range slice: [start..end]
    if (state.pos < state.tokens.length && state.tokens[state.pos].type === "range") {
      state.pos++; // skip '..'
      const to = parseExpr();
      if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "bracket_close")
        throw new Error("Expected ']'");
      state.pos++; // skip ']'
      base = { type: "slice", target: base, from, to };
    } else {
      // Regular index access
      if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "bracket_close")
        throw new Error("Expected ']'");
      state.pos++; // skip ']'
      base = { type: "index", target: base, index: from };
    }
  }

  // Chain property access via dot notation: .key
  while (state.pos < state.tokens.length && state.tokens[state.pos].type === "dot") {
    state.pos++;
    if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "identifier") {
      throw new Error("Expected property name after '.'");
    }
    const prop = state.tokens[state.pos++].value;
    base = { type: "prop", target: base, key: prop };
  }

  return base;
}

function parseObjectLiteral() {
  state.pos++; // skip '{'
  const fields = [];
  while (state.pos < state.tokens.length && state.tokens[state.pos].type !== "brace_close") {
    if (state.tokens[state.pos].type === "identifier") {
      const key = state.tokens[state.pos++].value;

      // Expect ':' separator
      if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "colon") {
        throw new Error("Expected ':' after object field name");
      }
      state.pos++; // skip ':'

      const value = parseExpr();
      fields.push({ key, value });

      // Skip optional comma separator
      if (state.pos < state.tokens.length && state.tokens[state.pos].type === "comma") {
        state.pos++;
      }
    } else {
      throw new Error("Expected field name in object literal");
    }
  }

  if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "brace_close") {
    throw new Error("Expected '}' to close object literal");
  }
  state.pos++; // skip '}'
  return { type: "object", fields };
}
