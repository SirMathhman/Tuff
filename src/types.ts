export type Token =
  | { type: "number"; value: string; u8: boolean }
  | { type: "boolean"; value: boolean }
  | {
      type: "op";
      value: "+" | "-" | "*" | "/" | "==" | "<" | "+=" | ".." | "=>" | ">>";
    }
  | {
      type: "keyword";
      value:
        | "in"
        | "let"
        | "mut"
        | "if"
        | "else"
        | "while"
        | "for"
        | "break"
        | "continue"
        | "match"
        | "case";
    }
  | { type: "identifier"; value: string }
  | { type: "punct"; value: ";" | "(" | ")" | "{" | "}" | "=" | ">" | "[" | "]" | "," }
  | { type: "eof" };

export type AstNode =
  | { type: "decl"; name: string }
  | { type: "let"; name: string; mutable: boolean; init: Expr }
  | { type: "assign"; target: Expr; value: Expr }
  | { type: "expr"; expr: Expr }
  | { type: "while"; condition: Expr; body: AstNode[] }
  | { type: "for"; varName: string; rangeExpr: Expr; body: AstNode[] }
  | { type: "break" }
  | { type: "continue" };

export type Expr =
  | { type: "number"; value: number; u8: boolean }
  | { type: "boolean"; value: boolean }
  | { type: "identifier"; name: string }
  | { type: "binary"; op: string; left: Expr; right: Expr }
  | { type: "unary"; op: "-"; operand: Expr }
  | { type: "range"; start: Expr; end: Expr }
  | { type: "group"; nodes: AstNode[] }
  | { type: "assign"; target: Expr; value: Expr }
  | { type: "if"; condition: Expr; thenNode: AstNode; elseNode: AstNode | null }
  | { type: "match"; target: Expr; cases: { pattern: Expr; body: Expr }[] }
  | { type: "array"; elements: Expr[] }
  | { type: "index"; target: Expr; index: Expr };

export type VarType = "number" | "boolean" | "range" | "array";
