// Core type definitions for the Tuff interpreter

export type Token = { type: string; value: string; suffix?: string };

export type Value =
  | { tag: "number"; num: number; type?: string }
  | { tag: "bool"; val: boolean }
  | {
      tag: "fn";
      params: { name: string; type: AstType }[];
      body: Ast;
      scopes: Scope[];
      mutables: Scope["mutable"][];
    }
  | { tag: "ref"; scope: Scope; name: string; mutable: boolean }
  | { tag: "tuple"; values: Value[] }
  | { tag: "null" }
  | { tag: "array"; values: Value[] }
  | { tag: "string"; value: string }
  | { tag: "record"; fields: Record<string, Value> };

export type ControlFlow =
  | { kind: "continue" }
  | { kind: "break" }
  | { kind: "yield"; value: Value }
  | { kind: "return"; value: Value };

export function isControlFlow(e: unknown): e is ControlFlow {
  return typeof e === "object" && e !== null && "kind" in e;
}

// AST types
// AST type representation
export type AstType =
  | { kind: "primitive"; name: string }
  | { kind: "array"; elementType: AstType; length: number };

// AST types
export type Ast =
  | { kind: "num"; value: number; suffix?: string }
  | { kind: "bool"; value: boolean }
  | { kind: "ident"; name: string }
  | { kind: "unary"; op: "!" | "-" | "&" | "&mut" | "*"; operand: Ast }
  | { kind: "tuple"; elements: Ast[] }
  | { kind: "index"; target: Ast; index: number }
  | { kind: "binop"; op: string; left: Ast; right: Ast }
  | { kind: "let"; mutable: boolean; name: string; value: Ast; typeAnnotation?: AstType; exported?: boolean }
  | { kind: "assign"; name: string; value: Ast }
  | { kind: "refassign"; name: string; value: Ast }
  | { kind: "array_assign"; target: Ast; index: Ast; value: Ast }
  | { kind: "block"; statements: (Ast | null)[] }
  | { kind: "paren"; expr: Ast }
  | { kind: "if_expr"; cond: Ast; thenBranch: Ast; elseBranch: Ast }
  | { kind: "if_stmt"; cond: Ast; thenBranch: Ast; elseBranch: Ast | null }
  | { kind: "augassign"; name: string; op: "+" | "-"; value: Ast }
  | { kind: "while"; cond: Ast; body: Ast }
  | { kind: "for"; varName: string; start: Ast; end: Ast; body: Ast }
  | { kind: "continue" }
  | { kind: "break" }
  | { kind: "yield"; value: Ast }
  | { kind: "return"; value: Ast }
  | { kind: "fn"; name: string; params: { name: string; type: AstType }[]; body: Ast }
  | { kind: "call"; name: string; args: Ast[]; target?: Ast }
  | { kind: "match"; expr: Ast; cases: { pattern: Ast; body: Ast }[] }
  | { kind: "wildcard" }
  | { kind: "null" }
  | { kind: "array"; elements: Ast[] }
  | { kind: "array_index"; target: Ast; index: Ast }
  | { kind: "char"; value: string }
  | { kind: "string"; value: string }
  | { kind: "string_index"; target: Ast; index: Ast }
  | { kind: "length"; target: Ast }
  | { kind: "property_access"; target: Ast; property: string }
  | { kind: "record"; fields: { key: string; value: Ast }[] }
  | { kind: "typecheck"; value: Ast; type: AstType }
  | { kind: "typealias"; name: string; baseType: string };

export type Scope = { vars: Record<string, Value>; mutable: Record<string, boolean> };
