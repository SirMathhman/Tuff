import { tokenize } from './tokenize';
import { evalLeftToRight } from './evalLeftToRight';

export function interpret(input: string): number {
  const trimmed = input.trim();

  // Direct numeric literal (fast path)
  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric) && trimmed !== '') {
    return numeric;
  }

  // Delegate to tokenizer + evaluator
  const tokens = tokenize(trimmed);
  return evalLeftToRight(tokens);
}

