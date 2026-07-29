import type { AstNode, LValue } from "../core/ast";
import type { Token, TokenPos } from "../lexer/tokenizer";
import type { BinaryOp } from "../core/grammar";
import type { Type } from "../core/types";
import { OPENING, PRECEDENCE } from "../core/grammar";
import { InterpreterError } from "../core/error";
import {
  arrayType,
  pointer,
  tupleType,
  unionType,
} from "../core/types";
import { isIdentifierToken, isNumberToken } from "../lexer/tokenizer";

/**
 * Recursive-descent parser for the Tuff language.
 * Encapsulates mutable state (position, tokens) as class members.
 */
class Parser {
  private pos = 0;

  constructor(private tokens: Token[]) {}

  /* ---- low-level token access ---- */

  peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  consume(): Token | undefined {
    return this.tokens[this.pos++];
  }

  /** Consume a keyword and read the following identifier name. */
  private parseKeywordAndName(keyword: string): {
    name: string;
    pos: TokenPos;
  } {
    const pos = this.peek()?.pos;
    this.expect("keyword", keyword);
    const nameToken = this.peek();
    let name = "";
    if (nameToken?.type === "identifier") {
      name = nameToken.value;
      this.consume();
    }
    return { name, pos: pos ?? { line: 1, column: 1 } };
  }

  match(type: string, value?: string): boolean {
    const t = this.peek();
    if (t?.type !== type) return false;
    if (value !== undefined && t.value !== value) return false;
    return true;
  }

  expect(type: string, value?: string): Token {
    const t = this.peek();
    if (t?.type !== type || (value !== undefined && t.value !== value)) {
      throw new InterpreterError(
        "parse",
        `Expected ${type}${value !== undefined ? ` '${value}'` : ""}, got ${t?.type} '${t?.value}'`,
        t?.pos ?? { line: 1, column: 1 },
      );
    }
    return this.consume()!;
  }

  /**
   * Parse the next statement using the provided parser function.
   * Throws if no tokens were consumed (no progress).
   */
  private parseNext(fn: () => AstNode): AstNode {
    const prevPos = this.pos;
    const result = fn();
    if (prevPos === this.pos) {
      const t = this.peek();
      throw new InterpreterError(
        "parse",
        `Unexpected token '${t?.value ?? "EOF"}'`,
        t?.pos ?? { line: 1, column: 1 },
      );
    }
    return result;
  }

  /* ---- public entry point ---- */

  parse(): AstNode {
    const statements: AstNode[] = [];
    while (this.pos < this.tokens.length) {
      statements.push(this.parseNext(() => this.parseTopLevelStatement()));
    }
    if (statements.length === 0) return { kind: "number", value: 0 };
    if (statements.length === 1) return statements[0]!;
    return { kind: "block", statements };
  }

  /**
   * Parse a top-level statement.
   * `let` is a statement; everything else (including `{ ... }`) is an expression.
   */
  private parseTopLevelStatement(): AstNode {
    const stmt = this.tryParseKnownStatement();
    if (stmt) return stmt;
    return this.parseExpression();
  }

  /* ---- grammar rules ---- */

  /**
   * Collect statements until closing "}", consuming the brace.
   */
  private collectUntilBrace(): AstNode[] {
    const statements: AstNode[] = [];
    while (this.pos < this.tokens.length && !this.match("group", "}")) {
      statements.push(this.parseNext(() => this.parseStatement()));
    }
    this.expect("group", "}");
    return statements;
  }

  /**
   * Parse a block: `{ statement* }`
   * Semantic checks (void type, declaration restrictions) are handled by the analyzer.
   */
  private parseBlock(): AstNode {
    const token = this.peek();
    const statements = this.collectUntilBrace();
    return { kind: "block", statements, pos: token?.pos };
  }

  private parseStatement(): AstNode {
    if (this.match("group", "{")) {
      this.consume();
      return this.parseBlock();
    }
    const stmt = this.tryParseKnownStatement();
    if (stmt) return stmt;
    return this.parseExpression();
  }

