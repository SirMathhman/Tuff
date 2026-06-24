import { TokenType } from "./tokenizer.js";

// AST Node Types
export const NodeType = {
  Program: "Program",
  ExternImportStatement: "ExternImportStatement",
  ExportStatement: "ExportStatement",
  DestructureBinding: "DestructureBinding",
  LetStatement: "LetStatement",
  StructDeclaration: "StructDeclaration",
  TypeAlias: "TypeAlias",
  FunctionDeclaration: "FunctionDeclaration",
  ExpressionStatement: "ExpressionStatement",
  AssignmentStatement: "AssignmentStatement",
  CallExpression: "CallExpression",
  MethodCallExpression: "MethodCallExpression",
  DotExpression: "DotExpression",
  BinaryExpression: "BinaryExpression",
  NumberLiteral: "NumberLiteral",
  StringLiteral: "StringLiteral",
  Identifier: "Identifier",
  ThisExpression: "ThisExpression",
  ObjectLiteral: "ObjectLiteral",
  BlockStatement: "BlockStatement",
  ReturnStatement: "ReturnStatement",
  QualifiedPathExpression: "QualifiedPathExpression",
};

// Helper to produce a parser error with line:col and surrounding token context
function err(message, tokens, pos) {
  const token = tokens[pos];
  const loc =
    token?.line && token?.col !== undefined
      ? `${token.line}:${token.col}`
      : `pos ${pos}`;
  return { variant: "err", error: `${message} at ${loc}` };
}

// Helper to consume an optional trailing semicolon and advance position
function maybeConsumeSemicolon(tokens, pos) {
  if (tokens[pos]?.type === TokenType.SEMICOLON) {
    return pos + 1;
  }
  return pos;
}

// Skip optional generic parameters <T, U> and return new position
function skipGenerics(tokens, pos) {
  if (tokens[pos]?.type !== TokenType.LT) return pos;
  pos++; // consume '<'
  while (pos < tokens.length && tokens[pos]?.type !== TokenType.GT) {
    pos++;
  }
  return pos + 1; // consume '>'
}

export function parse(tokens) {
  const ast = [];
  let pos = 0;

  while (tokens[pos].type !== TokenType.EOF) {
    // Empty statement (just semicolon or EOF with no content)
    if (
      tokens[pos].type === TokenType.SEMICOLON ||
      tokens[pos].type === TokenType.EOF
    ) {
      break;
    }

    const stmt = parseStatement(tokens, pos);
    if (stmt.variant === "err") return stmt;
    ast.push(stmt.statement);
    pos = stmt.nextPos;
  }

  return { variant: "ok", node: { type: NodeType.Program, body: ast } };
}

