import type { SourcePosition } from "./position.js";

/**
 * Structured errors produced by the Tuff compiler.
 *
 * Each variant answers what went wrong and where, so callers can react
 * programmatically without parsing message strings.
 */
export type TuffError =
  | {
      /** The category of the error. */
      kind: "unexpected_character";
      /** The raw input that caused the error. */
      input: string;
      /** The source position where the error occurred. */
      position: SourcePosition;
      /** The character that could not be lexed. */
      character: string;
      /** A human-readable description of the error. */
      message: string;
    }
  | {
      /** The category of the error. */
      kind: "unexpected_token";
      /** The raw input that caused the error. */
      input: string;
      /** The source position where the error occurred. */
      position: SourcePosition;
      /** A human-readable description of the error. */
      message: string;
    }
  | {
      /** The category of the error. */
      kind: "unclosed_delimiter";
      /** The raw input that caused the error. */
      input: string;
      /** The source position where the error occurred. */
      position: SourcePosition;
      /** The delimiter that was expected to close the group. */
      delimiter: "parenthesis" | "brace";
      /** A human-readable description of the error. */
      message: string;
    };