  /** Try to parse a known statement (`let`, `fn`, `if`, `while`, `break`, `yield`, or `identifier = expr`). Returns undefined if none match. */
  private tryParseKnownStatement(): AstNode | undefined {
    if (this.match("keyword", "let")) return this.parseLetStatement();
    if (this.match("keyword", "fn")) return this.parseFnStatement();
    if (this.match("keyword", "struct")) return this.parseStructStatement();
    if (this.match("keyword", "if")) return this.parseIfStatement();
    if (this.match("keyword", "while")) return this.parseWhileStatement();
    if (this.match("keyword", "break")) {
      this.consume();
      const value = this.parseExpression();
      if (this.match("punctuator", ";")) {
        this.consume();
      }
      return { kind: "break", value, pos: value.pos };
    }
    if (this.match("keyword", "yield")) {
      this.consume();
      const value = this.parseExpression();
      if (this.match("punctuator", ";")) {
        this.consume();
      }
      return { kind: "yield", value, pos: value.pos };
    }
    if (this.match("keyword", "return")) {
      this.consume();
      const value = this.parseExpression();
      if (this.match("punctuator", ";")) {
        this.consume();
      }
      return { kind: "return", value, pos: value.pos };
    }
    if (this.match("keyword", "continue")) {
      const pos = this.peek()?.pos;
      this.consume();
      if (this.match("punctuator", ";")) {
        this.consume();
      }
      return { kind: "continue", pos };
    }
    if (this.match("keyword", "type")) {
      const pos = this.peek()?.pos;
      this.consume(); // eat "type"
      const nameToken = this.peek();
      let name = "";
      if (nameToken?.type === "identifier") {
        name = nameToken.value;
        this.consume();
      }
      this.expect("operator", "=");
      const type = this.parseUnionType();
      if (this.match("punctuator", ";")) {
        this.consume();
      }
      return { kind: "typealias", name, type, pos };
    }
    if (this.match("keyword", "enum")) {
      return this.parseEnumStatement();
    }
    const assign = this.tryParseAssign();
    if (assign) return assign;
  }

  /**
   * After parsing an LValue target and confirming `=` or `+=`, consume the operator,
   * parse the RHS value, and return the final assign AST node.
   * `+=` is lowered to `assign(target, binary("+", target, value))`.
   */
  private finishAssign(
    target: LValue,
    op: string,
    pos: { line: number; column: number },
  ): AstNode {
    this.consume(); // = or +=
    const value = this.parseExpression();
    if (this.match("punctuator", ";")) {
      this.consume();
    }
    return this.makeAssignNode(target, op, value, pos);
  }

  /** Build an assign AST node, lowering `+=` to `assign(target, binary("+", lvalue, value))`. */
  private makeAssignNode(
    target: LValue,
    op: string,
    value: AstNode,
    pos: { line: number; column: number },
  ): AstNode {
    if (op === "+=") {
      const lhs = this.lvalueToAstNode(target);
      return {
        kind: "assign",
        target,
        value: { kind: "binary", op: "+", left: lhs, right: value, pos },
        pos,
      };
    }
    return { kind: "assign", target, value, pos };
  }

  /** Convert an LValue to an AstNode for use as an expression (e.g. in += lowering). */
  private lvalueToAstNode(lv: LValue): AstNode {
    switch (lv.kind) {
      case "identifier":
        return { kind: "identifier", name: lv.name, pos: lv.pos };
      case "index":
        return {
          kind: "index",
          target: this.lvalueToAstNode(lv.target),
          index: lv.index,
          pos: lv.pos,
        };
      case "deref":
        return { kind: "unary", op: "*", operand: lv.operand, pos: lv.pos };
    }
  }

