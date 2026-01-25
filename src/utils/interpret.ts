import { interpretWithScope } from "../app";

export function interpret(input: string): number {
  return interpretWithScope(input, new Map(), new Map(), new Map());
}

export function interpretAll(
  inputs: string[],
  config: Map<string[], string>
): number {
  for (const [key, value] of config.entries()) {
    if (key.length === inputs.length && key.every((k, i) => k === inputs[i])) {
      return interpret(value);
    }
  }
  return 0;
}
