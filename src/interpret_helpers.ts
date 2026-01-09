// Re-export all functionality from split modules for backward compatibility
export {
  checkAnnMatchesRhs,
  validateTypeOnly,
  parseArrayAnnotation,
  parseSliceAnnotation,
  validateAnnotation,
} from "./interpret/annotations";

export { cloneArrayInstance, makeArrayInstance } from "./interpret/arrays";

export {
  findMatchingParen,
  extractAssignmentParts,
  expandParensAndBraces,
  parseExpressionTokens,
  parseFnComponents,
  parseStructDef,
} from "./interpret/parsing";

export {
  getLastTopLevelStatement,
  evaluateRhs,
  registerFunctionFromStmt,
  convertOperandToNumber,
  interpretAll,
  interpretAllWithNative,
} from "./interpret/core";

// Re-export parseOperand from parser for backward compatibility
export { parseOperand } from "./parser";
