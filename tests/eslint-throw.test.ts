import { describe, it, expect } from 'bun:test';
import { ESLint } from 'eslint';

const eslint = new ESLint({ overrideConfigFile: 'eslint.config.mjs' });

describe('ESLint throw ban', () => {
  it('reports an error for throw statements', async () => {
    const code = 'export function a() { throw new Error("boom"); }';
    const [result] = await eslint.lintText(code, { filePath: 'src/a.ts' });
    const hasThrowMessage = result.messages.some((m) => m.message.includes('Use a Result'));
    // Fallback: match the exact message fragment we set in the config
    const hasResultMessage = result.messages.some((m) => m.message.includes('Result<T, E>'));
    expect(result.messages.length).toBeGreaterThan(0);
    expect(hasThrowMessage || hasResultMessage).toBe(true);
  });
});
