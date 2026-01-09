// AST Node Types
export type {
  ASTNode,
  ASTStatement,
  ASTExpression,
  ASTLiteral,
  ASTPosition,
  LetStatement,
  IfStatement,
  WhileStatement,
  ForStatement,
  ExpressionStatement,
  BlockStatement,
  FnDeclaration,
  StructDeclaration,
  TypeAliasDecl,
  YieldStatement,
  AssignmentASTStatement,
  ImportASTStatement,
  ExternASTStatement,
  ASTAssignmentTarget,
  IntLiteralAST,
  FloatLiteralAST,
  StringLiteralAST,
  BoolLiteralAST,
  ASTIdentifier,
  BinaryOpExpr,
  UnaryOpExpr,
  CallExpr,
  MemberAccessExpr,
  IndexAccessExpr,
  MatchExpr,
  ArrayLiteralExpr,
  StructInstantiationExpr,
  BlockExpr,
  ParenExpr,
} from "./nodes";

// AST Node Type Guards
export {
  isLetStatement,
  isIfStatement,
  isWhileStatement,
  isForStatement,
  isExpressionStatement,
  isBlockStatement,
  isFnDeclaration,
  isStructDeclaration,
  isTypeAliasDecl,
  isYieldStatement,
  isAssignmentStatement,
  isImportStatement,
  isExternStatement,
  isIntLiteral,
  isFloatLiteral,
  isStringLiteral,
  isBoolLiteral,
  isASTIdentifier,
  isBinaryOpExpr,
  isUnaryOpExpr,
  isCallExpr,
  isMemberAccessExpr,
  isIndexAccessExpr,
  isMatchExpr,
  isArrayLiteralExpr,
  isStructInstantiationExpr,
  isBlockExpr,
  isParenExpr,
  isLiteralExpr,
} from "./nodes";

// Token Types
export type {
  Token,
  KeywordToken,
  IdentifierToken,
  LiteralToken,
  OperatorToken,
  DelimiterToken,
  PunctuationToken,
  EOFToken,
} from "./tokens";

// Token Type Guards
export {
  KEYWORDS,
  isKeywordToken,
  isIdentifierToken,
  isLiteralToken,
  isOperatorToken,
  isDelimiterToken,
  isPunctuationToken,
  isEOFToken,
} from "./tokens";

// Tokenizer
export { tokenize } from "./tokenizer";

// Parser
export { TokenParser } from "./token_parser";

// Stringify
export { astExprToString, astStmtToString } from "./stringify";

// Convenience function
import { tokenize } from "./tokenizer";
import { TokenParser } from "./token_parser";
import type { ASTStatement } from "./nodes";

/**
 * Parse a program string to AST
 */
export function parseProgram(input: string): ASTStatement[] {
  const tokens = tokenize(input);
  const parser = new TokenParser(tokens);
  return parser.parseProgram();
}
