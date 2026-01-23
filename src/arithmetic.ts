import { type Result, ok, err } from "./result";
import { type TuffError } from "./error";

function makeError(
  cause: string,
  context: string,
  reason: string,
  fix: string,
): TuffError {
  return { cause, context, reason, fix };
}

export function applyMultiplicationDivision(
  val: number,
  tokens: Array<number | string>,
  startIdx: number,
): Result<{ result: number; nextIdx: number }, TuffError> {
  let current = val;
  let i = startIdx;

  while (i < tokens.length) {
    const op = tokens[i];
    if (op !== "*" && op !== "/") break;

    i = i + 1;
    const nextNum = tokens[i];
    if (typeof nextNum !== "number") break;

    if (op === "*") {
      current = current * nextNum;
    } else if (op === "/") {
      if (nextNum === 0) {
        return err(
          makeError(
            "Division by zero",
            `Divisor: ${nextNum}`,
            "Cannot divide by zero",
            "Ensure all divisors are non-zero",
          ),
        );
      }
      current = Math.floor(current / nextNum);
    }
    i = i + 1;
  }

  return ok({ result: current, nextIdx: i });
}

function handleHighPrecedence(
  tokens: Array<number | string>,
): Result<Array<number | string>, TuffError> {
  const multDivResult: Array<number | string> = [];
  let i = 0;
  let current = tokens[0];

  if (typeof current !== "number") return ok([0]);

  const initial = applyMultiplicationDivision(current, tokens, 1);
  if (!initial.ok) return initial;
  current = initial.value.result;
  i = initial.value.nextIdx;

  multDivResult.push(current);

  while (i < tokens.length) {
    const op = tokens[i];
    if (op === "||" || op === "&&") {
      multDivResult.push(op);
      i = i + 1;
      const nextVal = tokens[i];
      if (typeof nextVal === "number") {
        multDivResult.push(nextVal);
        i = i + 1;
      }
      break;
    }
    if (op !== "+" && op !== "-") break;

    multDivResult.push(op);
    i = i + 1;

    const nextVal = tokens[i];
    if (typeof nextVal !== "number") break;

    const applied = applyMultiplicationDivision(nextVal, tokens, i + 1);
    if (!applied.ok) return applied;
    multDivResult.push(applied.value.result);
    i = applied.value.nextIdx;
  }

  return ok(multDivResult);
}

export function evaluateTokens(
  tokens: Array<number | string>,
): Result<number, TuffError> {
  const highPrecedence = handleHighPrecedence(tokens);
  if (!highPrecedence.ok) return highPrecedence;

  const multDivResult = highPrecedence.value;
  let result = 0;
  const firstVal = multDivResult[0];
  if (typeof firstVal === "number") {
    result = firstVal;
  }

  let j = 1;
  while (j < multDivResult.length) {
    const op = multDivResult[j];
    if (op === undefined) break;
    const val = multDivResult[j + 1];

    if (typeof val === "number") {
      if (op === "+") result = result + val;
      else if (op === "-") result = result - val;
      else if (op === "&&") result = result !== 0 && val !== 0 ? 1 : 0;
      else if (op === "||") result = result !== 0 || val !== 0 ? 1 : 0;
    }

    j = j + 2;
  }

  return ok(result);
}
