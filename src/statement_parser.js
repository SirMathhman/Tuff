// Statement parsing + validation (let, if/else, while, for, fn_def, out_*, extern_, assignments).
import state, {
  parseBraceIdentList,
  parseBraceBlock,
  parseYieldOrReturn,
} from "./parser_state";
import { parseExpr, parsePrimary, parseIndexAccess } from "./expr_parser";
import {
  parseIfStmt,
  parseWhileStmt,
  parseForStmt,
} from "./control_flow_parser";
import { parseTypeAnnotation, parseStructFields } from "./types_parser";

export function validateRefs(node, declaredVars, mutableVars) {
  if (!node || typeof node !== "object") return;
  // Function definition body references are validated against parent scope + params
  if (node.type === "fn_def") {
    const fnDeclared = new Set(declaredVars);
    const fnMutable = new Set(mutableVars);
    for (const p of node.params || []) {
      // Strip type annotation from param name (e.g., "param:I32" → "param")
      const paramName = typeof p === "string" ? p.split(":")[0] : p;
      fnDeclared.add(paramName);
      fnMutable.add(paramName);
    }
    if (node.blockStmts) {
      for (const s of node.blockStmts) validateRefs(s, fnDeclared, fnMutable);
    } else {
      validateRefs(node.body, fnDeclared, fnMutable);
    }
    return;
  }
  if (node.type === "varref" && !declaredVars.has(node.name)) {
    throw new Error(`Undefined variable: ${node.name}`);
  } // Assignment statement: target must be a declared mutable var
  if (node.type === "assign_stmt") {
    if (!mutableVars.has(node.name)) {
      throw new Error(
        `Cannot reassign immutable or undeclared variable: ${node.name}`,
      );
    }
    validateRefs(node.value, declaredVars, mutableVars);
  }
  // Compound assignment statement (x += expr): target must be a declared mutable var
  if (node.type === "compound_assign_stmt") {
    if (node.name) {
      if (!mutableVars.has(node.name)) {
        throw new Error(
          `Cannot reassign immutable or undeclared variable: ${node.name}`,
        );
      }
    } else if (node.target) {
      validateRefs(node.target, declaredVars, mutableVars);
    }
    validateRefs(node.value, declaredVars, mutableVars);
  }
  // Deref assignment statement (*expr = value)
  if (node.type === "deref_assign_stmt") {
    validateRefs(node.target, declaredVars, mutableVars);
    validateRefs(node.value, declaredVars, mutableVars);
  }
  // Index assignment statement (array[idx] = expr)
  if (node.type === "index_assign_stmt") {
    validateRefs(node.target, declaredVars, mutableVars);
    validateRefs(node.value, declaredVars, mutableVars);
  }
  // Array literal: validate each element
  if (node.type === "array") {
    for (const elem of node.elements) {
      validateRefs(elem, declaredVars, mutableVars);
    }
  }
  // Index access: validate target and index expressions
  if (node.type === "index") {
    validateRefs(node.target, declaredVars, mutableVars);
    validateRefs(node.index, declaredVars, mutableVars);
  }
  if (node.left) validateRefs(node.left, declaredVars, mutableVars);
  if (node.right) validateRefs(node.right, declaredVars, mutableVars);
  if (node.init) validateRefs(node.init, declaredVars, mutableVars);
}

// Shared helper: consume optional 'mut' keyword, returns true if present
function consumeMut() {
  const mutable =
    state.pos < state.tokens.length &&
    state.tokens[state.pos].type === "keyword" &&
    state.tokens[state.pos].value === "mut";
  if (mutable) state.pos++;
  return mutable;
}

// Shared helper: parse statements inside braces, advancing past '{' and '}'
function _parseBlockStmts() {
  return parseBraceBlock(() => parseStatement());
}

// Helper: scan ahead from a '{' to find the matching '}', then check if an operator follows.
function _hasOperatorAfterBrace(startPos) {
  let depth = 0;
  for (let i = startPos; i < state.tokens.length; i++) {
    const t = state.tokens[i];
    if (t.type === "brace_open") depth++;
    else if (t.type === "brace_close") {
      depth--;
      if (depth === 0) {
        // Check what follows the closing brace
        const next = i + 1;
        if (next < state.tokens.length) {
          const n = state.tokens[next];
          return (
            n.type === "op" ||
            n.type === "assign_add" ||
            n.type === "range" ||
            n.type === "keyword" ||
            n.type === "paren_open" ||
            n.type === "bracket_open" ||
            n.type === "dot"
          );
        }
      }
    } else if (t.type === "paren_open") {
      depth++; // treat parens as nested for brace counting safety
    } else if (t.type === "paren_close") {
      depth--;
    }
  }
  return false;
}

