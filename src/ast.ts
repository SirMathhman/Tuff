export type Node =
  | { type: "number"; value: number }
  | { type: "bool"; value: boolean }
  | { type: "var"; name: string }
  | { type: "binary"; op: "+" | "-" | "*" | "/"; lhs: Node; rhs: Node }
  | { type: "unary"; op: "-" | "!"; operand: Node }
  | { type: "compare"; lhs: Node; rhs: Node }
  | { type: "greater"; lhs: Node; rhs: Node }
  | { type: "greaterEq"; lhs: Node; rhs: Node }
  | { type: "less"; lhs: Node; rhs: Node }
  | { type: "lessEq"; lhs: Node; rhs: Node }
  | { type: "or"; lhs: Node; rhs: Node }
  | { type: "and"; lhs: Node; rhs: Node }
  | { type: "let"; mutable: boolean; name: string; value: Node }
  | { type: "assign"; name: string; value: Node }
  | { type: "block"; statements: Node[] };
