export type NodeBase = {
  kind: string;
  span: {
    start: number;
    end: number;
    filePath: string;
    line: number;
    col: number;
  };
};

export type Program = NodeBase & {
  kind: "Program";
  items: TopLevelItem[];
};

export type TopLevelItem =
  | LetDecl
  | FnDecl
  | TypeUnionDecl
  | ModuleDecl
  | ImportDecl
  | FromUseDecl
  | ExternFromUseDecl;

export type ImportDecl = NodeBase & {
  kind: "ImportDecl";
  modulePath: string[];
};

export type FromUseDecl = NodeBase & {
  kind: "FromUseDecl";
  modulePath: string[];
  names: string[];
};

export type ExternFromUseDecl = NodeBase & {
  kind: "ExternFromUseDecl";
  modulePath: string[];
  names: string[];
};

export type ModuleDecl = NodeBase & {
  kind: "ModuleDecl";
  name: string;
  items: TopLevelItem[];
};

export type LetDecl = NodeBase & {
  kind: "LetDecl";
  name: string;
  mutable: boolean;
  typeAnn?: TypeExpr;
  init?: Expr;
};

export type FnDecl = NodeBase & {
  kind: "FnDecl";
  name?: string;
  isClass: boolean;
  typeParams: string[];
  params: ParamDecl[];
  returnType?: TypeExpr;
  body: BlockExpr;
};

export type ParamDecl = NodeBase & {
  kind: "ParamDecl";
  name: string;
  typeAnn?: TypeExpr;
};

export type TypeUnionDecl = NodeBase & {
  kind: "TypeUnionDecl";
  name: string;
  typeParams: string[];
  variants: TypeUnionVariant[];
};

export type TypeUnionVariant = {
  name: string;
  typeArg?: TypeExpr;
};

export type TypeExpr =
  | (NodeBase & { kind: "TypeName"; name: string })
  | (NodeBase & { kind: "TypeGeneric"; base: TypeExpr; args: TypeExpr[] })
  | (NodeBase & { kind: "TypeFunction"; params: TypeExpr[]; ret: TypeExpr })
  | (NodeBase & { kind: "TypeTuple"; items: TypeExpr[] })
  | (NodeBase & { kind: "TypeSlice"; elem: TypeExpr })
  | (NodeBase & {
      kind: "TypeArray";
      elem: TypeExpr;
      initialized: number;
      length: number;
    });

export type Stmt =
  | LetDecl
  | AssignStmt
  | ExprStmt
  | IfStmt
  | WhileStmt
  | LoopStmt
  | BreakStmt
  | ContinueStmt
  | YieldStmt
  | FnDecl;

export type BlockExpr = NodeBase & {
  kind: "BlockExpr";
  stmts: Stmt[];
  tail?: Expr; // present only when last statement is an expression without semicolon
};

export type AssignStmt = NodeBase & {
  kind: "AssignStmt";
  target: Expr;
  op: "=" | "+=" | "-=" | "*=" | "/=" | "%=";
  expr: Expr;
};

export type ExprStmt = NodeBase & {
  kind: "ExprStmt";
  expr: Expr;
  terminated: boolean; // true if semicolon-terminated (or treated as such)
};

export type IfStmt = NodeBase & {
  kind: "IfStmt";
  cond: Expr;
  thenBranch: Stmt | BlockExpr;
  elseBranch?: Stmt | BlockExpr | IfStmt;
};

export type WhileStmt = NodeBase & {
  kind: "WhileStmt";
  cond: Expr;
  body: Stmt | BlockExpr;
};

export type LoopStmt = NodeBase & {
  kind: "LoopStmt";
  body: Stmt | BlockExpr;
  asExpr: boolean;
};

export type BreakStmt = NodeBase & {
  kind: "BreakStmt";
  value?: Expr;
};

export type ContinueStmt = NodeBase & {
  kind: "ContinueStmt";
};

export type YieldStmt = NodeBase & {
  kind: "YieldStmt";
  value?: Expr;
};

export type Expr =
  | IdentExpr
  | LiteralExpr
  | BinaryExpr
  | UnaryExpr
  | CallExpr
  | MemberExpr
  | IndexExpr
  | PathExpr
  | BlockExpr
  | IfExpr
  | LoopExpr
  | MatchExpr
  | ThisExpr
  | LambdaExpr
  | ParenExpr
  | ObjectLiteralExpr
  | TupleLiteralExpr;

export type IdentExpr = NodeBase & { kind: "IdentExpr"; name: string };

export type PathExpr = NodeBase & { kind: "PathExpr"; parts: string[] };

export type LiteralExpr = NodeBase & {
  kind: "LiteralExpr";
  value: number | string | boolean | null;
  literalKind: "number" | "string" | "bool" | "none";
  raw: string;
};

export type BinaryExpr = NodeBase & {
  kind: "BinaryExpr";
  op: string;
  left: Expr;
  right: Expr;
};

export type UnaryExpr = NodeBase & {
  kind: "UnaryExpr";
  op: string;
  expr: Expr;
};

export type CallExpr = NodeBase & {
  kind: "CallExpr";
  callee: Expr;
  args: Expr[];
};

export type MemberExpr = NodeBase & {
  kind: "MemberExpr";
  object: Expr;
  member: string;
};

export type IndexExpr = NodeBase & {
  kind: "IndexExpr";
  object: Expr;
  index: Expr;
};

export type IfExpr = NodeBase & {
  kind: "IfExpr";
  cond: Expr;
  thenExpr: Expr;
  elseExpr: Expr;
};

export type LoopExpr = NodeBase & {
  kind: "LoopExpr";
  body: BlockExpr;
};

export type MatchExpr = NodeBase & {
  kind: "MatchExpr";
  value: Expr;
  arms: { pattern: MatchPattern; expr: Expr }[];
};

export type MatchPattern =
  | { kind: "Wildcard" }
  | { kind: "Variant"; name: string }
  | { kind: "String"; value: string };

export type ThisExpr = NodeBase & {
  kind: "ThisExpr";
  // analyzer fills captureNames; emitter may use it
  captureNames?: string[];
};

export type LambdaExpr = NodeBase & {
  kind: "LambdaExpr";
  params: ParamDecl[];
  body: BlockExpr;
};

export type ParenExpr = NodeBase & {
  kind: "ParenExpr";
  expr: Expr;
};

export type ObjectLiteralExpr = NodeBase & {
  kind: "ObjectLiteralExpr";
  fields: { name: string; value: Expr }[];
};

export type TupleLiteralExpr = NodeBase & {
  kind: "TupleLiteralExpr";
  items: Expr[];
};
