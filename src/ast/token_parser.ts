import type { Token } from "./tokens";
import type {
  ASTStatement,
  ASTExpression,
  LetStatement,
  IfStatement,
  WhileStatement,
  ForStatement,
  BlockStatement,
  FnDeclaration,
  StructDeclaration,
  TypeAliasDecl,
  YieldStatement,
  AssignmentASTStatement,
  ImportASTStatement,
  ExternASTStatement,
  ASTAssignmentTarget,
} from "./nodes";
import { parseExpressionImpl, type ParserContext } from "./expr_parser";

/**
 * Parser that converts tokens to AST nodes
 */
export class TokenParser implements ParserContext {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  isAtEnd(): boolean {
    return this.peek().kind === "eof";
  }

  peek(offset = 0): Token {
    const idx = this.pos + offset;
    if (idx >= this.tokens.length) return this.tokens[this.tokens.length - 1];
    return this.tokens[idx];
  }

  advance(): Token {
    if (!this.isAtEnd()) this.pos++;
    return this.tokens[this.pos - 1];
  }

  check(kind: string, value?: string): boolean {
    if (this.isAtEnd()) return false;
    const token = this.peek();
    if (token.kind !== kind) return false;
    if (value !== undefined && token.value !== value) return false;
    return true;
  }

  checkKeyword(kw: string): boolean {
    const token = this.peek();
    return token.kind === "keyword" && token.value === kw;
  }

  match(kind: string, value?: string): boolean {
    if (this.check(kind, value)) {
      this.advance();
      return true;
    }
    return false;
  }

  matchKeyword(kw: string): boolean {
    if (this.checkKeyword(kw)) {
      this.advance();
      return true;
    }
    return false;
  }

  consume(kind: string, value?: string, msg?: string): Token {
    if (this.check(kind, value)) return this.advance();
    throw new Error(msg ?? `Expected ${kind}${value ? ` '${value}'` : ""}`);
  }

  /**
   * Parse a complete program into AST statements
   */
  parseProgram(): ASTStatement[] {
    return this.collectStatements(false);
  }

  private collectStatements(untilBrace: boolean): ASTStatement[] {
    const statements: ASTStatement[] = [];
    const shouldContinue = () =>
      untilBrace
        ? !this.check("delimiter", "}") && !this.isAtEnd()
        : !this.isAtEnd();
    while (shouldContinue()) {
      if (this.match("punctuation", ";")) continue;
      const stmt = this.parseStatement();
      if (stmt) statements.push(stmt);
    }
    return statements;
  }

  /**
   * Parse a single statement
   */
  parseStatement(): ASTStatement | undefined {
    const token = this.peek();
    const pos = token.position;

    if (token.kind === "keyword") {
      const stmt = this.parseKeywordStatement(token.value, pos);
      if (stmt) return stmt;
    }

    if (this.check("delimiter", "{")) {
      return this.parseBlockStatement(pos);
    }

    return this.parseExpressionOrAssignment(pos);
  }

  private parseKeywordStatement(
    keyword: string,
    pos: number
  ): ASTStatement | undefined {
    switch (keyword) {
      case "let":
        return this.parseLetStatement(pos);
      case "if":
        return this.parseIfStatement(pos);
      case "while":
        return this.parseWhileStatement(pos);
      case "for":
        return this.parseForStatement(pos);
      case "fn":
      case "out":
        return this.parseFnDeclaration(pos);
      case "struct":
        return this.parseStructDeclaration(pos);
      case "type":
        return this.parseTypeAlias(pos);
      case "yield":
        return this.parseYieldStatement(pos);
      case "extern":
      case "from":
        return this.parseExternOrImport(pos);
      default:
        return undefined;
    }
  }

  private parseExpressionOrAssignment(pos: number): ASTStatement {
    const expr = this.parseExpression();

    if (this.isAssignmentOp()) {
      return this.parseAssignmentFromExpr(expr, pos);
    }

    this.match("punctuation", ";");
    return { kind: "expression", expr, position: pos };
  }

  private isAssignmentOp(): boolean {
    return (
      this.check("punctuation", "=") ||
      this.check("operator", "+=") ||
      this.check("operator", "-=") ||
      this.check("operator", "*=") ||
      this.check("operator", "/=") ||
      this.check("operator", "%=")
    );
  }

  private parseLetStatement(pos: number): LetStatement {
    this.advance();
    const isMutable = this.matchKeyword("mut");
    const nameToken = this.consume(
      "identifier",
      undefined,
      "Expected identifier"
    );
    const name = nameToken.value;

    let annotation: string | undefined;
    if (this.match("punctuation", ":")) {
      annotation = this.parseTypeAnnotation();
    }

    let rhs: ASTExpression | undefined;
    if (this.match("punctuation", "=")) {
      rhs = this.parseExpression();
    }

    const isDeclOnly = rhs === undefined;
    this.match("punctuation", ";");

    return {
      kind: "let",
      name,
      annotation,
      isMutable,
      isDeclOnly,
      rhs,
      position: pos,
    };
  }

