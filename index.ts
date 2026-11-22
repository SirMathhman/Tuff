export function interpretTuff(tuffSource: string): number {
  // A term is a product of numbers joined by "*", with an optional sign on its
  // first factor, e.g. "2", "+ 3", "- 4", "2 * 3". Terms are added together,
  // so "*" binds tighter than "+" and "-".
  // Whitespace ends a number. A number directly after another number, with no
  // operator between, starts a new term. Any other character ends the term and
  // clears a pending sign.
  let sum = 0;
  let term: number | null = null;
  let sign = 1;
  let afterStar = false;
  let digits = "";

  function commitTerm(): void {
    if (term !== null) {
      sum += term;
      term = null;
    }
  }

  function applyNumber(value: number): void {
    if (afterStar) {
      term = (term ?? 1) * sign * value;
      sign = 1;
      afterStar = false;
    } else {
      commitTerm();
      term = sign * value;
      sign = 1;
    }
  }

  function flushDigits(): void {
    if (digits !== "") {
      applyNumber(Number(digits));
      digits = "";
    }
  }

  for (const char of tuffSource) {
    if (char >= "0" && char <= "9") {
      digits += char;
    } else if (char === "+" || char === "-") {
      flushDigits();
      if (!afterStar) {
        commitTerm();
      }
      sign = char === "-" ? -1 : 1;
    } else if (char === "*") {
      flushDigits();
      afterStar = true;
    } else if (char.trim() === "") {
      flushDigits();
    } else {
      flushDigits();
      commitTerm();
      sign = 1;
      afterStar = false;
    }
  }
  flushDigits();
  commitTerm();

  return sum;
}
