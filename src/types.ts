export interface Ok<T> {
  ok: true;
  value: T;
}
export interface Err<E> {
  ok: false;
  error: E;
}
export type Result<T, E> = Ok<T> | Err<E>;

export interface UndefinedIdentifierError {
  type: "UndefinedIdentifier";
  identifier: string;
}
export interface InvalidInputError {
  type: "InvalidInput";
  message: string;
}
export type InterpretError = UndefinedIdentifierError | InvalidInputError;

export interface NumToken {
  type: "num";
  value: number;
}
export interface OpToken {
  type: "op";
  value: string;
}
export interface IdToken {
  type: "id";
  value: string;
}
export type Token = NumToken | OpToken | IdToken;

// runtime values can be plain numbers, struct instances (map of field -> number), or functions
export type StructInstance = Map<string, number>;
export interface FunctionValue {
  type: "fn";
  params: string[];
  body: Token[];
}
export interface ReturnSignalValue {
  type: "return";
  value: number;
}
export type Value = number | StructInstance | FunctionValue | ReturnSignalValue;

export function ok<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}
export function err<T, E>(error: E): Result<T, E> {
  return { ok: false, error };
}