  /** Try to parse `identifier = expression`, `identifier += expression`, `*expr = expression`, `*expr += expression`, or `identifier[index] = expression` as an assignment statement. Returns undefined if not an assignment. */
  private tryParseAssign(): AstNode | undefined {
    // Check for `identifier[index] = value` (array index assignment)
    if (this.match("identifier")) {
      const savedPos = this.pos;
      const nameToken = this.peek()!;
      const pos = (nameToken as { pos: { line: number; column: number } }).pos;
      this.consume(); // identifier
      // Check for `[index]` postfix
      if (this.match("group", "[")) {
        this.consume(); // [
        const index = this.parseExpression();
        this.expect("group", "]");
        const nextToken = this.peek();
        if (
          nextToken?.type === "operator" &&
          (nextToken.value === "=" || nextToken.value === "+=")
        ) {
          const target: LValue = {
            kind: "index",
            target: {
              kind: "identifier",
              name: nameToken.value as string,
              pos,
            },
            index,
            pos,
          };
          return this.finishAssign(target, nextToken.value, pos);
        }
      }
      // Not an index assignment — restore position
      this.pos = savedPos;
    }

    // Check for `*expr = value` or `*expr += value` (deref assignment) — look ahead without consuming
    if (this.match("operator", "*") && this.isUnaryContext()) {
      const savedPos = this.pos;
      const starToken = this.tokens[this.pos]!;
      this.consume(); // *
      const operand = this.parseUnary();
      const nextToken = this.peek();
      if (
        nextToken?.type === "operator" &&
        (nextToken.value === "=" || nextToken.value === "+=")
      ) {
        const target: LValue = {
          kind: "deref",
          operand,
          pos: starToken.pos,
        };
        return this.finishAssign(target, nextToken.value, starToken.pos);
      }
      // Not an assignment — restore position
      this.pos = savedPos;
    }

    // Check for `identifier = value` or `identifier += value`
    if (!this.match("identifier")) return;
    const nameToken = this.peek()!;
    const pos = (nameToken as { pos: { line: number; column: number } }).pos;
    const nextPos = this.pos + 1;
    const nextToken = this.tokens[nextPos];
    if (nextToken?.type !== "operator") return;
    const op = nextToken.value;
    if (op !== "=" && op !== "+=") return;
    this.consume(); // identifier
    this.consume(); // operator
    const value = this.parseExpression();
    if (this.match("punctuator", ";")) {
      this.consume();
    }
    const target: LValue = {
      kind: "identifier",
      name: nameToken.value as string,
      pos,
    };
    return this.makeAssignNode(target, op, value, pos);
  }

  private parseLetStatement(): AstNode {
    const pos = this.peek()?.pos;
    this.consume(); // eat "let"
    const mutable = this.match("keyword", "mut");
    if (mutable) this.consume();
    const nameToken = this.peek();
    let name = "";
    if (nameToken?.type === "identifier") {
      name = nameToken.value;
      this.consume();
    }
    // Parse optional type annotation: `: TypeName`
    const declaredType = this.parseTypeAnnotation();
    if (this.match("operator", "=")) {
      this.consume();
    }
    const value = this.parseExpression();
    if (this.match("punctuator", ";")) {
      this.consume();
    }
    return { kind: "let", name, value, mutable, type: declaredType, pos };
  }

  /** Parse optional `: TypeName`, `: &mut TypeName`, `: &TypeName`, `: [TypeName; N]`, or `: T1 | T2 | ...`. */
  private parseTypeAnnotation(): Type | undefined {
    if (this.match("punctuator", ":")) {
      this.consume();
      return this.parseUnionType();
    }
    return undefined;
  }

