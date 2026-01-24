import { interpretWithScope } from "../app";

export function interpret(input: string): number {
  return interpretWithScope(input, new Map(), new Map(), new Map());
}
