/**
 * A structured error describing why evaluation failed.
 */
export type EvaluateError =
  | { kind: "invalid-number"; input: string; reason: string }
  | { kind: "malformed-expression"; input: string; reason: string };

/**
 * The result of evaluating a Tuff expression.
 */
export type EvaluateResult = { ok: true; value: number } | { ok: false; error: EvaluateError };

/**
 * Evaluates a Tuff expression.
 *
 * Supports addition and subtraction, evaluated left to right.
 * Empty input is a defined case and evaluates to 0.
 */
export function evaluate(input: string): EvaluateResult {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { ok: true, value: 0 };
  }
  const tokens = trimmed.split(/([+-])/);
  let value = 0;
  let sign = 1;
  for (let i = 0; i < tokens.length; i += 2) {
    const operand = tokens[i].trim();
    if (operand === "") {
      return {
        ok: false,
        error: {
          kind: "malformed-expression",
          input,
          reason: `Unexpected end of expression in "${input}"`,
        },
      };
    }
    const num = Number(operand);
    if (Number.isNaN(num)) {
      return {
        ok: false,
        error: {
          kind: "invalid-number",
          input,
          reason: `Cannot parse "${input}" as a number`,
        },
      };
    }
    value += sign * num;
    sign = tokens[i + 1] === "-" ? -1 : 1;
  }
  return { ok: true, value };
}
