import type {
  BlockExpr,
  BreakStmt,
  Expr,
  FnDecl,
  IfExpr,
  IfStmt,
  LetDecl,
  LoopExpr,
  LoopStmt,
  MatchExpr,
  MatchPattern,
  ParamDecl,
  Program,
  Stmt,
  TopLevelItem,
  TypeExpr,
  TypeUnionDecl,
  YieldStmt,
} from "./ast";
import type { Token } from "./tokens";
import { Diagnostics } from "./diagnostics";

const PRECEDENCE: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
  "::": 9,
};

export class Parser {
  private i = 0;

  constructor(
    private readonly filePath: string,
    private readonly tokens: Token[],
    private readonly diags: Diagnostics
  ) {}

  parseProgram(): Program {
    const items: TopLevelItem[] = [];
    this.skipSeparators();
    while (!this.is("eof")) {
      const item = this.parseTopLevelItem();
      if (item) items.push(item);
      this.skipSeparators();
    }
    return this.node("Program", 0, this.tokens.at(-1)?.end ?? 0, { items });
  }

  private parseTopLevelItem(): TopLevelItem | undefined {
    if (this.isKw("import")) return this.parseImportDecl();
    if (this.isKw("from")) return this.parseFromUseDecl(false);
    if (this.isKw("extern") && this.peekKw("from", 1)) {
      return this.parseExternFromUseDecl();
    }
    if (this.isKw("module")) return this.parseModuleDecl();
    if (this.isKw("type")) return this.parseTypeUnionDecl();
    if (this.isKw("let")) return this.parseLetDecl();
    if (this.isKw("fn") || this.isKw("class")) return this.parseFnDecl(true);

    // fallback: statement as top-level (expression, etc.)
    const stmt = this.parseStmt();
    if (stmt && stmt.kind === "FnDecl") return stmt;
    // allow top-level expr statements, but do not export
    return stmt as any;
  }

  private parseImportDecl(): any {
    const startTok = this.consume("kw", "import");
    const modulePath = this.parseModulePath();
    return this.node("ImportDecl", startTok.start, this.prev().end, {
      modulePath,
    });
  }

  private parseFromUseDecl(isExtern: boolean): any {
    const startTok = this.consume("kw", isExtern ? "extern" : "from");
    if (isExtern) this.consume("kw", "from");
    const modulePath = this.parseModulePath();
    this.consume("kw", "use");
    this.consume("lbrace");
    const names: string[] = [];
    while (!this.is("rbrace") && !this.is("eof")) {
      const ident = this.consumeAnyIdent();
      names.push(ident.text);
      if (this.is("comma")) {
        this.next();
        continue;
      }
      break;
    }
    this.consume("rbrace");
    return this.node(
      isExtern ? "ExternFromUseDecl" : "FromUseDecl",
      startTok.start,
      this.prev().end,
      {
        modulePath,
        names,
      }
    );
  }

  private parseExternFromUseDecl(): any {
    return this.parseFromUseDecl(true);
  }

  private parseModuleDecl(): any {
    const start = this.consume("kw", "module");
    const name = this.consumeAnyIdent().text;
    this.consume("lbrace");
    const items: TopLevelItem[] = [];
    this.skipSeparators();
    while (!this.is("rbrace") && !this.is("eof")) {
      const it = this.parseTopLevelItem();
      if (it) items.push(it);
      this.skipSeparators();
    }
    this.consume("rbrace");
    return this.node("ModuleDecl", start.start, this.prev().end, {
      name,
      items,
    });
  }

  private parseTypeUnionDecl(): TypeUnionDecl {
    const start = this.consume("kw", "type");
    const name = this.consumeAnyIdent().text;
    const typeParams = this.parseTypeParamsOpt();
    this.consumeOp("=");
    const variants: any[] = [];
    while (
      !this.is("semicolon") &&
      !this.is("newline") &&
      !this.is("eof") &&
      !this.is("rbrace")
    ) {
      const vName = this.consumeAnyIdent().text;
      let typeArg: TypeExpr | undefined;
      if (this.is("op") && this.cur().text === "<") {
        this.next();
        typeArg = this.parseTypeExpr();
        this.consumeOp(
          ">"
          // no custom
        );
      }
      variants.push({ name: vName, typeArg });
      if (this.is("op") && this.cur().text === "|") {
        this.next();
        continue;
      }
      break;
    }
    this.consumeTerminatorOpt();
    return this.node("TypeUnionDecl", start.start, this.prev().end, {
      name,
      typeParams,
      variants,
    });
  }