  /** Parse a type expression: identifier, array `[T; N]`, pointer `&mut T` / `&T`, or tuple `(T1, T2, ...)`. */
  private parseType(): Type | undefined {
    // Array type: `[TypeName; N]`
    if (this.match("group", "[")) {
      this.consume();
      const inner = this.parseType();
      this.expect("punctuator", ";");
      const lengthToken = this.peek();
      if (lengthToken?.type === "number") {
        this.consume();
        this.expect("group", "]");
        return arrayType(inner!, lengthToken.value);
      }
    }
    // Pointer type: `&mut T` or `&T`
    if (this.match("operator", "&")) {
      this.consume();
      const mutable = this.match("keyword", "mut");
      if (mutable) this.consume();
      const inner = this.parseType();
      return pointer(inner!, mutable);
    }
    // Tuple type: `(T1, T2, ...)` — check for `(` followed by type and comma
    if (this.match("group", "(")) {
      const savedPos = this.pos;
      this.consume();
      const first = this.parseType();
      if (this.match("punctuator", ",")) {
        // Tuple type
        this.consume(); // eat comma
        const elements: Type[] = [first!];
        while (!this.match("group", ")")) {
          elements.push(this.parseType()!);
          if (this.match("punctuator", ",")) {
            this.consume();
          }
        }
        this.expect("group", ")");
        return tupleType(elements);
      }
      // Not a tuple type — restore
      this.pos = savedPos;
    }
    // Simple type name — produce unresolved placeholder
    const typeToken = this.peek();
    if (typeToken?.type === "identifier") {
      this.consume();
      return { kind: "unresolved", name: typeToken.value, pos: typeToken.pos };
    }
    return undefined;
  }

  /** Parse a union type: `Type | Type | ...` or a single type. */
  private parseUnionType(): Type {
    const first = this.parseType();
    if (this.match("operator", "|")) {
      this.consume();
      const variants: Type[] = [first!];
      while (!this.match("punctuator", ";") && !this.match("punctuator", ":") && !this.match("operator", "=") && !this.match("group", ")")) {
        variants.push(this.parseType()!);
        if (this.match("operator", "|")) {
          this.consume();
        }
      }
      return unionType(variants);
    }
    return first!;
  }

  /** Parse `fn name<T>(params) => body`. */
  private parseFnStatement(): AstNode {
    const { name, pos } = this.parseKeywordAndName("fn");
    // Parse optional type parameters: `<T>` or `<T, U>`
    const typeParams: string[] = [];
    if (this.match("operator", "<")) {
      this.consume();
      while (!this.match("operator", ">")) {
        const tpToken = this.peek();
        if (tpToken?.type === "identifier") {
          this.consume();
          typeParams.push(tpToken.value);
          if (this.match("punctuator", ",")) {
            this.consume();
          }
        } else {
          break;
        }
      }
      this.expect("operator", ">");
    }
    // Parse parameters: `(param1 : Type1, param2 : Type2, ...)`
    this.expect("group", "(");
    const params: { name: string; type: Type }[] = [];
    while (!this.match("group", ")")) {
      const paramToken = this.peek();
      if (paramToken?.type === "identifier") {
        this.consume();
        this.expect("punctuator", ":");
        const paramType = this.parseType();
        if (!paramType) {
          throw new InterpreterError(
            "parse",
            "Function parameter must have a type annotation",
            paramToken.pos,
          );
        }
        params.push({ name: paramToken.value, type: paramType });
        if (this.match("punctuator", ",")) {
          this.consume();
        }
      } else {
        break;
      }
    }
    this.expect("group", ")");
    // Optional return type annotation: `: TypeName`
    const returnType = this.parseTypeAnnotation();
    // Parse `=>`
    this.expect("operator", "=>");
    const body = this.parseExpression();
    if (this.match("punctuator", ";")) {
      this.consume();
    }
    return { kind: "fn", name, typeParams: typeParams.length > 0 ? typeParams : undefined, params, returnType, body, pos };
  }

  /** Parse `match (expr) { case pattern => body; ... }`. */
  private parseMatchExpression(): AstNode {
    const pos = this.peek()?.pos;
    // Parse target expression: `match (expr)`
    this.expect("group", "(");
    const target = this.parseExpression();
    this.expect("group", ")");
    // Parse cases: `{ case pattern => body; ... }`
    this.expect("group", "{");
    const cases: { pattern: AstNode | "_"; body: AstNode }[] = [];
    while (!this.match("group", "}")) {
      this.expect("keyword", "case");
      // Check for wildcard pattern
      const next = this.peek();
      if (next?.type === "identifier" && next.value === "_") {
        this.consume();
        this.expect("operator", "=>");
        const body = this.parseExpression();
        cases.push({ pattern: "_", body });
      } else {
        const pattern = this.parseExpression();
        this.expect("operator", "=>");
        const body = this.parseExpression();
        cases.push({ pattern, body });
      }
      if (this.match("punctuator", ";")) {
        this.consume();
      }
    }
    this.expect("group", "}");
    return { kind: "match", target, cases, pos };
  }

