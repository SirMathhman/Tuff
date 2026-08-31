export type AstNode =
  | { type: "number"; value: number }
  | { type: "add"; left: AstNode; right: AstNode }
  | { type: "sub"; left: AstNode; right: AstNode }
  | { type: "mul"; left: AstNode; right: AstNode }
  | { type: "ident"; name: string; position: number }
  | {
      type: "let";
      name: string;
      mutable: boolean;
      value: AstNode;
      body: AstNode;
    }
  | {
      type: "assign";
      name: string;
      position: number;
      value: AstNode;
      body: AstNode;
    };