function parseStatement(tokens, pos) {
  // Function declaration: fn NAME() => expr ;
  if (tokens[pos].type === TokenType.FN_DECLARATION) {
    const result = parseFunctionDeclaration(tokens, pos);
    if (result.variant === "err") return result;
    return {
      statement: {
        type: NodeType.FunctionDeclaration,
        name: result.name,
        params: result.params,
        body: result.body,
      },
      nextPos: result.nextPos,
    };
  }

  // Type alias: type IDENT = TYPE ;
  if (tokens[pos].type === TokenType.TYPE_ALIAS) {
    const result = parseTypeAlias(tokens, pos);
    if (result.variant === "err") return result;
    return {
      statement: { type: NodeType.TypeAlias, name: result.name },
      nextPos: result.nextPos,
    };
  }

  // Struct declaration
  if (tokens[pos].type === TokenType.STRUCT) {
    const result = parseStructDeclaration(tokens, pos);
    if (result.variant === "err") return result;
    return {
      statement: { type: NodeType.StructDeclaration, name: result.name },
      nextPos: result.nextPos,
    };
  }

  // Extern type declaration: extern type IDENT ;
  if (tokens[pos].type === TokenType.EXTERN_TYPE) {
    return {
      statement: { type: NodeType.StructDeclaration, name: "extern" },
      nextPos: pos + 1,
    };
  }

  // Extern type declaration: extern type IDENT ;
  if (tokens[pos].type === TokenType.EXTERN_TYPE_DECLARATION) {
    return {
      statement: { type: NodeType.StructDeclaration, name: "extern" },
      nextPos: pos + 1,
    };
  }

  // Extern let declaration: extern let IDENT : Type = extern ... ;
  if (tokens[pos].type === TokenType.EXTERN_LET_DECLARATION) {
    return {
      statement: {
        type: NodeType.StructDeclaration,
        name: "extern_let",
        bindingName: tokens[pos]?.value?.bindingName || null,
      },
      nextPos: pos + 1,
    };
  }

  // Extern fn declaration: extern fn NAME(...) : Type ;
  if (tokens[pos].type === TokenType.EXTERN_FN_DECLARATION) {
    return {
      statement: { type: NodeType.StructDeclaration, name: "extern_fn" },
      nextPos: pos + 1,
    };
  }

  // Extern let import with destructuring: extern let { x , y } = extern IDENT ;
  if (tokens[pos].type === TokenType.EXTERN_LET_IMPORT_DECLARATION) {
    return {
      statement: {
        type: NodeType.ExternImportStatement,
        bindings: tokens[pos].value.bindings,
        moduleName: tokens[pos].value.moduleName,
      },
      nextPos: pos + 1,
    };
  }

  // Export statement: out let IDENT = expr ;
  if (tokens[pos].type === TokenType.OUT) {
    const result = parseExportStatement(tokens, pos);
    if (result.variant === "err") return result;
    return {
      statement: {
        type: NodeType.ExportStatement,
        name: result.name,
        value: result.value,
        isFunctionExport: result.isFunctionExport || false,
      },
      nextPos: result.nextPos,
    };
  }

  // Let statement (let mut? IDENT : Type? = expr ;)
  if (tokens[pos].type === TokenType.LET) {
    const result = parseLetStatement(tokens, pos);
    if (result.variant === "err") return result;

    // Destructuring: let { x , y } = expr ;
    if (Array.isArray(result.name)) {
      return {
        statement: {
          type: NodeType.LetStatement,
          bindings: result.name,
          value: result.value,
          mutable: result.mutable || false,
        },
        nextPos: result.nextPos,
      };
    }

    return {
      statement: {
        type: NodeType.LetStatement,
        name: result.name,
        value: result.value,
        mutable: result.mutable || false,
      },
      nextPos: result.nextPos,
    };
  }

  // Assignment statement (expr = expr ;)
  if (
    tokens[pos]?.type === TokenType.THIS &&
    tokens[pos + 1]?.type === TokenType.DOT &&
    tokens[pos + 2]?.type === TokenType.IDENT &&
    tokens[pos + 3]?.type === TokenType.EQUALS
  ) {
    const result = parseAssignmentStatement(tokens, pos);
    if (result.variant === "err") return result;
    return {
      statement: {
        type: NodeType.AssignmentStatement,
        target: result.target,
        value: result.value,
      },
      nextPos: result.nextPos,
    };
  }

  // Assignment on general dot expression (e.g. temp.x = expr ;)
  if (
    tokens[pos]?.type === TokenType.IDENT &&
    tokens[pos + 1]?.type === TokenType.DOT &&
    tokens[pos + 2]?.type === TokenType.IDENT &&
    tokens[pos + 3]?.type === TokenType.EQUALS
  ) {
    const result = parseGeneralAssignmentStatement(tokens, pos);
    if (result.variant === "err") return result;
    return {
      statement: {
        type: NodeType.AssignmentStatement,
        targetExpr: result.targetExpr,
        value: result.value,
      },
      nextPos: result.nextPos,
    };
  }

  // Expression statement
  const expr = parseExpression(tokens, pos);
  if (expr.variant === "err") return expr;

  let p = maybeConsumeSemicolon(tokens, expr.nextPos);

  return {
    statement: { type: NodeType.ExpressionStatement, expression: expr.node },
    nextPos: p,
  };
}

