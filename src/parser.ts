import type {
  Token,
  ASTNode,
  FnParam,
  Type,
  StructField,
  StructInitField,
} from "./ast";
import { OPERATORS } from "./ast";
import type { Result } from "./result";
import { ok, err, andThen } from "./result";
import type { CompileError } from "./compileError";
import { compileError } from "./compileError";

export interface Parser {
  peek(): Token;
  parseStatement(): Result<ASTNode, CompileError>;
}

export function createParser(tokens: Token[]): Parser {
  let pos = 0;

  function peek(): Token {
    return tokens[pos]!;
  }

  function consume(): Token {
    const token = tokens[pos]!;
    pos++;
    return token;
  }

  // Parse a primary expression: number, boolean, identifier, member access, if, or block
  function parsePrimary(): Result<ASTNode, CompileError> {
    const token = peek();

    if (token.type === "if") {
      return parseIf();
    }

    if (token.type === "lbrace") {
      return parseBlock();
    }

    if (token.type === "lparen") {
      consume(); // consume '('
      const firstResult = parseExpression();
      if (!firstResult.ok) return firstResult;
      // A tuple literal: "(<expr>, <expr>, ...)". If a comma follows the
      // first expression, this is a tuple rather than a parenthesized expr.
      if (peek().type === "comma") {
        const elements: ASTNode[] = [firstResult.value];
        while (peek().type === "comma") {
          consume(); // consume ','
          const elemResult = parseExpression();
          if (!elemResult.ok) return elemResult;
          elements.push(elemResult.value);
        }
        if (peek().type !== "rparen") {
          return err(
            compileError("syntax", "Expected ')' after tuple literal"),
          );
        }
        consume(); // consume ')'
        return ok({ kind: "tuple", elements });
      }
      if (peek().type !== "rparen") {
        return err(compileError("syntax", "Expected ')' after expression"));
      }
      consume(); // consume ')'
      return firstResult;
    }

    if (token.type === "number") {
      consume();
      return parsePostfix({
        kind: "number",
        value: token.value,
        suffix: token.suffix,
      });
    }

    if (token.type === "boolean") {
      consume();
      return parsePostfix({ kind: "boolean", value: token.value });
    }

    // `this` is a scope reference (not a runtime value). It is only valid as
    // the object of a member access (this.x) or an assignment target. The
    // checker resolves its role (receiver/constructor/scope) later.
    if (token.type === "this") {
      consume();
      return parsePostfix({ kind: "this", thisRole: "scope" });
    }

    // Reference creation: &<expr> or &mut <expr>
    if (token.type === "amp") {
      consume(); // consume '&'
      let isMut = false;
      if (peek().type === "mut") {
        isMut = true;
        consume(); // consume 'mut'
      }
      return andThen(parsePrimary(), (value) => {
        return ok({ kind: "ref", value, isMut });
      });
    }

    // Dereference: *<expr>
    if (token.type === "star") {
      consume(); // consume '*'
      return andThen(parsePrimary(), (value) => {
        return ok({ kind: "deref", value });
      });
    }

    // Array literal: [<expr>, <expr>, ...]
    if (token.type === "lbracket") {
      consume(); // consume '['
      const elements: ASTNode[] = [];
      if (peek().type !== "rbracket") {
        while (true) {
          const elemResult = parseExpression();
          if (!elemResult.ok) return elemResult;
          elements.push(elemResult.value);
          if (peek().type === "comma") {
            consume(); // consume ','
            continue;
          }
          break;
        }
      }
      if (peek().type !== "rbracket") {
        return err(compileError("syntax", "Expected ']' after array literal"));
      }
      consume(); // consume ']'
      return ok({ kind: "array", elements });
    }

    if (token.type === "identifier") {
      consume();
      const node: ASTNode = { kind: "identifier", name: token.name };

      // Handle function calls: name(arg, ...)
      if (peek().type === "lparen") {
        consume(); // consume '('
        const argsResult = parseArgList([]);
        if (!argsResult.ok) return argsResult;
        return parsePostfix({
          kind: "call",
          name: token.name,
          args: argsResult.value,
        });
      }

      // Handle struct construction: Name { field : value, ... }
      if (peek().type === "lbrace") {
        consume(); // consume '{'
        const fields: StructInitField[] = [];
        if (peek().type !== "rbrace") {
          while (true) {
            const fieldName = parseFieldName();
            const valueResult = parseExpression();
            if (!valueResult.ok) return valueResult;
            fields.push({ name: fieldName, value: valueResult.value });
            if (peek().type === "comma") {
              consume(); // consume ','
              continue;
            }
            break;
          }
        }
        if (peek().type !== "rbrace") {
          return err(
            compileError("syntax", "Expected '}' after struct fields"),
          );
        }
        consume(); // consume '}'
        return ok({ kind: "struct_init", name: token.name, fields });
      }

      return parsePostfix(node);
    }

    return err(compileError("syntax", "Unexpected token: " + token.type));
  }

  // Parse a parenthesized argument list `(arg, ...)`, starting with any
  // pre-seeded arguments (e.g. the receiver of a method call). The opening
  // `(` has already been consumed; this consumes through the closing `)`.
  function parseArgList(initial: ASTNode[]): Result<ASTNode[], CompileError> {
    const args: ASTNode[] = [...initial];
    if (peek().type !== "rparen") {
      while (true) {
        const argResult = parseExpression();
        if (!argResult.ok) return argResult;
        args.push(argResult.value);
        if (peek().type === "comma") {
          consume(); // consume ','
          continue;
        }
        break;
      }
    }
    if (peek().type !== "rparen") {
      return err(compileError("syntax", "Expected ')' after argument list"));
    }
    consume(); // consume ')'
    return ok(args);
  }

  // Parse the postfix operators on a base node: member access (a.b), tuple
  // indexing (t.0), and array indexing (arr[i]). Shared by identifiers and
  // `this` so both support the same postfix syntax.
  function parsePostfix(base: ASTNode): Result<ASTNode, CompileError> {
    let node: ASTNode = base;

    // Handle member access (chained) and tuple indexing (tuple.0)
    while (peek().type === "dot") {
      consume(); // consume dot
      const propToken = consume();
      if (propToken.type === "number") {
        // Tuple element access: tuple.0, tuple.1, ...
        node = {
          kind: "tuple_index",
          object: node,
          index: propToken.value,
        };
        continue;
      }
      // A `this` token is allowed as a property name (e.g. `this.this`).
      const propName =
        propToken.type === "this"
          ? "this"
          : propToken.type === "identifier"
            ? propToken.name
            : undefined;
      if (propName === undefined) {
        return err(
          compileError(
            "syntax",
            "Expected identifier after dot, got " + propToken.type,
          ),
        );
      }
      // Method call: obj.method(args). The receiver `obj` is passed as the
      // first argument (bound to the `this` parameter).
      if (peek().type === "lparen") {
        consume(); // consume '('
        const argsResult = parseArgList([node]);
        if (!argsResult.ok) return argsResult;
        node = {
          kind: "call",
          name: propName,
          args: argsResult.value,
          methodCall: true,
        };
        continue;
      }
      node = {
        kind: "member_access",
        object: node,
        property: propToken.name,
      };
    }

    // Handle indexing: array[<expr>]
    while (peek().type === "lbracket") {
      consume(); // consume '['
      const indexResult = parseExpression();
      if (!indexResult.ok) return indexResult;
      if (peek().type !== "rbracket") {
        return err(compileError("syntax", "Expected ']' after index"));
      }
      consume(); // consume ']'
      node = { kind: "index", object: node, index: indexResult.value };
    }

    return ok(node);
  }

  // Parse: if ( <condition> ) <then> [else <else>]
  function parseIf(): Result<ASTNode, CompileError> {
    consume(); // consume 'if'

    if (peek().type !== "lparen") {
      return err(compileError("syntax", "Expected '(' after if"));
    }
    consume(); // consume '('

    const conditionResult = parseExpression();
    if (!conditionResult.ok) return conditionResult;

    if (peek().type !== "rparen") {
      return err(compileError("syntax", "Expected ')' after if condition"));
    }
    consume(); // consume ')'

    const thenResult = parseExpression();
    if (!thenResult.ok) return thenResult;

    // The else branch is optional at parse time. Whether it's required is
    // validated later (an `if` used as a value must have an else).
    let elseBranch: ASTNode | undefined;
    if (peek().type === "else") {
      consume(); // consume 'else'
      const elseResult = parseExpression();
      if (!elseResult.ok) return elseResult;
      elseBranch = elseResult.value;
    }

    return ok({
      kind: "if",
      condition: conditionResult.value,
      thenBranch: thenResult.value,
      elseBranch,
    });
  }

  // Parse: { <statement>; <statement>; ... }
  function parseBlock(): Result<ASTNode, CompileError> {
    consume(); // consume '{'

    const statements: ASTNode[] = [];
    while (peek().type !== "rbrace") {
      if (peek().type === "eof") {
        return err(compileError("syntax", "Expected '}' to close block"));
      }
      const stmtResult = parseStatement();
      if (!stmtResult.ok) return stmtResult;
      statements.push(stmtResult.value);
    }
    consume(); // consume '}'

    return ok({ kind: "block", statements });
  }

  // Parse: while ( <condition> ) <body>
  function parseWhile(): Result<ASTNode, CompileError> {
    consume(); // consume 'while'

    if (peek().type !== "lparen") {
      return err(compileError("syntax", "Expected '(' after while"));
    }
    consume(); // consume '('

    const conditionResult = parseExpression();
    if (!conditionResult.ok) return conditionResult;

    if (peek().type !== "rparen") {
      return err(compileError("syntax", "Expected ')' after while condition"));
    }
    consume(); // consume ')'

    const bodyResult = parseStatement();
    if (!bodyResult.ok) return bodyResult;

    return ok({
      kind: "while",
      condition: conditionResult.value,
      body: bodyResult.value,
    });
  }

  // Parse binary expression with precedence climbing
  function parseExpression(minPrec: number = 0): Result<ASTNode, CompileError> {
    return andThen(parsePrimary(), (left) => {
      let node: ASTNode = left;

      while (true) {
        const token = peek();

        // The `is` operator is special: its right side is a type name (e.g.
        // `I32`, `&Outer`, `[I32; 3]`), not a full expression. It produces an
        // IsNode.
        if (token.type === "is") {
          consume(); // consume 'is'
          const typeName = parseTypeName();
          if (typeName.kind === "named" && typeName.name === "") {
            return err(
              compileError("syntax", "Expected type name after 'is'"),
            );
          }
          node = {
            kind: "is",
            value: node,
            typeName,
            result: false,
          };
          continue;
        }

        const info = OPERATORS.get(token.type);
        if (info === undefined) break;

        const prec = info.precedence;
        if (prec < minPrec) break;

        consume(); // consume operator
        const rightResult = parseExpression(prec + 1);
        if (!rightResult.ok) return rightResult;
        node = {
          kind: "binary_op",
          left: node,
          op: info.symbol,
          right: rightResult.value,
        };
      }

      return ok(node);
    });
  }

  // Parse: let [mut] <identifier> = <expression> ;
  function parseLetDecl(): Result<ASTNode, CompileError> {
    consume(); // consume 'let'

    // Check for optional 'mut' keyword
    let isMut = false;
    if (peek().type === "mut") {
      isMut = true;
      consume(); // consume 'mut'
    }

    const nameToken = consume();
    if (nameToken.type !== "identifier") {
      return err(
        compileError(
          "syntax",
          "Expected identifier after let, got " + nameToken.type,
        ),
      );
    }

    // Optional type annotation: : <type>
    let typeAnnotation: Type | undefined;
    if (peek().type === "colon") {
      consume(); // consume ':'
      typeAnnotation = parseTypeName();
    }

    if (peek().type !== "equals") {
      return err(compileError("syntax", "Expected '=' in let declaration"));
    }
    consume(); // consume '='

    return andThen(parseExpression(), (value) => {
      // Consume optional trailing semicolon
      if (peek().type === "semicolon") {
        consume();
      }

      return ok({
        kind: "let_decl",
        name: nameToken.name,
        value,
        isMut,
        typeAnnotation,
      });
    });
  }

  // Parse: fn <name>(<param> : <type>, ...) : <returnType> => <expression> ;
  function parseFnDecl(): Result<ASTNode, CompileError> {
    consume(); // consume 'fn'

    const nameToken = consume();
    if (nameToken.type !== "identifier") {
      return err(
        compileError(
          "syntax",
          "Expected function name after fn, got " + nameToken.type,
        ),
      );
    }

    if (peek().type !== "lparen") {
      return err(compileError("syntax", "Expected '(' after function name"));
    }
    consume(); // consume '('

    // Parse the parameter list: <name> : <type>, ... or a receiver shorthand
    // `&this` / `&mut this` (a reference to the enclosing struct).
    const params: FnParam[] = [];
    if (peek().type !== "rparen") {
      while (true) {
        // Receiver shorthand: `&this` or `&mut this`. This is a `this`
        // parameter whose type is a reference to the enclosing struct; the
        // checker resolves the inner `this` type to the enclosing struct.
        if (peek().type === "amp") {
          consume(); // consume '&'
          let isMut = false;
          if (peek().type === "mut") {
            isMut = true;
            consume(); // consume 'mut'
          }
          const thisToken = consume();
          if (thisToken.type !== "this") {
            return err(
              compileError(
                "syntax",
                "Expected 'this' after '&', got " + thisToken.type,
              ),
            );
          }
          params.push({
            name: "this",
            type: { kind: "ref", inner: { kind: "this" }, isMut },
          });
          if (peek().type === "comma") {
            consume(); // consume ','
            continue;
          }
          break;
        }
        const paramToken = consume();
        // A `this` token is allowed as a parameter name (the receiver
        // binding of a method).
        const paramName =
          paramToken.type === "this"
            ? "this"
            : paramToken.type === "identifier"
              ? paramToken.name
              : undefined;
        if (paramName === undefined) {
          return err(
            compileError(
              "syntax",
              "Expected parameter name, got " + paramToken.type,
            ),
          );
        }
        if (peek().type !== "colon") {
          return err(
            compileError(
              "syntax",
              "Expected ':' after parameter name '" + paramName + "'",
            ),
          );
        }
        consume(); // consume ':'
        const paramType = parseTypeName();
        params.push({ name: paramName, type: paramType });
        if (peek().type === "comma") {
          consume(); // consume ','
          continue;
        }
        break;
      }
    }

    if (peek().type !== "rparen") {
      return err(compileError("syntax", "Expected ')' after function params"));
    }
    consume(); // consume ')'

    // The return type annotation is optional; it defaults to the generic
    // "Int" type when omitted.
    let returnType: Type = { kind: "named", name: "Int" };
    if (peek().type === "colon") {
      consume(); // consume ':'
      returnType = parseTypeName();
    }

    if (peek().type !== "fat_arrow") {
      return err(compileError("syntax", "Expected '=>' after return type"));
    }
    consume(); // consume '=>'

    return andThen(parseExpression(), (body) => {
      // Consume optional trailing semicolon
      if (peek().type === "semicolon") {
        consume();
      }

      return ok({
        kind: "fn_decl",
        name: nameToken.name,
        params,
        returnType,
        body,
      });
    });
  }

  // Parse: struct <name> { <field> : <type>, ... }
  function parseStructDecl(): Result<ASTNode, CompileError> {
    consume(); // consume 'struct'

    const nameToken = consume();
    if (nameToken.type !== "identifier") {
      return err(
        compileError(
          "syntax",
          "Expected struct name after struct, got " + nameToken.type,
        ),
      );
    }

    if (peek().type !== "lbrace") {
      return err(compileError("syntax", "Expected '{' after struct name"));
    }
    consume(); // consume '{'

    const fields: StructField[] = [];
    if (peek().type !== "rbrace") {
      while (true) {
        // A struct field may be declared mutable: `mut field : I32`.
        let isMut = false;
        if (peek().type === "mut") {
          isMut = true;
          consume(); // consume 'mut'
        }
        const fieldName = parseFieldName();
        const fieldType = parseTypeName();
        fields.push({ name: fieldName, type: fieldType, isMut });
        if (peek().type === "comma") {
          consume(); // consume ','
          continue;
        }
        break;
      }
    }

    if (peek().type !== "rbrace") {
      return err(compileError("syntax", "Expected '}' after struct fields"));
    }
    consume(); // consume '}'

    return ok({ kind: "struct_decl", name: nameToken.name, fields });
  }

  // Parse a single statement
  function parseStatement(): Result<ASTNode, CompileError> {
    if (peek().type === "let") {
      return parseLetDecl();
    }

    if (peek().type === "while") {
      return parseWhile();
    }

    if (peek().type === "fn") {
      return parseFnDecl();
    }

    if (peek().type === "struct") {
      return parseStructDecl();
    }

    // Expression statement
    const exprResult = parseExpression();
    if (!exprResult.ok) return exprResult;
    const expr = exprResult.value;

    // Check for assignment: identifier = expr, compound assignment
    // identifier += expr, or deref assignment *ref = expr.
    const assignOp = thisAssignOp(peek());
    if (assignOp !== null) {
      // Deref assignment: *<ref> = expr
      if (expr.kind === "deref") {
        consume(); // consume the assignment operator
        return andThen(parseExpression(), (value) => {
          // Consume optional trailing semicolon
          if (peek().type === "semicolon") {
            consume();
          }
          return ok({ kind: "deref_assign", target: expr.value, value });
        });
      }
      // Determine the assignment target. A plain identifier `x` assigns to
      // `x`; `this.x` assigns to the variable `x` in the current scope; and
      // `value.field` assigns to the field `field` of the object `value`.
      // All three are represented uniformly as a target ASTNode: an
      // `identifier` for `x`, and a `member_access` for `this.x` / `value.field`.
      let target: ASTNode | undefined;
      if (expr.kind === "identifier") {
        target = expr;
      } else if (expr.kind === "member_access") {
        target = expr;
      }
      if (target === undefined) {
        return err(
          compileError(
            "syntax",
            "Left-hand side of assignment must be an identifier",
          ),
        );
      }
      consume(); // consume the assignment operator
      return andThen(parseExpression(), (value) => {
        // Consume optional trailing semicolon
        if (peek().type === "semicolon") {
          consume();
        }
        // For compound assignment, desugar x <op>= e into x = x <op> e.
        // A plain "=" assignment has an empty op ("").
        const rhs: ASTNode =
          assignOp === ""
            ? value
            : {
                kind: "binary_op",
                left: target!,
                op: assignOp,
                right: value,
              };
        return ok({ kind: "assign", target: target!, value: rhs });
      });
    }

    // Consume optional trailing semicolon
    if (peek().type === "semicolon") {
      consume();
    }
    return ok(expr);
  }

  // Return the binary-op symbol for a compound assignment token (e.g. "+=" -> "+"),
  // "" for a plain "=" assignment, or null if the token is not an assignment.
  function thisAssignOp(token: Token): string | null {
    if (token.type === "equals") {
      return "";
    }
    if (token.type === "plus_equals") {
      return "+";
    }
    return null;
  }

  // Parse a struct field name followed by ':' and return the name.
  function parseFieldName(): string {
    const fieldName = consume();
    if (fieldName.type !== "identifier") {
      return "";
    }
    if (peek().type !== "colon") {
      return "";
    }
    consume(); // consume ':'
    return fieldName.name;
  }

  // Parse a type name, which may be a reference type like "&I32", a mutable
  // reference type like "&mut I32", an array type like "[I32; 3]", or a tuple
  // type like "(I32, I32)". Returns a structured Type.
  function parseTypeName(): Type {
    if (peek().type === "amp") {
      consume(); // consume '&'
      let isMut = false;
      if (peek().type === "mut") {
        isMut = true;
        consume(); // consume 'mut'
      }
      const inner = parseTypeName();
      // A function type is written "&(params) => return"; the leading "&" is
      // a syntactic marker for function types, not a real reference, so
      // unwrap it (a function value is not a reference to a function).
      if (inner.kind === "function") {
        return inner;
      }
      return { kind: "ref", inner, isMut };
    }
    if (peek().type === "lparen") {
      consume(); // consume '('
      const elements: Type[] = [];
      if (peek().type !== "rparen") {
        while (true) {
          elements.push(parseTypeName());
          if (peek().type === "comma") {
            consume(); // consume ','
            continue;
          }
          break;
        }
      }
      if (peek().type !== "rparen") {
        return { kind: "named", name: "" };
      }
      consume(); // consume ')'
      // A function type: "(<params>) => <returnType>". If a fat arrow
      // follows the closing paren, this is a function type rather than a
      // tuple type.
      if (peek().type === "fat_arrow") {
        consume(); // consume '=>'
        const returnType = parseTypeName();
        return { kind: "function", params: elements, returnType };
      }
      return { kind: "tuple", elements };
    }
    if (peek().type === "lbracket") {
      consume(); // consume '['
      const inner = parseTypeName();
      if (peek().type !== "semicolon") {
        return { kind: "named", name: "" };
      }
      consume(); // consume ';'
      const sizeToken = consume();
      if (sizeToken.type !== "number") {
        return { kind: "named", name: "" };
      }
      if (peek().type !== "rbracket") {
        return { kind: "named", name: "" };
      }
      consume(); // consume ']'
      return { kind: "array", elem: inner, length: sizeToken.value };
    }
    const typeToken = consume();
    if (typeToken.type !== "identifier") {
      return { kind: "named", name: "" };
    }
    return { kind: "named", name: typeToken.name };
  }

  return { peek, parseStatement };
}