  /** Parse `enum Name { Variant1, Variant2, ... }`. */
  private parseEnumStatement(): AstNode {
    const { name, pos } = this.parseKeywordAndName("enum");
    this.expect("group", "{");
    const variants: string[] = [];
    while (!this.match("group", "}")) {
      const variantToken = this.peek();
      if (variantToken?.type === "identifier") {
        this.consume();
        variants.push(variantToken.value);
      }
      if (this.match("punctuator", ",")) {
        this.consume();
      }
    }
    this.expect("group", "}");
    return { kind: "enum", name, variants, pos };
  }

  /** Parse `struct Name { field1 : Type1, field2 : Type2, ... }`. */
  private parseStructStatement(): AstNode {
    const { name, pos } = this.parseKeywordAndName("struct");
    this.expect("group", "{");
    const fields: { name: string; type?: Type }[] = [];
    while (!this.match("group", "}")) {
      const fieldToken = this.peek();
      if (fieldToken?.type === "identifier") {
        this.consume();
        const fieldType = this.parseTypeAnnotation();
        fields.push({ name: fieldToken.value, type: fieldType });
        if (this.match("punctuator", ",")) {
          this.consume();
        }
      } else {
        break;
      }
    }
    this.expect("group", "}");
    return { kind: "struct", name, fields, pos };
  }

  private parseAtom(): AstNode {
    if (this.match("number")) {
      const t = this.consume()!;
      if (!isNumberToken(t))
        throw new InterpreterError("parse", "Expected number token", t.pos);
      return {
        kind: "number",
        value: t.value,
        type: t.typeSuffix
          ? { kind: "unresolved", name: t.typeSuffix, pos: t.pos }
          : undefined,
        pos: t.pos,
      };
    }
    if (this.match("keyword", "true")) {
      const t = this.consume()!;
      return { kind: "boolean", value: true, pos: t.pos };
    }
    if (this.match("keyword", "false")) {
      const t = this.consume()!;
      return { kind: "boolean", value: false, pos: t.pos };
    }
    if (this.match("keyword", "if")) {
      return this.parseIfExpression();
    }
    if (this.match("keyword", "match")) {
      this.consume();
      return this.parseMatchExpression();
    }
    if (this.match("keyword", "loop")) {
      return this.parseLoopExpression();
    }
    if (this.match("identifier")) {
      const t = this.consume()!;
      if (!isIdentifierToken(t))
        throw new InterpreterError("parse", "Expected identifier token", t.pos);
      const name = t.value;
      const pos = t.pos;
      // Check for function call: `identifier(args)`
      if (this.match("group", "(")) {
        this.consume();
        const args: AstNode[] = [];
        while (!this.match("group", ")")) {
          args.push(this.parseExpression());
          if (this.match("punctuator", ",")) {
            this.consume();
          }
        }
        this.expect("group", ")");
        return {
          kind: "call",
          callee: { kind: "identifier", name, pos },
          args,
          pos,
        };
      }
      // Check for struct instantiation: `Name { field: value, ... }`
      if (this.match("group", "{")) {
        this.consume();
        const fields: { name: string; value: AstNode }[] = [];
        while (!this.match("group", "}")) {
          const fieldToken = this.peek();
          if (fieldToken?.type === "identifier") {
            this.consume();
            this.expect("punctuator", ":");
            const value = this.parseExpression();
            fields.push({ name: fieldToken.value, value });
            if (this.match("punctuator", ",")) {
              this.consume();
            }
          } else {
            break;
          }
        }
        this.expect("group", "}");
        return {
          kind: "struct_instantiation",
          name,
          fields,
          pos,
        };
      }
      return { kind: "identifier", name, pos };
    }
    // Array literal: `[expr, expr, ...]`
    if (this.match("group", "[")) {
      const pos = this.peek()?.pos;
      this.consume();
      const elements: AstNode[] = [];
      while (!this.match("group", "]")) {
        if (this.match("punctuator", ",")) {
          this.consume();
          continue;
        }
        elements.push(this.parseExpression());
      }
      this.expect("group", "]");
      return { kind: "array", elements, pos };
    }
    const token = this.peek();
    if (token?.type === "group" && token.value in OPENING) {
      this.consume();
      if (token.value === "{") {
        return this.parseBlock();
      }
      // Check if this is a tuple: `(expr, expr, ...)` vs `(expr)`
      const savedPos = this.pos;
      const first = this.parseExpression();
      if (this.match("punctuator", ",")) {
        // Tuple literal
        this.consume(); // eat comma
        const elements: AstNode[] = [first];
        while (!this.match("group", ")")) {
          elements.push(this.parseExpression());
          if (this.match("punctuator", ",")) {
            this.consume();
          }
        }
        this.expect("group", ")");
        return { kind: "tuple", elements, pos: first.pos };
      }
      // Not a tuple — restore and return parenthesized expression
      this.pos = savedPos;
      const node = this.parseExpression();
      if (this.match("group", OPENING[token.value])) {
        this.consume();
      }
      return node;
    }
    throw new InterpreterError(
      "parse",
      `Unexpected token: ${token?.value}`,
      token?.pos ?? { line: 1, column: 1 },
    );
  }

