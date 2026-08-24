export function evaluate(input: string): number {
  if (input === "") return 0;
  // eslint-disable-next-line no-new-func -- evaluating arbitrary code is the purpose of this function
  return new Function(input)() as number;
}
