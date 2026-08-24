import type { Position } from "../errors.ts";
import type { Expr } from "./expr.ts";

export enum StatementType {
  Let = "let",
  Assign = "assign",
  Return = "return",
  Block = "block",
  If = "if",
  While = "while",
  FnDecl = "fn",
}

export interface FnParam {
  readonly name: string;
  readonly type: string;
}

export interface LetStmt {
  readonly type: StatementType.Let;
  readonly mutable: boolean;
  readonly name: string;
  readonly annotation: string | null;
  readonly value: Expr;
  readonly position: Position;
}

export interface AssignStmt {
  readonly type: StatementType.Assign;
  readonly target: Expr;
  readonly value: Expr;
  readonly position: Position;
}

export interface ReturnStmt {
  readonly type: StatementType.Return;
  readonly value: Expr;
  readonly position: Position;
}

export interface BlockStmt {
  readonly type: StatementType.Block;
  readonly statements: readonly Statement[];
  readonly position: Position;
}

export interface IfStmt {
  readonly type: StatementType.If;
  readonly condition: Expr;
  readonly then: readonly Statement[];
  readonly else: readonly Statement[] | null;
  readonly position: Position;
}

export interface WhileStmt {
  readonly type: StatementType.While;
  readonly condition: Expr;
  readonly body: readonly Statement[];
  readonly position: Position;
}

export interface FnDeclStmt {
  readonly type: StatementType.FnDecl;
  readonly name: string;
  readonly params: readonly FnParam[];
  readonly returnType: string;
  readonly body: readonly Statement[];
  readonly position: Position;
}

export interface FnInfo {
  readonly params: readonly FnParam[];
  readonly returnType: string;
  readonly body: readonly Statement[];
}

export type Statement =
  LetStmt | AssignStmt | ReturnStmt | BlockStmt | IfStmt | WhileStmt | FnDeclStmt;

export interface ParsedBlock {
  readonly statements: Statement[];
  readonly position: Position;
}

export interface Program {
  readonly statements: readonly Statement[];
}