// fn NAME() => expr ;
function parseFunctionDeclaration(tokens, pos) {
  if (tokens[pos].type !== TokenType.FN_DECLARATION)
    return err(`Expected 'fn'`, tokens, pos);
  pos++;

  const name = tokens[pos]?.value;
  if (tokens[pos]?.type !== TokenType.IDENT)
    return err(`Expected function name after 'fn'`, tokens, pos);
  pos++;

  // Consume '(' and parse parameters
  if (!tokens[pos] || tokens[pos].type !== TokenType.LPAREN)
    return err("Expected '(' for parameter list", tokens, pos);
  pos++;

  const params = [];
  while (pos < tokens.length && tokens[pos]?.type !== TokenType.RPAREN) {
    if (
      tokens[pos]?.type === TokenType.IDENT ||
      tokens[pos]?.type === TokenType.THIS
    ) {
      // Allow 'this' as a parameter name for method receivers
      params.push(tokens[pos].value);
      pos++;
    } else {
      return err(`Expected parameter name in function '${name}'`, tokens, pos);
    }

    // Optional type annotation : Type
    if (tokens[pos]?.type === TokenType.COLON) {
      pos++; // consume ':'
      while (
        pos < tokens.length &&
        tokens[pos].type !== TokenType.COMMA &&
        tokens[pos].type !== TokenType.RPAREN &&
        tokens[pos].type !== TokenType.EOF
      ) {
        pos++;
      }
    }

    // Optional comma separator
    if (tokens[pos]?.type === TokenType.COMMA) {
      pos++;
    }
  }

  if (!tokens[pos])
    return err(
      `Expected ')' to close parameter list for function '${name}'`,
      tokens,
      pos,
    );
  pos++; // consume ')'

  // Optional return type annotation : Type
  if (tokens[pos]?.type === TokenType.COLON) {
    pos++; // consume ':'
    while (
      pos < tokens.length &&
      tokens[pos].type !== TokenType.FAT_ARROW &&
      tokens[pos].type !== TokenType.EOF
    ) {
      pos++;
    }
  }

  // Consume '=>'
  if (!tokens[pos] || tokens[pos].type !== TokenType.FAT_ARROW)
    return err(`Expected '=>' for function body of '${name}'`, tokens, pos);
  pos++;

  // Function body: either { ... } block or a single expression
  let body;
  let p;
  if (tokens[pos]?.type === TokenType.LBRACE) {
    const result = parseBlock(tokens, pos);
    if (result.variant === "err") return result;
    body = result.node;
    p = result.nextPos;
  } else {
    const expr = parseExpression(tokens, pos);
    if (expr.variant === "err") return expr;
    body = { type: NodeType.ExpressionStatement, expression: expr.node };
    p = expr.nextPos;
  }

  // Consume trailing semicolon if present

  // Consume trailing semicolon if present
  p = maybeConsumeSemicolon(tokens, p);

  return { name, params, body, nextPos: p };
}

// Parse a block statement: { stmt; stmt; ... }
function parseBlock(tokens, pos) {
  const statements = [];
  if (tokens[pos]?.type !== TokenType.LBRACE)
    return err("Expected '{'", tokens, pos);
  pos++;

  while (
    pos < tokens.length &&
    tokens[pos].type !== TokenType.RBRACE &&
    tokens[pos].type !== TokenType.EOF
  ) {
    // Return statement inside block: return expr ;
    if (
      tokens[pos]?.value === "return" &&
      tokens[pos]?.type === TokenType.IDENT
    ) {
      pos++; // consume 'return'
      const expr = parseExpression(tokens, pos);
      if (expr.variant === "err") return expr;
      statements.push({
        type: NodeType.ReturnStatement,
        expression: expr.node,
      });
      pos = expr.nextPos;
      pos = maybeConsumeSemicolon(tokens, pos);
    } else {
      const stmt = parseStatement(tokens, pos);
      if (stmt.variant === "err") return stmt;
      statements.push(stmt.statement);
      pos = stmt.nextPos;
    }
  }

  if (!tokens[pos]) return err("Expected '}' to close block", tokens, pos);
  pos++;

  return {
    node: { type: NodeType.BlockStatement, body: statements },
    nextPos: pos,
  };
}

// type IDENT <T, U>? = TYPE ;
function parseTypeAlias(tokens, pos) {
  if (tokens[pos].type !== TokenType.TYPE_ALIAS)
    return err(`Expected 'type'`, tokens, pos);
  pos++;

  const name = tokens[pos]?.value;
  if (tokens[pos]?.type !== TokenType.IDENT)
    return err("Expected alias name after 'type'", tokens, pos);
  pos++;

  // Optional generic parameters <T, U>
  if (tokens[pos]?.type === TokenType.LT) {
    pos = skipGenerics(tokens, pos);
    if (!tokens[pos])
      return err(
        `Expected '>' to close generic parameters for type alias '${name}'`,
        tokens,
        pos,
      );
  }

  // Consume '='
  if (!tokens[pos] || tokens[pos].type !== TokenType.EQUALS) {
    const found = tokens[pos]?.value ?? "end of input";
    return err(
      `Expected '=' for type alias '${name}', but found '${found}'`,
      tokens,
      pos,
    );
  }
  pos++;

  // Skip to semicolon (consume the RHS type expression — no validation needed)
  while (pos < tokens.length && tokens[pos]?.type !== TokenType.SEMICOLON) {
    pos++;
  }
  if (!tokens[pos])
    return err(`Expected ';' to end type alias '${name}'`, tokens, pos);
  pos++; // consume ';'

  return { name, nextPos: pos };
}