  private parseLetDecl(): LetDecl {
    const start = this.consume("kw", "let");
    let mutable = false;
    if (this.isKw("mut")) {
      this.next();
      mutable = true;
    }
    const nameTok = this.consumeAnyIdent();
    let typeAnn: TypeExpr | undefined;
    if (this.is("colon")) {
      this.next();
      typeAnn = this.parseTypeExpr();
    }
    let init: Expr | undefined;
    if (this.is("op") && this.cur().text === "=") {
      this.next();
      init = this.parseExpr();
    }
    this.consumeTerminatorOpt();
    return this.node("LetDecl", start.start, this.prev().end, {
      name: nameTok.text,
      mutable,
      typeAnn,
      init,
    });
  }

  private parseFnDecl(isTopLevel: boolean): FnDecl {
    let isClass = false;
    const startTok = this.cur();
    if (this.isKw("class")) {
      this.next();
      this.consume("kw", "fn");
      isClass = true;
    } else {
      this.consume("kw", "fn");
    }

    // name is optional in expression contexts, but for now allow ident if present
    let name: string | undefined;
    if (this.is("ident")) {
      name = this.next().text;
    }

    const typeParams = this.parseTypeParamsOpt();

    this.consume("lparen");
    const params: ParamDecl[] = [];
    while (!this.is("rparen") && !this.is("eof")) {
      const pStart = this.cur();
      const pName = this.consumeAnyIdent();
      let typeAnn: TypeExpr | undefined;
      if (this.is("colon")) {
        this.next();
        typeAnn = this.parseTypeExpr();
      }
      params.push(
        this.node("ParamDecl", pStart.start, this.prev().end, {
          name: pName.text,
          typeAnn,
        })
      );
      if (this.is("comma")) {
        this.next();
        continue;
      }
      break;
    }
    this.consume("rparen");

    let returnType: TypeExpr | undefined;
    if (this.is("colon")) {
      this.next();
      returnType = this.parseTypeExpr();
    }

    // allow =>
    if (this.is("fat_arrow")) {
      this.next();
    } else {
      this.diags.error(
        `Expected '=>' after function signature`,
        this.spanOf(this.cur())
      );
    }

    const bodyExpr = this.parseExpr();
    let body: BlockExpr;
    if (bodyExpr.kind === "BlockExpr") {
      body = bodyExpr;
    } else {
      // wrap single expression as a block with tail
      body = this.node("BlockExpr", bodyExpr.span.start, bodyExpr.span.end, {
        stmts: [],
        tail: bodyExpr,
      });
    }

    if (isTopLevel) this.consumeTerminatorOpt();

    return this.node("FnDecl", startTok.start, this.prev().end, {
      name,
      isClass,
      typeParams,
      params,
      returnType,
      body,
    });
  }

  private parseStmt(): Stmt | undefined {
    this.skipSeparators();
    if (this.isKw("let")) return this.parseLetDecl();
    if (this.isKw("fn") || this.isKw("class")) return this.parseFnDecl(false);
    if (this.isKw("if")) return this.parseIfStmt();
    if (this.isKw("while")) return this.parseWhileStmt();
    if (this.isKw("loop")) return this.parseLoopStmt();
    if (this.isKw("break")) return this.parseBreakStmt();
    if (this.isKw("continue")) return this.parseContinueStmt();
    if (this.isKw("yield")) return this.parseYieldStmt();

    // assignment or expr
    const expr = this.parseExpr();
    if (!expr) return undefined;

    // assignment forms
    if (
      this.is("op") &&
      ["=", "+=", "-=", "*=", "/=", "%="].includes(this.cur().text)
    ) {
      const opTok = this.next();
      const rhs = this.parseExpr();
      this.consumeTerminatorOpt();
      return this.node("AssignStmt", expr.span.start, this.prev().end, {
        target: expr,
        op: opTok.text,
        expr: rhs,
      });
    }

    const terminated = this.consumeTerminatorOpt();
    return this.node("ExprStmt", expr.span.start, this.prev().end, {
      expr,
      terminated,
    });
  }

