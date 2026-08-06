import type { Ast, AstType, Token } from "./types";
import { parseType as parseTypeModule } from "./typeparser";

// Parser — returns AST, does not evaluate
export function parse(tokens: Token[]): Ast {
  let pos = 0;
  function expectToken(value: string): void {
    const tok = tokens[pos];
    if (!tok || tok.value !== value)
      throw new Error(`expected "${value}", got "${tok?.value ?? "EOF"}"`);
    pos++;
  }
  // Delegate to the type parser module, keeping the shared position in sync
  function parseType(): AstType {
    const state = { pos };
    const result = parseTypeModule(tokens, state);
    pos = state.pos;
    return result;
  }
  function parseExpression(): Ast {
    let result = parseOr();
    while (tokens[pos]?.value === "+" || tokens[pos]?.value === "-") {
      const op = tokens[pos]!.value;
      pos++;
      const next = parseOr();
      result = { kind: "binop", op, left: result, right: next };
    }
    return result;
  }
  function parseOr(): Ast {
    let result = parseAnd();
    while (tokens[pos]?.value === "||") {
      pos++;
      const next = parseAnd();
      result = { kind: "binop", op: "||", left: result, right: next };
    }
    return result;
  }
  function parseAnd(): Ast {
    let result = parseComparison();
    while (tokens[pos]?.value === "&&") {
      pos++;
      const next = parseComparison();
      result = { kind: "binop", op: "&&", left: result, right: next };
    }
    return result;
  }
  function parseComparison(): Ast {
    let result = parseTerm();
    while (true) {
      const op = tokens[pos]?.value;
      if (
        op === "==" ||
        op === "!=" ||
        op === "<" ||
        op === "<=" ||
        op === ">" ||
        op === ">="
      ) {
        pos++;
        const next = parseTerm();
        result = { kind: "binop", op, left: result, right: next };
      } else if (op === "is") {
        pos++;
        const astType = parseType();
        result = { kind: "typecheck", value: result, type: astType };
      } else {
        break;
      }
    }
    return result;
  }
  function parseTerm(): Ast {
    let result = parseFactor();
    while (tokens[pos]?.value === "*" || tokens[pos]?.value === "/" || tokens[pos]?.value === "%") {
      const op = tokens[pos]!.value;
      pos++;
      const next = parseFactor();
      result = { kind: "binop", op, left: result, right: next };
    }
    return result;
  }
  function parseFactor(): Ast {
    const tok = tokens[pos];
    if (tok?.value === "!") {
      pos++;
      return { kind: "unary", op: "!", operand: parseFactor() };
    }
    if (tok?.value === "-") {
      pos++;
      return { kind: "unary", op: "-", operand: parseFactor() };
    }
    if (tok?.value === "&") {
      pos++;
      if (tokens[pos]?.value === "mut") {
        pos++;
        return { kind: "unary", op: "&mut", operand: parseFactor() };
      }
      return { kind: "unary", op: "&", operand: parseFactor() };
    }
    if (tok?.value === "*") {
      pos++;
      return { kind: "unary", op: "*", operand: parseFactor() };
    }
    return parsePrimary();
  }
  function parsePrimary(): Ast {
    let result = parseAtom();
    // Postfix loop — handle chained indexing, field access, calls, etc.
    while (true) {
      if (tokens[pos]?.value === "[") {
        pos++; // skip "["
        const index = parseExpression();
        pos++; // skip "]"
        if (result.kind === "string") {
          result = { kind: "string_index", target: result, index };
        } else {
          result = { kind: "array_index", target: result, index };
        }
      } else if (tokens[pos]?.value === "::") {
        // Namespace path: lib::foo — build a structural namespace node
        pos++; // skip "::"
        const nextTok = tokens[pos];
        if (nextTok?.type !== "identifier") throw new Error("expected identifier after ::");
        const segment = nextTok.value;
        pos++;
        if (result.kind === "ident") {
          result = { kind: "namespace", segments: [result.name, segment] };
        } else if (result.kind === "namespace") {
          result = { kind: "namespace", segments: [...result.segments, segment] };
        } else {
          result = { kind: "property_access", target: result, property: segment };
        }
      } else if (tokens[pos]?.value === ".") {
        pos++; // skip "."
        const nextTok = tokens[pos];
        if (nextTok?.type === "number") {
          pos++;
          result = {
            kind: "index",
            target: result,
            index: parseInt(nextTok.value),
          };
        } else if (nextTok?.value === "length") {
          pos++;
          result = { kind: "length", target: result };
        } else {
          const property = nextTok!.value;
          pos++;
          result = { kind: "property_access", target: result, property };
        }
      } else if (tokens[pos]?.value === "(") {
        pos++; // skip "("
        const args: Ast[] = [];
        while (tokens[pos]?.value !== ")") {
          args.push(parseExpression());
          if (tokens[pos]?.value === ",") pos++;
        }
        pos++; // skip ")"
        result = { kind: "call", name: "", target: result, args };
      } else {
        break;
      }
    }
    return result;
  }
  function parseAtom(): Ast {
    const tok = tokens[pos];
    if (tok?.value === "(") {
      pos++;
      // Check if this is a tuple (contains commas) or a parenthesized expression
      // Look ahead to see if there's a comma before the closing paren
      let depth = 1;
      let j = pos;
      let hasComma = false;
      while (depth > 0 && tokens[j]) {
        if (tokens[j]!.value === "(") depth++;
        else if (tokens[j]!.value === ")") depth--;
        else if (tokens[j]!.value === "," && depth === 1) hasComma = true;
        j++;
      }
      if (hasComma) {
        // Parse as tuple
        const elements: Ast[] = [];
        while (tokens[pos]?.value !== ")") {
          elements.push(parseExpression());
          if (tokens[pos]?.value === ",") pos++;
        }
        pos++; // skip ")"
        return { kind: "tuple", elements };
      }
      const result = parseExpression();
      pos++; // skip ")"
      return { kind: "paren", expr: result };
    }
    if (tok?.value === "{") {
      // Check if this is a record literal: { key : value, ... }
      // Look ahead to see if the next token is an identifier followed by ":"
      if (
        tokens[pos + 1]?.type === "identifier" &&
        tokens[pos + 2]?.value === ":"
      ) {
        pos++; // skip "{"
        const fields: { key: string; value: Ast }[] = [];
        while (tokens[pos]?.value !== "}") {
          const key = tokens[pos]!.value;
          pos++; // skip key
          pos++; // skip ":"
          const value = parseExpression();
          fields.push({ key, value });
          if (tokens[pos]?.value === ",") pos++;
        }
        pos++; // skip "}"
        return { kind: "record", fields };
      }
      return parseBlock();
    }
    if (tok?.value === "[") {
      pos++; // skip "["
      const elements: Ast[] = [];
      while (tokens[pos]?.value !== "]") {
        elements.push(parseExpression());
        if (tokens[pos]?.value === ",") pos++;
      }
      pos++; // skip "]"
      return { kind: "array", elements };
    }
    if (tok?.value === "if") {
      pos++; // skip "if"
      expectToken("(");
      const cond = parseExpression();
      expectToken(")");
      const thenBranch = parseExpression();
      expectToken("else");
      const elseBranch = parseExpression();
      return { kind: "if_expr", cond, thenBranch, elseBranch };
    }
    if (tok?.value === "match") {
      pos++; // skip "match"
      expectToken("(");
      const expr = parseExpression();
      expectToken(")");
      expectToken("{");
      const cases: { pattern: Ast; body: Ast }[] = [];
      while (tokens[pos]?.value !== "}") {
        expectToken("case");
        const pattern =
          tokens[pos]?.value === "_"
            ? (pos++, { kind: "wildcard" } as Ast)
            : parseExpression();
        expectToken("=>");
        const body = parseExpression();
        cases.push({ pattern, body });
        if (tokens[pos]?.value === ";") pos++;
      }
      pos++; // skip "}"
      return { kind: "match", expr, cases };
    }
    if (tok?.value === "true") {
      pos++;
      return { kind: "bool", value: true };
    }
    if (tok?.value === "false") {
      pos++;
      return { kind: "bool", value: false };
    }
    if (tok?.value === "null") {
      pos++;
      return { kind: "null" };
    }
    if (tok?.type === "char") {
      pos++;
      return { kind: "char", value: tok.value };
    }
    if (tok?.type === "string") {
      pos++;
      return { kind: "string", value: tok.value };
    }
    if (tok?.type === "identifier") {
      const name = tok.value;
      pos++;
      return { kind: "ident", name };
    }
    const result = parseFloat(tok!.value);
    pos++;
    return { kind: "num", value: result, suffix: tok?.suffix };
  }
  function parseStatement(): Ast | null {
    // Check for type alias: type Alias = BaseType
    if (tokens[pos]?.value === "type") {
      pos++; // skip "type"
      const name = tokens[pos]!.value;
      pos++; // skip alias name
      pos++; // skip "="
      const baseType = tokens[pos]!.value;
      pos++; // skip base type
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "typealias", name, baseType };
    }
    if (tokens[pos]?.value === "out" && tokens[pos + 1]?.value === "let") {
      pos++; // skip "out"
      const exported = true;
      pos++; // skip "let"
      const mutable = tokens[pos]?.value === "mut";
      if (mutable) pos++;
      const name = tokens[pos]!.value;
      pos++;
      // Check for type annotation: let x : Type = value
      let typeAnnotation: AstType | undefined;
      if (tokens[pos]?.value === ":") {
        pos++; // skip ":"
        typeAnnotation = parseType();
      }
      pos++; // skip "="
      const value = parseExpression();
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "let", mutable, name, value, typeAnnotation, exported };
    }
    if (tokens[pos]?.value === "let") {
      pos++;
      const mutable = tokens[pos]?.value === "mut";
      if (mutable) pos++;
      const name = tokens[pos]!.value;
      pos++;
      // Check for type annotation: let x : Type = value
      let typeAnnotation: AstType | undefined;
      if (tokens[pos]?.value === ":") {
        pos++; // skip ":"
        typeAnnotation = parseType();
      }
      pos++; // skip "="
      const value = parseExpression();
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "let", mutable, name, value, typeAnnotation };
    }
    // Check for augmented assignment: identifier += expression or identifier -= expression
    if (tokens[pos]?.type === "identifier" && (tokens[pos + 1]?.value === "+=" || tokens[pos + 1]?.value === "-=")) {
      const name = tokens[pos]!.value;
      const op = tokens[pos + 1]!.value === "+=" ? "+" : "-";
      pos++; // skip identifier
      pos++; // skip "+=" or "-="
      const value = parseExpression();
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "augassign", name, op, value };
    }
    // Check for dereference assignment: *identifier = expression
    if (
      tokens[pos]?.value === "*" &&
      tokens[pos + 1]?.type === "identifier" &&
      tokens[pos + 2]?.value === "="
    ) {
      const name = tokens[pos + 1]!.value;
      pos++; // skip "*"
      pos++; // skip identifier
      pos++; // skip "="
      const value = parseExpression();
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "refassign", name, value };
    }
    // Check for array indexed assignment: identifier[expr] = expression
    if (tokens[pos]?.type === "identifier" && tokens[pos + 1]?.value === "[") {
      // Look ahead to see if there's an = after the ]
      let depth = 0;
      let j = pos + 2;
      let foundEquals = false;
      while (tokens[j]) {
        if (tokens[j]!.value === "[") depth++;
        else if (tokens[j]!.value === "]") {
          if (depth === 0) {
            if (tokens[j + 1]?.value === "=") foundEquals = true;
            break;
          }
          depth--;
        }
        j++;
      }
      if (foundEquals) {
        const name = tokens[pos]!.value;
        pos++; // skip identifier
        pos++; // skip "["
        const index = parseExpression();
        if (tokens[pos]?.value === "]") pos++; // skip "]"
        if (tokens[pos]?.value === "=") pos++; // skip "="
        const value = parseExpression();
        if (tokens[pos]?.value === ";") pos++;
        return {
          kind: "array_assign",
          target: { kind: "ident", name },
          index,
          value,
        };
      }
    }
    // Check for assignment: identifier = expression
    if (tokens[pos]?.type === "identifier" && tokens[pos + 1]?.value === "=") {
      const name = tokens[pos]!.value;
      pos++; // skip identifier
      pos++; // skip "="
      const value = parseExpression();
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "assign", name, value };
    }
    // Check for continue statement
    if (tokens[pos]?.value === "continue") {
      pos++;
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "continue" };
    }
    // Check for break statement
    if (tokens[pos]?.value === "break") {
      pos++;
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "break" };
    }
    // Check for return statement
    if (tokens[pos]?.value === "return") {
      pos++;
      const value = parseExpression();
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "return", value };
    }
    // Check for yield statement
    if (tokens[pos]?.value === "yield") {
      pos++;
      const value = parseExpression();
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "yield", value };
    }
    // Check for out fn statement (exported function)
    if (tokens[pos]?.value === "out" && tokens[pos + 1]?.value === "fn") {
      pos++; // skip "out"
      const exported = true;
      pos++; // skip "fn"
      const name = tokens[pos]!.value;
      pos++; // skip name
      pos++; // skip "("
      const params: { name: string; type: AstType }[] = [];
      while (tokens[pos]?.value !== ")") {
        const paramName = tokens[pos]!.value;
        pos++; // skip param name
        if (tokens[pos]?.value !== ":") {
          throw new Error(`parameter "${paramName}" requires a type annotation`);
        }
        pos++; // skip ":"
        const paramType = parseType();
        params.push({ name: paramName, type: paramType });
        if (tokens[pos]?.value === ",") pos++;
      }
      pos++; // skip ")"
      pos++; // skip "=>"
      const body = parseExpression();
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "fn", name, params, body, exported };
    }
    // Check for fn statement
    if (tokens[pos]?.value === "fn") {
      pos++; // skip "fn"
      const name = tokens[pos]!.value;
      pos++; // skip name
      pos++; // skip "("
      const params: { name: string; type: AstType }[] = [];
      while (tokens[pos]?.value !== ")") {
        const paramName = tokens[pos]!.value;
        pos++; // skip param name
        if (tokens[pos]?.value !== ":") {
          throw new Error(`parameter "${paramName}" requires a type annotation`);
        }
        pos++; // skip ":"
        const paramType = parseType();
        params.push({ name: paramName, type: paramType });
        if (tokens[pos]?.value === ",") pos++;
      }
      pos++; // skip ")"
      pos++; // skip "=>"
      const body = parseExpression();
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "fn", name, params, body };
    }
    // Check for while statement
    if (tokens[pos]?.value === "while") {
      pos++; // skip "while"
      expectToken("(");
      const cond = parseExpression();
      expectToken(")");
      const body = parseStatement()!;
      return { kind: "while", cond, body };
    }
    // Check for for statement
    if (tokens[pos]?.value === "for") {
      pos++; // skip "for"
      expectToken("(");
      const varName = tokens[pos]!.value;
      pos++; // skip variable name
      expectToken("in");
      const start = parseExpression();
      expectToken("..");
      const end = parseExpression();
      expectToken(")");
      const body = parseStatement()!;
      return { kind: "for", varName, start, end, body };
    }
    // Check for if statement — branches are parsed as statements (fall back to expressions)
    if (tokens[pos]?.value === "if") {
      pos++; // skip "if"
      expectToken("(");
      const cond = parseExpression();
      expectToken(")");
      const thenBranch = parseStatement()!;
      const elseBranch =
        tokens[pos]?.value === "else" ? (pos++, parseStatement()) : null;
      return { kind: "if_stmt", cond, thenBranch, elseBranch };
    }
    const result = parseExpression();
    if (tokens[pos]?.value === ";") pos++;
    return result;
  }
  function parseBlock(): Ast {
    pos++; // skip "{"
    const statements: (Ast | null)[] = [];
    while (tokens[pos]?.value !== "}" && tokens[pos]) {
      statements.push(parseStatement());
    }
    pos++; // skip "}"
    return { kind: "block", statements };
  }
  const statements: (Ast | null)[] = [];
  while (tokens[pos]) {
    statements.push(parseStatement());
  }
  if (statements.length === 0) return { kind: "num", value: 0 };
  if (statements.length === 1)
    return statements[0]! ?? { kind: "num", value: 0 };
  return { kind: "block", statements };
}
