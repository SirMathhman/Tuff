export { interpret } from "./interpreter";
export { TuffError, ParseError, TypeError, RuntimeError } from "./errors";
export {
  typeToString,
  parseTypeString,
  typeEquals,
  isRefType,
  typeBits,
  isNarrower,
} from "./types";
export type {
  Type,
  UintType,
  BoolType,
  I32Type,
  RefType,
  StructType,
} from "./types";
