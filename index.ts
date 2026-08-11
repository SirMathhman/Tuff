export function evaluate(input: string): number {
  if (input === "") return 0;
  const num = Number(input);
  if (!Number.isNaN(num)) return num;

  const tokens = input.match(/([^+\-]+|[+\-])/g);
  if (tokens && tokens.length >= 3) {
    let result = evaluate(tokens[0]);
    let i = 1;
    while (i < tokens.length) {
      const op = tokens[i];
      const next = evaluate(tokens[i + 1]!);
      if (op === "+") result += next;
      else if (op === "-") result -= next;
      i += 2;
    }
    return result;
  }

  throw new Error("Not implemented");
}