// struct IDENT <T, U> { ... }
function parseStructDeclaration(tokens, pos) {
  if (tokens[pos].type !== TokenType.STRUCT)
    return { variant: "err", error: `Expected 'struct' at position ${pos}` };
  pos++;

  const name = tokens[pos]?.value;
  if (tokens[pos]?.type !== TokenType.IDENT)
    return {
      variant: "err",
      error: `Expected struct name after 'struct' at position ${pos}`,
    };
  pos++;

  // Optional generic parameters <T, U>
  if (tokens[pos]?.type === TokenType.LT) {
    pos = skipGenerics(tokens, pos);
    if (!tokens[pos])
      return {
        variant: "err",
        error: `Expected '>' to close generic parameters for struct '${name}'`,
      };
  }

  // Consume opening brace
  if (!tokens[pos] || tokens[pos].type !== TokenType.LBRACE)
    return {
      variant: "err",
      error: `Expected '{' for struct body of '${name}'`,
    };
  pos++;

  // Skip to closing brace (empty body for now — no field parsing yet)
  while (pos < tokens.length && tokens[pos]?.type !== TokenType.RBRACE) {
    pos++;
  }
  if (!tokens[pos])
    return { variant: "err", error: `Expected '}' to close struct '${name}'` };
  pos++; // consume '}'

  return { name, nextPos: pos };
}

// Shared helper: parse IDENT : Type? = expr ; and return parsed parts.
class LetParseResult {
  constructor(name, expressionNode, nextPosition) {
    this.name = name;
    this.expressionNode = expressionNode;
    this.nextPos = nextPosition;
  }
}

// Shared helper: consume optional '=' and then an expression
class ExpressionAfterEqualsResult {
  constructor(expressionNode, nextPosition) {
    this.node = expressionNode;
    this.nextPos = nextPosition;
  }
}

function parseExpressionAfterEquals(tokens, pos) {
  // Consume '=' if present
  if (tokens[pos]?.type === TokenType.EQUALS) {
    pos++;
  }

  const expr = parseExpression(tokens, pos);
  if (expr.variant === "err")
    return err("Failed to parse expression", tokens, pos);

  return new ExpressionAfterEqualsResult(expr.node, expr.nextPos);
}

// Parse destructuring pattern: { x , y } and return list of binding names.
class DestructureParseResult {
  constructor(names, expressionNode, nextPosition) {
    this.names = names;
    this.expressionNode = expressionNode;
    this.nextPos = nextPosition;
  }
}

function parseDestructuringTail(tokens, pos) {
  // Consume '{'
  if (!tokens[pos] || tokens[pos].type !== TokenType.LBRACE)
    return err("Expected '{' for destructuring pattern", tokens, pos);
  pos++;

  const names = [];
  while (pos < tokens.length && tokens[pos]?.type !== TokenType.RBRACE) {
    if (tokens[pos]?.type === TokenType.IDENT) {
      names.push(tokens[pos].value);
      pos++;
    } else {
      return err("Expected identifier in destructuring pattern", tokens, pos);
    }

    // Optional comma separator
    if (tokens[pos]?.type === TokenType.COMMA) {
      pos++;
    }
  }

  if (!tokens[pos])
    return err("Expected '}' to close destructuring pattern", tokens, pos);
  pos++; // consume '}'

  const exprResult = parseExpressionAfterEquals(tokens, pos);
  if (exprResult.variant === "err") return exprResult;

  let p = maybeConsumeSemicolon(tokens, exprResult.nextPos);

  return new DestructureParseResult(names, exprResult.node, p);
}

