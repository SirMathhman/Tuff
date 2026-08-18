import type { SourcePosition } from "./position.js";

/**
 * Structured errors produced by the Tuff compiler.
 *
 * Each variant answers what went wrong and where, so callers can react
 * programmatically without parsing message strings.
 */
export type TuffError = {
  /** The category of the error. */
  kind: "unsupported_expression";
  /** The raw input that caused the error. */
  input: string;
  /** The source position where the error occurred. */
  position: SourcePosition;
  /** A human-readable description of the error. */
  message: string;
};