  private parseConditionExpr(): ASTExpression {
    this.consume("delimiter", "(", "Expected '('");
    const cond = this.parseExpression();
    this.consume("delimiter", ")", "Expected ')'");
    return cond;
  }

  private parseIfStatement(pos: number): IfStatement {
    this.advance();
    const condition = this.parseConditionExpr();
    const trueBranch = this.parseBody();
    let falseBranch: ASTStatement[] | undefined;

    if (this.matchKeyword("else")) {
      if (this.checkKeyword("if")) {
        const elseIf = this.parseIfStatement(this.peek().position);
        falseBranch = [elseIf];
      } else {
        falseBranch = this.parseBody();
      }
    }

    return { kind: "if", condition, trueBranch, falseBranch, position: pos };
  }

  private parseWhileStatement(pos: number): WhileStatement {
    this.advance();
    const condition = this.parseConditionExpr();
    const body = this.parseBody();
    return { kind: "while", condition, body, position: pos };
  }

  private parseForStatement(pos: number): ForStatement {
    this.advance();
    this.consume("delimiter", "(", "Expected '('");
    this.consume("keyword", "let", "Expected 'let'");
    const isMutable = this.matchKeyword("mut");

    const loopVarToken = this.consume(
      "identifier",
      undefined,
      "Expected loop variable"
    );
    const loopVar = loopVarToken.value;

    this.consume("keyword", "in", "Expected 'in'");
    const startExpr = this.parseExpression();
    this.consume("operator", "..", "Expected '..'");
    const endExpr = this.parseExpression();

    this.consume("delimiter", ")", "Expected ')'");
    const body = this.parseBody();

    return {
      kind: "for",
      loopVar,
      isMutable,
      startExpr,
      endExpr,
      body,
      position: pos,
    };
  }

  private parseFnDeclaration(pos: number): FnDeclaration {
    const isOut = this.matchKeyword("out");
    if (isOut) this.consume("keyword", "fn", "Expected 'fn'");
    else this.advance();

    const nameToken = this.consume(
      "identifier",
      undefined,
      "Expected function name"
    );
    const name = nameToken.value;

    this.consume("delimiter", "(", "Expected '('");
    const params = this.parseFnParams();
    this.advance();

    let resultAnnotation: string | undefined;
    if (this.match("punctuation", ":")) {
      resultAnnotation = this.parseTypeAnnotation();
    }

    const fnBody = this.parseFnBody();

    return {
      kind: "fn",
      name,
      params,
      resultAnnotation,
      body: fnBody.body,
      isBlock: fnBody.isBlock,
      position: pos,
    };
  }

  private parseFnParams(): Array<{ name: string; annotation?: string }> {
    const params: Array<{ name: string; annotation?: string }> = [];
    while (!this.check("delimiter", ")")) {
      const paramToken = this.consume(
        "identifier",
        undefined,
        "Expected parameter name"
      );
      let annotation: string | undefined;
      if (this.match("punctuation", ":")) {
        annotation = this.parseTypeAnnotation();
      }
      params.push({ name: paramToken.value, annotation });
      if (!this.check("delimiter", ")")) {
        this.consume("punctuation", ",", "Expected ','");
      }
    }
    return params;
  }

  private parseFnBody(): {
    body: ASTStatement[] | ASTExpression;
    isBlock: boolean;
  } {
    if (this.match("operator", "=>")) {
      if (this.check("delimiter", "{")) {
        return { body: this.parseBody(), isBlock: true };
      }
      return { body: this.parseExpression(), isBlock: false };
    }
    if (this.check("delimiter", "{")) {
      return { body: this.parseBody(), isBlock: true };
    }
    throw new Error("Expected '=>' or '{'");
  }

  parseFieldList<T>(parseValue: () => T): Array<{ name: string; val: T }> {
    const fields: Array<{ name: string; val: T }> = [];
    while (!this.check("delimiter", "}")) {
      const name = this.consume(
        "identifier",
        undefined,
        "Expected field name"
      ).value;
      this.consume("punctuation", ":", "Expected ':'");
      const val = parseValue();
      fields.push({ name, val });
      if (!this.check("delimiter", "}"))
        this.consume("punctuation", ",", "Expected ','");
    }
    return fields;
  }

  private parseTypedFieldList(): Array<{ name: string; annotation: string }> {
    return this.parseFieldList(() => this.parseTypeAnnotation()).map((f) => ({
      name: f.name,
      annotation: f.val,
    }));
  }

  private parseStructDeclaration(pos: number): StructDeclaration {
    this.advance();
    const nameToken = this.consume(
      "identifier",
      undefined,
      "Expected struct name"
    );
    const name = nameToken.value;
    this.consume("delimiter", "{", "Expected '{'");
    const fields = this.parseTypedFieldList();
    this.advance();
    return { kind: "struct", name, fields, position: pos };
  }