function parseLetTail(tokens, pos) {
  const name = tokens[pos]?.value;
  if (tokens[pos]?.type !== TokenType.IDENT)
    return err("Expected identifier after 'let'", tokens, pos);
  pos++;

  // Optional type annotation : Type
  if (tokens[pos]?.type === TokenType.COLON) {
    pos++; // consume ':'
    while (
      pos < tokens.length &&
      tokens[pos].type !== TokenType.EQUALS &&
      tokens[pos].type !== TokenType.SEMICOLON &&
      tokens[pos].type !== TokenType.EOF
    ) {
      pos++;
    }
  }

  const exprResult = parseExpressionAfterEquals(tokens, pos);
  if (exprResult.variant === "err")
    return err("Failed to parse expression", tokens, pos);

  let p = maybeConsumeSemicolon(tokens, exprResult.nextPos);

  return new LetParseResult(name, exprResult.node, p);
}

// out let IDENT : Type? = expr ;
// out fn NAME(params) => body ;
function parseExportStatement(tokens, pos) {
  if (tokens[pos].type !== TokenType.OUT)
    return { variant: "err", error: `Expected 'out' at position ${pos}` };
  pos++;

  // Check for 'fn' keyword — out fn NAME(params) => body ;
  if (tokens[pos]?.type === TokenType.FN_DECLARATION) {
    const fnResult = parseFunctionDeclaration(tokens, pos);
    if (fnResult.variant === "err") return fnResult;

    // Build an expression that represents the function for export wiring
    // The codegen will handle registering this as both a _ctx function and an export
    return {
      name: fnResult.name,
      value: {
        type: NodeType.FunctionDeclaration,
        name: fnResult.name,
        params: fnResult.params,
        body: fnResult.body,
      },
      nextPos: fnResult.nextPos,
      isFunctionExport: true,
    };
  }

  // Consume 'let'
  if (!tokens[pos] || tokens[pos].type !== TokenType.LET)
    return err("Expected 'let' after 'out'", tokens, pos);
  pos++;

  const tailResult = parseLetTail(tokens, pos);
  if (tailResult.variant === "err") return tailResult;

  return {
    name: tailResult.name,
    value: tailResult.expressionNode,
    nextPos: tailResult.nextPos,
  };
}

function parseLetStatement(tokens, pos) {
  // let mut? IDENT : Type? = expr ;
  if (tokens[pos].type !== TokenType.LET)
    return { variant: "err", error: `Expected 'let' at position ${pos}` };
  pos++;

  // Optional 'mut' keyword
  const mutable = tokens[pos]?.type === TokenType.MUT;
  if (mutable) {
    pos++; // consume 'mut'
  }

  // Check for destructuring pattern: let { x , y } = expr ;
  if (tokens[pos]?.type === TokenType.LBRACE) {
    const tailResult = parseDestructuringTail(tokens, pos);
    if (tailResult.variant === "err") return tailResult;

    return {
      name: tailResult.names,
      value: tailResult.expressionNode,
      mutable,
      nextPos: tailResult.nextPos,
    };
  }

  const tailResult = parseLetTail(tokens, pos);
  if (tailResult.variant === "err") return tailResult;

  return {
    name: tailResult.name,
    value: tailResult.expressionNode,
    mutable,
    nextPos: tailResult.nextPos,
  };
}

// Shared helper: consume '. IDENT = expr ;' and return parsed parts.
class AssignmentParseResult {
  constructor(propertyName, expressionNode, nextPosition) {
    this.propertyName = propertyName;
    this.expressionNode = expressionNode;
    this.nextPos = nextPosition;
  }
}

function parseAssignmentTail(tokens, pos) {
  // Consume '.'
  if (!tokens[pos] || tokens[pos].type !== TokenType.DOT)
    return err("Expected '.' for assignment", tokens, pos);
  pos++;

  // Get property/target identifier
  const propertyName = tokens[pos]?.value;
  if (tokens[pos]?.type !== TokenType.IDENT)
    return err("Expected identifier after '.'", tokens, pos);
  pos++;

  // Consume '='
  if (!tokens[pos] || tokens[pos].type !== TokenType.EQUALS)
    return err("Expected '=' for assignment", tokens, pos);
  pos++;

  const expr = parseExpression(tokens, pos);
  if (expr.variant === "err") return expr;

  let p = maybeConsumeSemicolon(tokens, expr.nextPos);

  return new AssignmentParseResult(propertyName, expr.node, p);
}