  private parseIfStmt(): IfStmt {
    const start = this.consume("kw", "if");
    const cond = this.parseParenExpr();
    const thenBranch = this.parseBranchStmtOrBlock();
    let elseBranch: any;
    if (this.isKw("else")) {
      this.next();
      if (this.isKw("if")) {
        elseBranch = this.parseIfStmt();
      } else {
        elseBranch = this.parseBranchStmtOrBlock();
      }
    }
    return this.node("IfStmt", start.start, this.prev().end, {
      cond,
      thenBranch,
      elseBranch,
    });
  }

  private parseWhileStmt(): any {
    const start = this.consume("kw", "while");
    const cond = this.parseParenExpr();
    const body = this.parseBranchStmtOrBlock();
    return this.node("WhileStmt", start.start, this.prev().end, { cond, body });
  }

  private parseLoopStmt(): LoopStmt {
    const start = this.consume("kw", "loop");
    const body = this.parseBranchStmtOrBlock();
    return this.node("LoopStmt", start.start, this.prev().end, {
      body,
      asExpr: false,
    });
  }

  private parseBreakStmt(): BreakStmt {
    const start = this.consume("kw", "break");
    let value: Expr | undefined;
    if (!this.isTerminatorStart()) {
      value = this.parseExpr();
    }
    this.consumeTerminatorOpt();
    return this.node("BreakStmt", start.start, this.prev().end, { value });
  }

  private parseContinueStmt(): any {
    const start = this.consume("kw", "continue");
    this.consumeTerminatorOpt();
    return this.node("ContinueStmt", start.start, this.prev().end, {});
  }

  private parseYieldStmt(): YieldStmt {
    const start = this.consume("kw", "yield");
    let value: Expr | undefined;
    if (!this.isTerminatorStart()) {
      value = this.parseExpr();
    }
    this.consumeTerminatorOpt();
    return this.node("YieldStmt", start.start, this.prev().end, { value });
  }

  private parseBranchStmtOrBlock(): Stmt | BlockExpr {
    if (this.is("lbrace")) return this.parseBlock();
    // single statement allowed
    const stmt = this.parseStmt();
    if (!stmt) {
      // empty treated as empty block
      return this.node("BlockExpr", this.cur().start, this.cur().end, {
        stmts: [],
      });
    }
    return stmt;
  }

  private parseExpr(): Expr {
    // expression entry: handle if/loop/match specially
    if (this.isKw("if")) return this.parseIfExpr();
    if (this.isKw("loop")) return this.parseLoopExpr();
    if (this.isKw("match")) return this.parseMatchExpr();
    return this.parseBinaryExpr(0);
  }

  private parseIfExpr(): IfExpr {
    const start = this.consume("kw", "if");
    const cond = this.parseParenExpr();
    const thenExpr = this.parseExpr();
    this.consume("kw", "else");
    const elseExpr = this.parseExpr();
    return this.node("IfExpr", start.start, this.prev().end, {
      cond,
      thenExpr,
      elseExpr,
    });
  }

  private parseLoopExpr(): LoopExpr {
    const start = this.consume("kw", "loop");
    const bodyExpr = this.parseBlock();
    return this.node("LoopExpr", start.start, this.prev().end, {
      body: bodyExpr,
    });
  }

  private parseMatchExpr(): MatchExpr {
    const start = this.consume("kw", "match");
    this.consume("lparen");
    const value = this.parseExpr();
    this.consume("rparen");
    this.consume("lbrace");
    this.skipSeparators();
    const arms: any[] = [];
    while (!this.is("rbrace") && !this.is("eof")) {
      const pattern = this.parseMatchPattern();
      this.consume("fat_arrow");
      const expr = this.parseExpr();
      if (this.is("comma")) this.next();
      this.skipSeparators();
      arms.push({ pattern, expr });
    }
    this.consume("rbrace");
    return this.node("MatchExpr", start.start, this.prev().end, {
      value,
      arms,
    });
  }

  private parseMatchPattern(): MatchPattern {
    if (this.is("op") && this.cur().text === "_") {
      this.next();
      return { kind: "Wildcard" };
    }
    if (this.is("string")) {
      const t = this.next();
      return { kind: "String", value: this.unquote(t.text) };
    }
    const ident = this.consumeAnyIdent().text;
    if (ident === "_") return { kind: "Wildcard" };
    return { kind: "Variant", name: ident };
  }

