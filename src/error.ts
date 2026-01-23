export interface TuffError {
  cause: string;
  context: string;
  reason: string;
  fix: string;
}
export function makeError(
  cause: string,
  context: string,
  reason: string,
  fix: string,
): TuffError {
  return { cause, context, reason, fix };
}