// Parse assignment statement: this.IDENT = expr ;
function parseAssignmentStatement(tokens, pos) {
  // Consume 'this'
  if (tokens[pos].type !== TokenType.THIS)
    return err("Expected 'this' for assignment", tokens, pos);
  pos++;

  const tailResult = parseAssignmentTail(tokens, pos);
  if (tailResult.variant === "err") return tailResult;

  return {
    target: tailResult.propertyName,
    value: tailResult.expressionNode,
    nextPos: tailResult.nextPos,
  };
}

// Parse general assignment statement: IDENT.property = expr ;
function parseGeneralAssignmentStatement(tokens, pos) {
  // Get base identifier
  const baseName = tokens[pos]?.value;
  if (tokens[pos]?.type !== TokenType.IDENT)
    return err("Expected identifier for assignment", tokens, pos);
  pos++;

  const tailResult = parseAssignmentTail(tokens, pos);
  if (tailResult.variant === "err") return tailResult;

  // Build the target expression as a DotExpression AST node
  const targetExpr = {
    type: NodeType.DotExpression,
    object: { type: NodeType.Identifier, name: baseName },
    property: tailResult.propertyName,
  };

  return {
    targetExpr,
    value: tailResult.expressionNode,
    nextPos: tailResult.nextPos,
  };
}

// Shared helper: parse argument list from current position (after '(').
// Returns { args, nextPos } or error variant.
function parseArgumentsList(tokens, pos) {
  const args = [];

  while (pos < tokens.length && tokens[pos].type !== TokenType.RPAREN) {
    const argResult = parseExpression(tokens, pos);
    if (argResult.variant === "err") return argResult;
    args.push(argResult.node);
    pos = argResult.nextPos;

    // Optional comma separator
    if (tokens[pos]?.type === TokenType.COMMA) {
      pos++;
    }
  }

  if (!tokens[pos])
    return err(`Expected ')' to close call expression`, tokens, pos);
  pos++; // consume ')'

  return { args, nextPos: pos };
}

// Parse a primary expression followed by any dot/method chain.
// Used for both left and right sides of binary operators so dot access is always applied.
function parsePrefix(tokens, pos) {
  const primary = parsePrimary(tokens, pos);
  if (primary.variant === "err") return primary;

  let result = primary.node; // unwrap to get actual AST node
  let p = primary.nextPos;

  // FQN access: parent::child or parent::child::grandchild
  while (
    tokens[p]?.type === TokenType.COLON &&
    tokens[p + 1]?.type === TokenType.COLON &&
    tokens[p + 2]?.type === TokenType.IDENT
  ) {
    p += 2; // consume '::'
    const segment = tokens[p].value;
    p++;

    result = {
      type: NodeType.QualifiedPathExpression,
      object: result,
      property: segment,
    };
  }

  // Call on FQN path: parent::child(args)
  if (
    tokens[p]?.type === TokenType.LPAREN &&
    (result.type === NodeType.QualifiedPathExpression ||
      result.type === NodeType.DotExpression)
  ) {
    p++; // consume '('
    const argResult = parseArgumentsList(tokens, p);
    if (argResult.variant === "err") return argResult;
    p = argResult.nextPos;

    result = {
      type: NodeType.CallExpression,
      callee: result,
      arguments: argResult.args,
    };
  }

  // Dot access and method calls: expr.property or obj.method()
  while (
    tokens[p]?.type === TokenType.DOT &&
    tokens[p + 1]?.type === TokenType.IDENT
  ) {
    p++; // consume '.'
    const property = tokens[p].value;
    p++;

    // Check if this is a method call: obj.method()
    if (tokens[p]?.type === TokenType.LPAREN) {
      p++; // consume '('
      const argResult = parseArgumentsList(tokens, p);
      if (argResult.variant === "err") return argResult;
      p = argResult.nextPos;

      result = {
        type: NodeType.MethodCallExpression,
        object: result,
        methodName: property,
        arguments: argResult.args,
      };
    } else {
      result = { type: NodeType.DotExpression, object: result, property };
    }
  }

  return { node: result, nextPos: p };
}