  private parseBinaryExpr(minPrec: number): Expr {
    let left = this.parsePostfixExpr();

    while (this.is("op") || this.is("kw", "is")) {
      const opTok = this.cur();
      const op = this.isKw("is") ? "is" : opTok.text;

      // Assignments are statements in the bootstrap compiler; keep the operator
      // available for parseStmt() to handle.
      if (ASSIGNMENT_OPS.has(op)) break;

      const prec = PRECEDENCE[op] ?? 0;
      if (prec < minPrec) break;
      this.next();
      const right = this.parseBinaryExpr(prec + 1);
      left = this.node("BinaryExpr", left.span.start, right.span.end, {
        op,
        left,
        right,
      });
    }

    return left;
  }

  private parsePostfixExpr(): Expr {
    let expr = this.parsePrimaryExpr();
    while (true) {
      if (this.is("lparen")) {
        const start = expr.span.start;
        this.next();
        const args: Expr[] = [];
        while (!this.is("rparen") && !this.is("eof")) {
          args.push(this.parseExpr());
          if (this.is("comma")) {
            this.next();
            continue;
          }
          break;
        }
        this.consume("rparen");
        expr = this.node("CallExpr", start, this.prev().end, {
          callee: expr,
          args,
        });
        continue;
      }
      if (this.is("dot")) {
        this.next();
        const member = this.consumeAnyIdent().text;
        expr = this.node("MemberExpr", expr.span.start, this.prev().end, {
          object: expr,
          member,
        });
        continue;
      }
      if (this.is("lbracket")) {
        this.next();
        const index = this.parseExpr();
        this.consume("rbracket");
        expr = this.node("IndexExpr", expr.span.start, this.prev().end, {
          object: expr,
          index,
        });
        continue;
      }
      if (this.is("op") && this.cur().text === "::") {
        // path continuation
        const parts: string[] = [];
        if (expr.kind === "IdentExpr") {
          parts.push(expr.name);
        } else if (expr.kind === "PathExpr") {
          parts.push(...expr.parts);
        } else {
          break;
        }
        while (this.is("op") && this.cur().text === "::") {
          this.next();
          parts.push(this.consumeAnyIdent().text);
        }
        expr = this.node("PathExpr", expr.span.start, this.prev().end, {
          parts,
        });
        continue;
      }
      break;
    }
    return expr;
  }

  private parsePrimaryExpr(): Expr {
    const tok = this.cur();
    if (this.is("number")) {
      const t = this.next();
      return this.node("LiteralExpr", t.start, t.end, {
        value: Number.parseFloat(t.text.replace(/[A-Za-z]+$/, "")),
        literalKind: "number",
        raw: t.text,
      });
    }
    if (this.is("string")) {
      const t = this.next();
      return this.node("LiteralExpr", t.start, t.end, {
        value: this.unquote(t.text),
        literalKind: "string",
        raw: t.text,
      });
    }
    if (this.isKw("true") || this.isKw("false")) {
      const t = this.next();
      return this.node("LiteralExpr", t.start, t.end, {
        value: t.text === "true",
        literalKind: "bool",
        raw: t.text,
      });
    }
    if (this.isKw("None")) {
      const t = this.next();
      return this.node("LiteralExpr", t.start, t.end, {
        value: null,
        literalKind: "none",
        raw: t.text,
      });
    }

    if (this.isKw("this")) {
      const t = this.next();
      return this.node("ThisExpr", t.start, t.end, {});
    }

    if (this.is("lbrace")) return this.parseBlock();

    if (this.is("lparen")) {
      const start = this.next();
      // Could be lambda params: (x: I32) =>
      // We'll parse expression then if fat_arrow follows, treat as lambda.
      const save = this.i;
      const items: any[] = [];
      let isParamList = true;
      if (!this.is("rparen")) {
        while (true) {
          if (!this.is("ident")) {
            isParamList = false;
            break;
          }
          const pStart = this.cur();
          const pName = this.next();
          let typeAnn: TypeExpr | undefined;
          if (this.is("colon")) {
            this.next();
            typeAnn = this.parseTypeExpr();
          }
          items.push(
            this.node("ParamDecl", pStart.start, this.prev().end, {
              name: pName.text,
              typeAnn,
            })
          );
          if (this.is("comma")) {
            this.next();
            continue;
          }
          break;
        }
      }
      if (isParamList && this.is("rparen")) {
        this.next();
        if (this.is("fat_arrow")) {
          this.next();
          const bodyExpr = this.parseExpr();
          let body: BlockExpr;
          if (bodyExpr.kind === "BlockExpr") body = bodyExpr;
          else
            body = this.node(
              "BlockExpr",
              bodyExpr.span.start,
              bodyExpr.span.end,
              { stmts: [], tail: bodyExpr }
            );
          return this.node("LambdaExpr", start.start, body.span.end, {
            params: items,
            body,
          });
        }
      }

      // not lambda: rewind and parse normal expression inside parens
      this.i = save;
      const expr = this.parseExpr();
      this.consume("rparen");
      return this.node("ParenExpr", start.start, this.prev().end, { expr });
    }

    // unary
    if (this.is("op") && ["-", "!", "~"].includes(tok.text)) {
      const opTok = this.next();
      const expr = this.parsePrimaryExpr();
      return this.node("UnaryExpr", opTok.start, expr.span.end, {
        op: opTok.text,
        expr,
      });
    }

    if (this.is("ident") || this.is("kw")) {
      const t = this.next();
      // keywords used as identifiers in some places (e.g. Running)
      if (t.kind === "kw" && KEYWORD_AS_IDENT.has(t.text)) {
        return this.node("IdentExpr", t.start, t.end, { name: t.text });
      }
      if (t.kind === "kw") {
        // if it wasn't a keyword-as-ident, treat as ident anyway for now
        return this.node("IdentExpr", t.start, t.end, { name: t.text });
      }
      return this.node("IdentExpr", t.start, t.end, { name: t.text });
    }

    this.diags.error(`Unexpected token '${tok.text}'`, this.spanOf(tok));
    // recovery
    this.next();
    return this.node("LiteralExpr", tok.start, tok.end, {
      value: null,
      literalKind: "none",
      raw: "None",
    });
  }