// Shared helper: parse comma-separated params inside parens, with optional type annotations.
function parseParams() {
  const params = [];
  while (
    state.pos < state.tokens.length &&
    state.tokens[state.pos].type !== "paren_close"
  ) {
    if (state.tokens[state.pos].type === "identifier") {
      const name = state.tokens[state.pos++].value;
      // Optional type annotation on parameter: ':' followed by a type identifier
      const paramType = parseTypeAnnotation();
      params.push(paramType ? `${name}:${paramType}` : name);
    } else {
      throw new Error("Expected parameter name in function definition");
    }
    // Skip optional comma
    if (
      state.pos < state.tokens.length &&
      state.tokens[state.pos].type === "comma"
    )
      state.pos++;
  }
  return params;
}

export function parseStatement() {
  while (
    state.pos < state.tokens.length &&
    state.tokens[state.pos].type === "semi"
  )
    state.pos++; // skip trailing ';' from previous statement
  if (state.pos >= state.tokens.length) throw new Error("Unexpected end");
  const token = state.tokens[state.pos];

  // yield/return expr — early-return from block expression or enclosing function
  const yieldOrReturn = parseYieldOrReturn(parseExpr);
  if (yieldOrReturn) {
    return yieldOrReturn;
  }

  // fn name(params) => expr ; (function definition)
  if (token.type === "keyword" && token.value === "fn") {
    state.pos++; // skip 'fn'

    // Function name is an identifier
    if (
      state.pos >= state.tokens.length ||
      state.tokens[state.pos].type !== "identifier"
    ) {
      throw new Error("Expected function name after 'fn'");
    }
    const name = state.tokens[state.pos++].value;

    // Expect '(' for params list
    if (
      state.pos >= state.tokens.length ||
      state.tokens[state.pos].type !== "paren_open"
    ) {
      throw new Error("Expected '(' after function name");
    }
    state.pos++; // skip '('

    const params = parseParams();

    if (
      state.pos >= state.tokens.length ||
      state.tokens[state.pos].type !== "paren_close"
    ) {
      throw new Error("Expected ')' after function params");
    }
    state.pos++; // skip ')'

    // Optional return type annotation: ':' followed by a type identifier
    const returnType = parseTypeAnnotation();

    // Expect fat arrow '=>'
    if (
      state.pos >= state.tokens.length ||
      state.tokens[state.pos].type !== "fat_arrow"
    ) {
      throw new Error("Expected '=>' after function name");
    }
    state.pos++; // skip '=>'

    // Check for block body: fn name(params) => { stmts; }
    // But only if the closing brace isn't followed by an operator (which would make it a block expression)
    if (state.tokens[state.pos]?.type === "brace_open") {
      const hasOperatorAfterBrace = _hasOperatorAfterBrace(state.pos);
      if (!hasOperatorAfterBrace) {
        const blockStmts = _parseBlockStmts();
        return {
          type: "fn_def",
          name,
          params,
          body: null,
          blockStmts,
          ...(returnType ? { returnType } : {}),
        };
      }
    }

    // Single-statement/expression body (supports compound assignment, block expressions, etc.)
    const body = parseStatement();
    return {
      type: "fn_def",
      name,
      params,
      body,
      ...(returnType ? { returnType } : {}),
    };
  }

  // for (i in start..end) stmt;
  if (token.type === "keyword" && token.value === "for") {
    return parseForStmt(parseStatement);
  }

  // while (cond) stmt;
  if (token.type === "keyword" && token.value === "while") {
    return parseWhileStmt(parseStatement);
  }

  // break statement
  if (token.type === "keyword" && token.value === "break") {
    state.pos++; // skip 'break'
    return { type: "break_stmt" };
  }

  // continue statement
  if (token.type === "keyword" && token.value === "continue") {
    state.pos++; // skip 'continue'
    return { type: "continue_stmt" };
  }

  // if (expr) stmt; else stmt;
  if (token.type === "keyword" && token.value === "if") {
    return parseIfStmt(parseStatement);
  }

  // extern let { x, y } = moduleName ; — import from raw JS module
  if (token.type === "keyword" && token.value === "extern") {
    state.pos++; // skip 'extern'

    if (
      state.pos >= state.tokens.length ||
      state.tokens[state.pos].type !== "keyword" ||
      state.tokens[state.pos].value !== "let"
    )
      throw new Error("Expected 'let' after 'extern'");
    state.pos++; // skip 'let'

    // Expect destructuring pattern: { x, y }
    if (
      state.pos >= state.tokens.length ||
      state.tokens[state.pos].type !== "brace_open"
    ) {
      throw new Error("Expected '{' in extern import pattern");
    }
    const fields = parseDestructuringPattern();

    if (
      state.pos >= state.tokens.length ||
      state.tokens[state.pos].type !== "assign"
    )
      throw new Error("Expected '=' after extern import pattern");
    state.pos++; // skip '='

    if (
      state.pos >= state.tokens.length ||
      state.tokens[state.pos].type !== "identifier"
    ) {
      throw new Error("Expected module name in extern import");
    }
    const moduleName = state.tokens[state.pos++].value;

    return { type: "extern_let", fields, moduleName };
  }

  // out let x = expr ; or out fn name(params) => expr ; (export declarations)
  if (token.type === "keyword" && token.value === "out") {
    state.pos++; // skip 'out'

    if (state.pos >= state.tokens.length)
      throw new Error("Expected 'let' or 'fn' after 'out'");

    // out fn name(params) => expr ;
    if (
      state.tokens[state.pos].type === "keyword" &&
      state.tokens[state.pos].value === "fn"
    ) {
      state.pos++; // skip 'fn'
      if (
        state.pos >= state.tokens.length ||
        state.tokens[state.pos].type !== "identifier"
      ) {
        throw new Error("Expected function name after 'out fn'");
      }
      const name = state.tokens[state.pos++].value;

      if (
        state.pos >= state.tokens.length ||
        state.tokens[state.pos].type !== "paren_open"
      ) {
        throw new Error("Expected '(' after exported function name");
      }
      state.pos++; // skip '('

      const params = parseParams();

      if (
        state.pos >= state.tokens.length ||
        state.tokens[state.pos].type !== "paren_close"
      ) {
        throw new Error("Expected ')' after exported function params");
      }
      state.pos++; // skip ')'

      if (
        state.pos >= state.tokens.length ||
        state.tokens[state.pos].type !== "fat_arrow"
      ) {
        throw new Error("Expected '=>' in exported function definition");
      }
      state.pos++; // skip '=>'

      const body = parseExpr();
      return { type: "out_fn", name, params, body };
    }

    // out let x = expr ; or out mut x = expr ;
    if (
      state.tokens[state.pos].type === "keyword" &&
      state.tokens[state.pos].value === "let"
    ) {
      state.pos++; // skip 'let'

      const mutable = consumeMut();

      if (
        state.pos >= state.tokens.length ||
        state.tokens[state.pos].type !== "identifier"
      ) {
        throw new Error("Expected identifier after 'out let'");
      }
      const name = state.tokens[state.pos++].value;

      if (
        state.pos >= state.tokens.length ||
        state.tokens[state.pos].type !== "assign"
      ) {
        throw new Error("Expected '=' after exported variable name");
      }
      state.pos++; // skip '='

      const exprAst = parseExpr();
      return { type: "out_let", name, mutable, init: exprAst };
    }

    throw new Error("Expected 'let' or 'fn' after 'out'");
  }

  // struct StructName { field : Type, ... } (struct definition)
  if (token.type === "keyword" && token.value === "struct") {
    state.pos++; // skip 'struct'

    if (
      state.pos >= state.tokens.length ||
      state.tokens[state.pos].type !== "identifier"
    )
      throw new Error("Expected struct name after 'struct'");
    const structName = state.tokens[state.pos++].value;

    // Expect '{' for field definitions
    if (
      state.pos >= state.tokens.length ||
      state.tokens[state.pos].type !== "brace_open"
    ) {
      throw new Error("Expected '{' after struct name");
    }
    state.pos++; // skip '{'

    const fields = parseStructFields();
    return { type: "struct_def", name: structName, fields };
  }

  // type AliasName = BaseType ; (type alias declaration)
  if (token.type === "keyword" && token.value === "type") {
    state.pos++; // skip 'type'

    if (
      state.pos >= state.tokens.length ||
      state.tokens[state.pos].type !== "identifier"
    )
      throw new Error("Expected alias name after 'type'");
    const aliasName = state.tokens[state.pos++].value;

    if (
      state.pos >= state.tokens.length ||
      state.tokens[state.pos].type !== "assign"
    )
      throw new Error("Expected '=' after type alias name");
    state.pos++; // skip '='

    // Parse base type directly (no leading ':' unlike variable annotations)
    // Can be a simple identifier (e.g., I32) or a struct literal ({ field : Type, ... })
    if (state.tokens[state.pos]?.type === "brace_open") {
      // Struct type alias: type Wrapper = { x : I32 }
      state.pos++; // skip '{'
      const fields = parseStructFields();
      return { type: "type_alias", name: aliasName, structFields: fields };
    }

    if (
      !state.tokens[state.pos] ||
      state.tokens[state.pos].type !== "identifier"
    )
      throw new Error("Expected type name after '=' in type alias");
    const baseType = state.tokens[state.pos++].value.toUpperCase();

    return { type: "type_alias", name: aliasName, baseType };
  }

  // let x = expr ; or let mut x = expr ;
  if (token.type === "keyword" && token.value === "let") {
    state.pos++; // skip 'let'

    const mutable = consumeMut();

    // Check for object destructuring pattern: let { x, y } = expr
    if (
      state.pos < state.tokens.length &&
      state.tokens[state.pos].type === "brace_open"
    ) {
      const fields = parseDestructuringPattern();

      if (
        state.pos >= state.tokens.length ||
        state.tokens[state.pos].type !== "assign"
      )
        throw new Error("Expected '=' after destructuring pattern");
      state.pos++; // skip '='

      const exprAst = parseExpr();
      return { type: "let", mutable, init: exprAst, fields };
    }

    if (
      state.pos >= state.tokens.length ||
      state.tokens[state.pos].type !== "identifier"
    )
      throw new Error("Expected identifier after 'let'");
    const name = state.tokens[state.pos++].value;

    // Optional type annotation: ':' followed by a type identifier
    const typeName = parseTypeAnnotation();

    if (
      state.pos >= state.tokens.length ||
      state.tokens[state.pos].type !== "assign"
    )
      throw new Error("Expected '=' after variable name");
    state.pos++; // skip '='

    const exprAst = parseExpr();
    return {
      type: "let",
      name,
      mutable,
      init: exprAst,
      ...(typeName ? { typeName } : {}),
    };
  }

  // Helper: parse identifier or 'this' followed by index/property chain; check for assignment operators.
  function _parseTargetAccess(nextTokenType) {
    if (
      state.pos + 1 >= state.tokens.length ||
      state.tokens[state.pos + 1].type !== nextTokenType
    ) {
      return null;
    }
    // Handle 'this' keyword as base target
    let target;
    if (token.type === "keyword" && token.value === "this") {
      state.pos++;
      target = parseIndexAccess({ type: "this" });
    } else if (token.type === "identifier") {
      const name = state.tokens[state.pos++].value;
      target = parseIndexAccess({ type: "varref", name });
    } else {
      return null;
    }

    // Compound assignment: +=, -=, *=, /=
    if (
      state.pos < state.tokens.length &&
      state.tokens[state.pos].type === "compound_assign"
    ) {
      const op = state.tokens[state.pos++].value;
      const exprAst = parseExpr();
      return { type: "compound_assign_stmt", target, op, value: exprAst };
    }

    // Regular assignment: =
    if (
      state.pos < state.tokens.length &&
      state.tokens[state.pos].type === "assign"
    ) {
      state.pos++; // skip '='
      const exprAst = parseExpr();
      return {
        type:
          nextTokenType === "bracket_open"
            ? "index_assign_stmt"
            : "prop_assign_stmt",
        target,
        value: exprAst,
      };
    }

    // Bare access expression (e.g., array[0] or temp.x)
    return target;
  }

  // array[idx] +=/= expr ; or bare array access expression
  const bracketResult = _parseTargetAccess("bracket_open");
  if (bracketResult) {
    return bracketResult;
  }

  // temp.x = expr ; or bare property access expression
  const dotResult = _parseTargetAccess("dot");
  if (dotResult) {
    return dotResult;
  }

  // x += expr ; (compound assignment statement)
  if (
    token.type === "identifier" &&
    state.pos + 1 < state.tokens.length &&
    state.tokens[state.pos + 1].type === "compound_assign"
  ) {
    const name = state.tokens[state.pos++].value;
    const op = state.tokens[state.pos++].value; // skip '+=', '-=', '*=', '/='
    const exprAst = parseExpr();
    return { type: "compound_assign_stmt", name, op, value: exprAst };
  }

  // x = expr ; (assignment statement)
  if (
    token.type === "identifier" &&
    state.pos + 1 < state.tokens.length &&
    state.tokens[state.pos + 1].type === "assign"
  ) {
    const name = state.tokens[state.pos++].value;
    state.pos++; // skip '='
    const exprAst = parseExpr();
    return { type: "assign_stmt", name, value: exprAst };
  }

  // *expr = value ; (deref assignment statement) or bare *expr expression
  if (token.type === "op" && token.value === "*") {
    state.pos++; // skip '*'
    const target = parsePrimary();
    if (
      state.pos < state.tokens.length &&
      state.tokens[state.pos].type === "assign"
    ) {
      state.pos++; // skip '='
      const exprAst = parseExpr();
      return { type: "deref_assign_stmt", target, value: exprAst };
    }
    // Bare deref expression (e.g., *y)
    return { type: "deref", expr: target };
  }

  // { expr; ... } — if followed by an operator, let parseExpr handle it as a block_expr
  // otherwise treat as a plain block statement
  if (token.type === "brace_open" && !_hasOperatorAfterBrace(state.pos)) {
    const blockStmts = _parseBlockStmts();
    return { type: "block", stmts: blockStmts };
  }

  // Bare expression (also the last statement)
  return parseExpr();
}

export function parseDestructuringPattern() {
  return parseBraceIdentList((v) => v);
}