// Expression parsing with operator precedence (simple left-to-right for now)
function parseExpression(tokens, pos) {
  const prefix = parsePrefix(tokens, pos);
  if (prefix.variant === "err") return prefix;

  let result = prefix.node; // unwrap to get actual AST node
  let p = prefix.nextPos;

  while (
    tokens[p]?.type === TokenType.PLUS ||
    tokens[p]?.type === TokenType.MINUS ||
    tokens[p]?.type === TokenType.STAR ||
    tokens[p]?.type === TokenType.SLASH
  ) {
    const op = tokens[p].value;
    p++;
    const rightPrefix = parsePrefix(tokens, p);
    if (rightPrefix.variant === "err") return rightPrefix;

    p = rightPrefix.nextPos;

    result = {
      type: NodeType.BinaryExpression,
      operator: op,
      left: result,
      right: rightPrefix.node,
    };
  }

  return { node: result, nextPos: p };
}

function parsePrimary(tokens, pos) {
  // Number literal
  if (!tokens[pos]) return err("Unexpected end of input", tokens, pos);

  if (tokens[pos].type === TokenType.STRING_LITERAL) {
    const value = tokens[pos].value;
    pos++;
    return { node: { type: NodeType.StringLiteral, value }, nextPos: pos };
  }

  if (tokens[pos].type === TokenType.NUMBER) {
    const value = tokens[pos].value;
    pos++;
    return { node: { type: NodeType.NumberLiteral, value }, nextPos: pos };
  }

  // Object literal / struct instantiation {}
  if (tokens[pos]?.type === TokenType.LBRACE) {
    pos++; // consume '{'
    while (pos < tokens.length && tokens[pos].type !== TokenType.RBRACE) {
      pos++;
    }
    if (!tokens[pos])
      return err("Expected '}' to close object literal", tokens, pos);
    pos++; // consume '}'
    return { node: { type: NodeType.ObjectLiteral }, nextPos: pos };
  }

  // "this" keyword as expression value — resolves to _ctx at runtime
  if (tokens[pos]?.type === TokenType.THIS) {
    pos++; // consume 'this'
    return { node: { type: NodeType.ThisExpression }, nextPos: pos };
  }

  // Identifier or function call
  if (tokens[pos].type === TokenType.IDENT) {
    const name = tokens[pos].value;
    pos++;

    // Check for function call or struct instantiation
    if (tokens[pos]?.type === TokenType.LPAREN) {
      pos++; // consume '('
      const argResult = parseArgumentsList(tokens, pos);
      if (argResult.variant === "err") return argResult;
      pos = argResult.nextPos;

      return {
        node: {
          type: NodeType.CallExpression,
          name,
          arguments: argResult.args,
        },
        nextPos: pos,
      };
    }

    // Check for struct instantiation: NAME { field : expr , ... }
    if (tokens[pos]?.type === TokenType.LBRACE) {
      const fields = [];
      pos++; // consume '{'

      while (pos < tokens.length && tokens[pos].type !== TokenType.RBRACE) {
        // Parse field name: IDENT
        if (tokens[pos]?.type !== TokenType.IDENT)
          return err(
            `Expected field name in struct instantiation`,
            tokens,
            pos,
          );
        const fieldName = tokens[pos].value;
        pos++;

        // Consume ':'
        if (!tokens[pos] || tokens[pos].type !== TokenType.COLON)
          return err(
            `Expected ':' after field name '${fieldName}'`,
            tokens,
            pos,
          );
        pos++;

        // Parse field value expression
        const exprResult = parseExpression(tokens, pos);
        if (exprResult.variant === "err") return exprResult;
        fields.push({ key: fieldName, value: exprResult.node });
        pos = exprResult.nextPos;

        // Optional comma separator
        if (tokens[pos]?.type === TokenType.COMMA) {
          pos++;
        }
      }

      if (!tokens[pos])
        return err(
          `Expected '}' to close struct instantiation for '${name}'`,
          tokens,
          pos,
        );
      pos++; // consume '}'

      return {
        node: { type: NodeType.ObjectLiteral, name, fields },
        nextPos: pos,
      };
    }

    return { node: { type: NodeType.Identifier, name }, nextPos: pos };
  }

  // Build context snippet from surrounding tokens for better diagnostics
  const start = Math.max(0, pos - 3);
  const end = Math.min(tokens.length, pos + 4);
  const snippet = [];
  for (let i = start; i < end; i++) {
    const marker = i === pos ? " <--" : "";
    snippet.push(`${tokens[i].value ?? tokens[i].type}${marker}`);
  }

  return err(
    `Unexpected token '${tokens[pos]?.value}' (${tokens[pos]?.type}). Context: [${snippet.join(", ")}]`,
    tokens,
    pos,
  );
}
