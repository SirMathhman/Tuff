export function interpretTuff(tuffSource: string): number {
  // Each term is an optional sign followed by digits, e.g. "2", "+ 3", "- 4".
  // A sign may be separated from its digits by whitespace; any other
  // non-digit character ends the term and clears a pending sign.
  let sum = 0;
  let sign = 1;
  let digits = "";

  function flushDigits(): void {
    if (digits !== "") {
      sum += sign * Number(digits);
      digits = "";
      sign = 1;
    }
  }

  for (const char of tuffSource) {
    if (char >= "0" && char <= "9") {
      digits += char;
    } else if (char === "+" || char === "-") {
      flushDigits();
      sign = char === "-" ? -1 : 1;
    } else if (char.trim() === "") {
      flushDigits();
    } else {
      flushDigits();
      sign = 1;
    }
  }
  flushDigits();

  return sum;
}
