export function evaluate(input: string): number {
  if (input === "") return 0;
  const js = input.replace(/\blet\s+mut(?=\s)/g, "let");
  // eslint-disable-next-line no-new-func -- evaluating arbitrary code is the purpose of this function
  return new Function(js)() as number;
}