  private parseBlock(): BlockExpr {
    const start = this.consume("lbrace");
    const stmts: Stmt[] = [];
    this.skipSeparators();
    while (!this.is("rbrace") && !this.is("eof")) {
      // try parse statement
      const stmt = this.parseStmt();
      if (stmt) stmts.push(stmt);
      this.skipSeparators();
    }
    this.consume("rbrace");

    // Convert final ExprStmt without terminator into tail expression
    let tail: Expr | undefined;
    if (stmts.length > 0) {
      const last = stmts[stmts.length - 1];
      if (last.kind === "ExprStmt" && !last.terminated) {
        tail = last.expr;
        stmts.pop();
      }
    }

    return this.node("BlockExpr", start.start, this.prev().end, {
      stmts,
      tail,
    });
  }

  private parseParenExpr(): Expr {
    this.consume("lparen");
    const expr = this.parseExpr();
    this.consume("rparen");
    return expr;
  }

  private parseTypeExpr(): TypeExpr {
    // minimal: identifiers + generic args + tuples + slice + array
    const start = this.cur();

    if (this.is("lparen")) {
      this.next();
      const items: TypeExpr[] = [];
      while (!this.is("rparen") && !this.is("eof")) {
        items.push(this.parseTypeExpr());
        if (this.is("comma")) {
          this.next();
          continue;
        }
        break;
      }
      this.consume("rparen");
      // function type? (A,B)=>C
      if (this.is("fat_arrow")) {
        this.next();
        const ret = this.parseTypeExpr();
        return this.node("TypeFunction", start.start, ret.span.end, {
          params: items,
          ret,
        });
      }
      return this.node("TypeTuple", start.start, this.prev().end, { items });
    }

    if (this.is("op") && this.cur().text === "*") {
      this.next();
      this.consume("lbracket");
      const elem = this.parseTypeExpr();
      this.consume("rbracket");
      return this.node("TypeSlice", start.start, this.prev().end, { elem });
    }

    if (this.is("lbracket")) {
      // [T; init; len]
      this.next();
      const elem = this.parseTypeExpr();
      this.consume("semicolon");
      const initTok = this.consume("number");
      this.consume("semicolon");
      const lenTok = this.consume("number");
      this.consume("rbracket");
      return this.node("TypeArray", start.start, this.prev().end, {
        elem,
        initialized: Number.parseInt(initTok.text, 10),
        length: Number.parseInt(lenTok.text, 10),
      });
    }

    const nameTok = this.consumeAnyIdent();
    let base: TypeExpr = this.node("TypeName", nameTok.start, nameTok.end, {
      name: nameTok.text,
    });
    if (this.is("op") && this.cur().text === "<") {
      this.next();
      const args: TypeExpr[] = [];
      while (!this.is("op") || this.cur().text !== ">") {
        args.push(this.parseTypeExpr());
        if (this.is("comma")) {
          this.next();
          continue;
        }
        break;
      }
      this.consumeOp(">");
      base = this.node("TypeGeneric", base.span.start, this.prev().end, {
        base,
        args,
      });
    }
    return base;
  }

