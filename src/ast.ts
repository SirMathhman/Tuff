export type AstNode =
  | { type: "number"; value: number; position: number }
  | { type: "add"; left: AstNode; right: AstNode; position: number }
  | { type: "sub"; left: AstNode; right: AstNode; position: number }
  | { type: "mul"; left: AstNode; right: AstNode; position: number }
  | { type: "ident"; name: string; position: number }
  | {
      type: "let";
      name: string;
      mutable: boolean;
      value: AstNode;
      body: AstNode;
      position: number;
    }
  | {
      type: "assign";
      name: string;
      position: number;
      value: AstNode;
      body: AstNode;
    }
  | { type: "ref"; target: string; mut: boolean; position: number }
  | { type: "deref"; operand: AstNode; position: number }
  | {
      type: "derefAssign";
      operand: AstNode;
      value: AstNode;
      body: AstNode;
      position: number;
    };
