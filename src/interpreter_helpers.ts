// Re-export all functionality from split modules for backward compatibility
export {
  checkAnnMatchesRhs,
  validateTypeOnly,
  parseArrayAnnotation,
  parseSliceAnnotation,
  validateAnnotation,
} from "./interpreter/annotations";

export { cloneArrayInstance, makeArrayInstance } from "./interpreter/arrays";

export {
  findMatchingParen,
  extractAssignmentParts,
  expandParensAndBraces,
  parseExpressionTokens,
  parseFnComponents,
  parseStructDef,
} from "./interpreter/parsing";

export {
  getLastTopLevelStatement,
  evaluateRhs,
  registerFunctionFromStmt,
  convertOperandToNumber,
  interpretAll,
  interpretAllWithNative,
} from "./interpreter/core";

// Re-export parseOperand from parser for backward compatibility
export { parseOperand } from "./parser";
