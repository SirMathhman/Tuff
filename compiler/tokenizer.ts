export function tokenize(input: string): Array<string> {
  const tokens = input.match(
    /(-?\d+[UI]\d+|-?\d+|\|\||&&|[+\-*/(){}=:;,|[\]]|let|mut|true|false|\w+)/g,
  );

  if (!tokens || tokens.length === 0) {
    throw new Error(`Invalid Tuff value: ${input}`);
  }

  return tokens;
}