  private parseTypeAlias(pos: number): TypeAliasDecl {
    this.advance();
    const nameToken = this.consume(
      "identifier",
      undefined,
      "Expected type name"
    );
    const name = nameToken.value;

    this.consume("punctuation", "=", "Expected '='");
    const aliasedType = this.parseTypeAnnotation();
    this.match("punctuation", ";");

    return { kind: "type", name, aliasedType, position: pos };
  }

  private parseYieldStatement(pos: number): YieldStatement {
    this.advance();
    const expr = this.parseExpression();
    this.match("punctuation", ";");
    return { kind: "yield", expr, position: pos };
  }

  private parseExternDecl(
    subKind: "fn" | "let",
    pos: number
  ): ExternASTStatement {
    this.advance();
    const msg =
      subKind === "fn" ? "Expected function name" : "Expected variable name";
    const nameToken = this.consume("identifier", undefined, msg);
    const annotation = this.match("punctuation", ":")
      ? this.parseTypeAnnotation()
      : undefined;
    this.match("punctuation", ";");
    return {
      kind: "extern",
      subKind,
      name: nameToken.value,
      annotation,
      position: pos,
    };
  }

  private parseExternOrImport(
    pos: number
  ): ExternASTStatement | ImportASTStatement {
    if (this.checkKeyword("extern")) {
      this.advance();
      if (this.checkKeyword("fn")) return this.parseExternDecl("fn", pos);
      if (this.checkKeyword("let")) return this.parseExternDecl("let", pos);
    }

    this.advance();
    const fromStr = this.consume(
      "literal",
      undefined,
      "Expected module name"
    ).value;
    this.consume("keyword", "use", "Expected 'use'");
    const items: Array<{ name: string; alias?: string }> = [];

    do {
      const itemToken = this.consume(
        "identifier",
        undefined,
        "Expected import name"
      );
      let alias: string | undefined;
      if (this.matchKeyword("as")) {
        alias = this.consume("identifier", undefined, "Expected alias").value;
      }
      items.push({ name: itemToken.value, alias });
    } while (this.match("punctuation", ","));

    this.match("punctuation", ";");
    return { kind: "import", items, from: fromStr, position: pos };
  }

  private parseBlockStatement(pos: number): BlockStatement {
    this.consume("delimiter", "{", "Expected '{'");
    const statements = this.collectStatements(true);
    this.consume("delimiter", "}", "Expected '}'");
    return { kind: "block", statements, position: pos };
  }

  private parseAssignmentFromExpr(
    lhs: ASTExpression,
    pos: number
  ): AssignmentASTStatement {
    let operator: string | undefined;
    if (this.match("punctuation", "=")) {
      operator = undefined;
    } else {
      const opToken = this.advance();
      operator = opToken.value.replace("=", "");
    }

    const value = this.parseExpression();
    this.match("punctuation", ";");

    const target = this.exprToTarget(lhs);
    return { kind: "assignment", target, value, operator, position: pos };
  }

  private exprToTarget(expr: ASTExpression): ASTAssignmentTarget {
    if (expr.kind === "identifier") {
      return { type: "identifier", name: expr.name };
    }
    if (expr.kind === "member") {
      return { type: "field", object: expr.object, field: expr.property };
    }
    if (expr.kind === "index") {
      return { type: "index", object: expr.object, index: expr.index };
    }
    if (expr.kind === "unary" && expr.operator === "*") {
      return { type: "deref", object: expr.operand };
    }
    throw new Error("Invalid assignment target");
  }

  private parseBody(): ASTStatement[] {
    if (this.check("delimiter", "{")) {
      const block = this.parseBlockStatement(this.peek().position);
      return block.statements;
    }
    const stmt = this.parseStatement();
    return stmt ? [stmt] : [];
  }

  private parseTypeAnnotation(): string {
    let annotation = "";
    let depth = 0;

    while (!this.isAtEnd()) {
      const token = this.peek();
      if (depth === 0 && this.isTypeAnnotationEnd()) break;

      if (token.value === "[" || token.value === "(") depth++;
      if (token.value === "]" || token.value === ")") depth--;

      if (annotation && ![".", "[", "]", "(", ")"].includes(token.value)) {
        annotation += " ";
      }
      annotation += token.value;
      this.advance();
    }

    return annotation.trim();
  }

  private isTypeAnnotationEnd(): boolean {
    return (
      this.check("punctuation", ";") ||
      this.check("punctuation", ",") ||
      this.check("punctuation", "=") ||
      this.check("operator", "=>") ||
      this.check("delimiter", ")") ||
      this.check("delimiter", "}")
    );
  }

  // ============= EXPRESSION PARSING =============

  parseExpression(): ASTExpression {
    return parseExpressionImpl(this);
  }
}