  private parseTypeParamsOpt(): string[] {
    if (!this.is("op") || this.cur().text !== "<") return [];
    this.next();
    const params: string[] = [];
    while (!this.is("op") || this.cur().text !== ">") {
      params.push(this.consumeAnyIdent().text);
      if (this.is("comma")) {
        this.next();
        continue;
      }
      break;
    }
    this.consumeOp(">");
    return params;
  }

  private parseModulePath(): string[] {
    const parts: string[] = [];
    parts.push(this.consumeAnyIdent().text);
    while (this.is("op") && this.cur().text === "::") {
      this.next();
      parts.push(this.consumeAnyIdent().text);
    }
    return parts;
  }

  private consumeTerminatorOpt(): boolean {
    // Statement separators are newline or semicolon.
    // For block-expression tail semantics, we only care whether an explicit semicolon
    // was present (newline should not prevent a tail expression from yielding a value).
    let hadSemicolon = false;
    while (true) {
      if (this.is("semicolon")) {
        this.next();
        hadSemicolon = true;
        continue;
      }
      if (this.is("newline")) {
        this.next();
        continue;
      }
      break;
    }
    return hadSemicolon;
  }

  private isTerminatorStart(): boolean {
    return (
      this.is("semicolon") ||
      this.is("newline") ||
      this.is("rbrace") ||
      this.is("eof")
    );
  }

  private skipSeparators() {
    while (this.is("newline") || this.is("semicolon")) this.next();
  }

  private node<T extends string, U extends object>(
    kind: T,
    start: number,
    end: number,
    fields: U
  ): any {
    const tok = this.tokens[Math.max(0, this.i - 1)] ?? this.tokens[0];
    return {
      kind,
      span: {
        start,
        end,
        filePath: this.filePath,
        line: tok?.line ?? 1,
        col: tok?.col ?? 1,
      },
      ...fields,
    };
  }

  private spanOf(tok: Token) {
    return {
      filePath: this.filePath,
      start: tok.start,
      end: tok.end,
      line: tok.line,
      col: tok.col,
    };
  }

  private unquote(s: string): string {
    if (s.startsWith('"') && s.endsWith('"')) {
      return JSON.parse(s);
    }
    return s;
  }

  private cur(): Token {
    return this.tokens[this.i] ?? this.tokens[this.tokens.length - 1];
  }

  private prev(): Token {
    return this.tokens[Math.max(0, this.i - 1)] ?? this.tokens[0];
  }

  private next(): Token {
    const t = this.cur();
    this.i++;
    return t;
  }

  private is(kind: Token["kind"], text?: string): boolean {
    const t = this.cur();
    if (t.kind !== kind) return false;
    if (text !== undefined && t.text !== text) return false;
    return true;
  }

  private isKw(text: string): boolean {
    return this.is("kw", text);
  }

  private peekKw(text: string, ahead: number): boolean {
    const t = this.tokens[this.i + ahead];
    return !!t && t.kind === "kw" && t.text === text;
  }

  private consume(kind: Token["kind"], text?: string): Token {
    const t = this.cur();
    if (!this.is(kind, text)) {
      this.diags.error(
        `Expected ${text ?? kind} but got '${t.text}'`,
        this.spanOf(t)
      );
    }
    this.i++;
    return t;
  }

  private consumeOp(op: string): Token {
    const t = this.cur();
    if (!(t.kind === "op" && t.text === op)) {
      this.diags.error(
        `Expected operator '${op}' but got '${t.text}'`,
        this.spanOf(t)
      );
    }
    this.i++;
    return t;
  }

  private consumeAnyIdent(): Token {
    const t = this.cur();
    if (t.kind !== "ident" && t.kind !== "kw") {
      this.diags.error(
        `Expected identifier but got '${t.text}'`,
        this.spanOf(t)
      );
    }
    this.i++;
    return t;
  }
}

const KEYWORD_AS_IDENT = new Set([
  "Running",
  "Paused",
  "Stopped",
  "Ok",
  "Err",
  "Some",
  "None",
  "Success",
  "Failure",
  "Timeout",
]);

const ASSIGNMENT_OPS = new Set(["=", "+=", "-=", "*=", "/=", "%="]);
