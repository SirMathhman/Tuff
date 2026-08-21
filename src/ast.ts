export type Span = { start: number; end: number };

export type Node =
  | { type: "number"; value: number; kind: "int" | "float"; span: Span }
  | { type: "bool"; value: boolean; span: Span }
  | { type: "var"; name: string; span: Span }
  | {
      type: "binary";
      op: "+" | "-" | "*" | "/";
      lhs: Node;
      rhs: Node;
      span: Span;
    }
  | { type: "unary"; op: "-" | "!"; operand: Node; span: Span }
  | {
      type: "compare";
      op: "==" | "!=" | ">" | ">=" | "<" | "<=";
      lhs: Node;
      rhs: Node;
      span: Span;
    }
  | { type: "logical"; op: "||" | "&&"; lhs: Node; rhs: Node; span: Span }
  | { type: "let"; mutable: boolean; name: string; value: Node; span: Span }
  | { type: "assign"; name: string; value: Node; span: Span }
  | {
      type: "block";
      inExpression: boolean;
      statements: Node[];
      span: Span;
    }
  | { type: "if"; cond: Node; then: Node; else: Node; span: Span }
  | { type: "loop"; body: Node; span: Span }
  | { type: "break"; value: Node; span: Span };
