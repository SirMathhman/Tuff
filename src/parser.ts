import type { Token, ASTNode, FnParam } from "./ast";
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
      const exprResult = parseExpression();
      if (!exprResult.ok) return exprResult;
      if (peek().type !== "rparen") {
        return err(compileError("syntax", "Expected ')' after expression"));
      }
      consume(); // consume ')'
      return exprResult;
    }

    if (token.type === "number") {
      consume();
      return ok({ kind: "number", value: token.value, suffix: token.suffix });
    }

    if (token.type === "boolean") {
      consume();
      return ok({ kind: "boolean", value: token.value });
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

    if (token.type === "identifier") {
      consume();
      let node: ASTNode = { kind: "identifier", name: token.name };

      // Handle function calls: name(arg, ...)
      if (peek().type === "lparen") {
        consume(); // consume '('
        const args: ASTNode[] = [];
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
          return err(
            compileError("syntax", "Expected ')' after function call"),
          );
        }
        consume(); // consume ')'
        return ok({ kind: "call", name: token.name, args });
      }

      // Handle member access (chained)
      while (peek().type === "dot") {
        consume(); // consume dot
        const propToken = consume();
        if (propToken.type !== "identifier") {
          return err(
            compileError(
              "syntax",
              "Expected identifier after dot, got " + propToken.type,
            ),
          );
        }
        node = {
          kind: "member_access",
          object: node,
          property: propToken.name,
        };
      }

      return ok(node);
    }

    return err(compileError("syntax", "Unexpected token: " + token.type));
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

        // The `is` operator is special: its right side is a type name (an
        // identifier), not a full expression. It produces an IsNode.
        if (token.type === "is") {
          consume(); // consume 'is'
          const typeToken = consume();
          if (typeToken.type !== "identifier") {
            return err(
              compileError(
                "syntax",
                "Expected type name after 'is', got " + typeToken.type,
              ),
            );
          }
          node = {
            kind: "is",
            value: node,
            typeName: typeToken.name,
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
    let typeAnnotation: string | undefined;
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

    // Parse the parameter list: <name> : <type>, ...
    const params: FnParam[] = [];
    if (peek().type !== "rparen") {
      while (true) {
        const paramName = consume();
        if (paramName.type !== "identifier") {
          return err(
            compileError(
              "syntax",
              "Expected parameter name, got " + paramName.type,
            ),
          );
        }
        if (peek().type !== "colon") {
          return err(
            compileError(
              "syntax",
              "Expected ':' after parameter name '" + paramName.name + "'",
            ),
          );
        }
        consume(); // consume ':'
        const paramType = parseTypeName();
        params.push({ name: paramName.name, type: paramType });
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

    if (peek().type !== "colon") {
      return err(compileError("syntax", "Expected ':' after function params"));
    }
    consume(); // consume ':'

    const returnType = parseTypeName();

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
      if (expr.kind !== "identifier") {
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
                left: { kind: "identifier", name: expr.name },
                op: assignOp,
                right: value,
              };
        return ok({ kind: "assign", name: expr.name, value: rhs });
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

  // Parse a type name, which may be a reference type like "&I32" or a mutable
  // reference type like "&mut I32". Returns the type string.
  function parseTypeName(): string {
    if (peek().type === "amp") {
      consume(); // consume '&'
      let prefix = "&";
      if (peek().type === "mut") {
        consume(); // consume 'mut'
        prefix = "&mut ";
      }
      const inner = consume();
      if (inner.type !== "identifier") {
        return prefix.trim();
      }
      return prefix + inner.name;
    }
    const typeToken = consume();
    if (typeToken.type !== "identifier") {
      return "";
    }
    return typeToken.name;
  }

  return { peek, parseStatement };
}