  /** Check if the previous token indicates a unary context (start, operator, opening brace). */
  private isUnaryContext(): boolean {
    if (this.pos === 0) return true;
    const prev = this.tokens[this.pos - 1];
    if (!prev) return true;
    if (prev.type === "operator") return true;
    if (prev.type === "group" && (prev.value === "(" || prev.value === "{"))
      return true;
    if (prev.type === "punctuator") return true;
    return false;
  }

  /** Parse unary expressions: `-expr`, `&expr` (ref), `&mut expr` (mutable ref), `*expr` (deref in unary context only). */
  private parseUnary(): AstNode {
    if (this.match("operator", "-")) {
      const opToken = this.consume()!;
      const operand = this.parseUnary();
      return { kind: "unary", op: "-", operand, pos: opToken.pos };
    }
    if (this.match("operator", "&")) {
      const opToken = this.consume()!;
      if (this.match("keyword", "mut")) {
        this.consume();
        const operand = this.parseUnary();
        return { kind: "unary", op: "&mut", operand, pos: opToken.pos };
      }
      const operand = this.parseUnary();
      return { kind: "unary", op: "&", operand, pos: opToken.pos };
    }
    // `*` is only unary (deref) in a unary context. Otherwise it's binary multiplication.
    if (this.match("operator", "*") && this.isUnaryContext()) {
      const opToken = this.consume()!;
      const operand = this.parseUnary();
      return { kind: "unary", op: "*", operand, pos: opToken.pos };
    }
    let node = this.parseAtom();
    // Handle postfix `is TypeName` — supports chaining: `expr is T1 is T2`
    while (this.match("keyword", "is")) {
      this.consume();
      const typeToken = this.peek();
      if (typeToken?.type === "identifier") {
        this.consume();
        node = {
          kind: "typecheck",
          value: node,
          type: {
            kind: "unresolved",
            name: typeToken.value,
            pos: typeToken.pos,
          },
          pos: node.pos,
        };
      } else {
        break;
      }
    }
    // Handle postfix `[index]` — supports chaining: `arr[0][1]`
    while (this.match("group", "[")) {
      const pos = node.pos;
      this.consume(); // [
      const index = this.parseExpression();
      this.expect("group", "]");
      node = { kind: "index", target: node, index, pos };
    }
    // Handle postfix `.field` (struct) or `.N` (tuple index) — supports chaining
    while (this.match("punctuator", ".")) {
      this.consume(); // .
      const fieldToken = this.peek();
      if (fieldToken?.type === "identifier") {
        this.consume();
        node = {
          kind: "field_access",
          target: node,
          field: fieldToken.value,
          pos: node.pos,
        };
      } else if (fieldToken?.type === "number" && isNumberToken(fieldToken)) {
        this.consume();
        node = {
          kind: "tuple_access",
          target: node,
          index: fieldToken.value,
          pos: node.pos,
        };
      } else {
        break;
      }
    }
    // Handle postfix `::Variant` (enum variant access)
    while (this.match("punctuator", "::")) {
      this.consume(); // ::
      const variantToken = this.peek();
      if (variantToken?.type === "identifier") {
        this.consume();
        const enumName =
          node.kind === "enum_access"
            ? node.enum
            : node.kind === "identifier"
              ? node.name
              : "";
        node = {
          kind: "enum_access",
          enum: enumName,
          variant: variantToken.value,
          pos: node.pos,
        };
      } else {
        break;
      }
    }
    return node;
  }

