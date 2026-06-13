/** Token types for our simple arithmetic language. */
export type NumberToken = {
  type: "number";
  value: number;
  suffix?: string | undefined;
};

export type OpToken = { type: "op"; value: string };

export type IdToken = { type: "id"; value: string };

export type BooleanToken = { type: "boolean"; value: boolean };

export type KeywordToken = { type: "keyword"; value: string };

export type ScopeValue = unknown | unknown[];
export type Token =
  | NumberToken
  | OpToken
  | IdToken
  | BooleanToken
  | KeywordToken;

/** Function definition stored in scope. */
export type FnDef = { body: string; params: string[] };

/** Lightweight context to track type info during expression evaluation. */
export type EvalContext = { lastResultType: string | undefined };
