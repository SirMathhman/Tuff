export type Span = { start: number; end: number };

export type Node =
  | { type: "number"; value: number; span: Span }
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
  | { type: "compare"; lhs: Node; rhs: Node; span: Span }
  | { type: "greater"; lhs: Node; rhs: Node; span: Span }
  | { type: "greaterEq"; lhs: Node; rhs: Node; span: Span }
  | { type: "less"; lhs: Node; rhs: Node; span: Span }
  | { type: "lessEq"; lhs: Node; rhs: Node; span: Span }
  | { type: "notEqual"; lhs: Node; rhs: Node; span: Span }
  | { type: "or"; lhs: Node; rhs: Node; span: Span }
  | { type: "and"; lhs: Node; rhs: Node; span: Span }
  | { type: "let"; mutable: boolean; name: string; value: Node; span: Span }
  | { type: "assign"; name: string; value: Node; span: Span }
  | { type: "block"; statements: Node[]; span: Span }
  | { type: "if"; cond: Node; then: Node; else: Node; span: Span };