  private parseCondition(): AstNode {
    this.expect("group", "(");
    const condition = this.parseExpression();
    this.expect("group", ")");
    return condition;
  }

  private parseIfExpression(): AstNode {
    const pos = this.peek()?.pos;
    this.consume(); // eat "if"
    const condition = this.parseCondition();
    const thenBranch = this.parseExpression();
    this.expect("keyword", "else");
    const elseBranch = this.parseExpression();
    return { kind: "if", condition, then: thenBranch, elseBranch, pos };
  }

  private parseIfStatement(): AstNode {
    this.consume(); // eat "if"
    const pos = this.peek()?.pos;
    const condition = this.parseCondition();
    const thenBranch = this.parseStatement();
    if (this.match("keyword", "else")) {
      this.consume();
      if (this.match("keyword", "if")) {
        const elseBranch = this.parseIfStatement();
        return { kind: "if", condition, then: thenBranch, elseBranch, pos };
      }
      const elseBranch = this.parseStatement();
      return { kind: "if", condition, then: thenBranch, elseBranch, pos };
    }
    return {
      kind: "if",
      condition,
      then: thenBranch,
      elseBranch: { kind: "number", value: 0 },
      pos,
    };
  }

  private parseWhileStatement(): AstNode {
    const pos = this.peek()?.pos;
    this.consume(); // eat "while"
    const condition = this.parseCondition();
    this.expect("group", "{");
    const body = this.collectUntilBrace();
    return { kind: "while", condition, body, pos };
  }

  private parseLoopExpression(): AstNode {
    const pos = this.peek()?.pos;
    this.consume(); // eat "loop"
    this.expect("group", "{");
    const body = this.collectUntilBrace();
    return { kind: "loop", body, pos };
  }

  /**
   * Table-driven binary expression parser.
   * `level` indexes into PRECEDENCE (lowest first).
   * `lower` is the highest-precedence parser (atom).
   */
  private parseBinary(level: number, lower: () => AstNode): AstNode {
    if (level >= PRECEDENCE.length) return lower();
    const ops = PRECEDENCE[level]!;
    let node = this.parseBinary(level + 1, lower);
    while (this.pos < this.tokens.length) {
      const op = this.peek();
      if (op?.type === "operator" && ops.includes(op.value as string)) {
        this.consume();
        const right = this.parseBinary(level + 1, lower);
        node = {
          kind: "binary",
          op: op.value as BinaryOp,
          left: node,
          right,
          pos: node.pos,
        };
      } else {
        break;
      }
    }
    return node;
  }

  private parseExpression(): AstNode {
    return this.parseBinary(0, () => this.parseUnary());
  }
}

/**
 * Parse a token array into an AST node using recursive descent.
 *
 * Grammar (simplified):
 *   statement : let_decl | expression
 *   let_decl  : "let" IDENT "=" expression ";"
 *   block     : "{" statement* "}"
 *   expression: binary_op_chain
 *   atom      : NUMBER | IDENT | "(" expression ")" | block
 */
export function parse(tokens: Token[]): AstNode {
  return new Parser(tokens).parse();
}
