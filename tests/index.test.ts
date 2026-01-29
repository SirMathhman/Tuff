import fs from 'fs';
import os from 'os';
import path from 'path';
import { add, interpretAll, buildReplInputs } from '../src/index';

test('add', () => {
  expect(add(1, 2)).toBe(3);
});

test('interpretAll supports explicit generic call syntax', () => {
  const config = new Map([
    [['main'], 'use { pass } from lib; pass<I32>(100)'],
    [['lib'], 'fn pass<T>(value : T) => value;'],
  ]);
  expect(interpretAll(['main'], config, new Map())).toBe(100);
});

test('buildReplInputs loads index and lib modules', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-repl-'));
  const srcDir = path.join(tempDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(srcDir, 'index.tuff'),
    'use { pass } from lib; pass<I32>(100)'
  );
  fs.writeFileSync(path.join(srcDir, 'lib.tuff'), 'fn pass<T>(value : T) => value;');

  const replInputs = buildReplInputs(tempDir);
  expect(replInputs.inputs).toEqual(['index']);

  const modules = new Map<string, string>();
  for (const [key, value] of replInputs.config) {
    modules.set(key[0], value);
  }
  expect(modules.get('index')).toBe('use { pass } from lib; pass<I32>(100)');
  expect(modules.get('lib')).toBe('fn pass<T>(value : T) => value;');

  expect(interpretAll(replInputs.inputs, replInputs.config, new Map())).toBe(100);
});

test('interpretAll supports extern native bindings', () => {
  const config = new Map([
    [
      ['main'],
      'extern use { myConst } from lib; extern let myConst : I32; myConst',
    ],
  ]);
  const nativeConfig = new Map([[['lib'], 'export const myConst = 100;']]);
  expect(interpretAll(['main'], config, nativeConfig)).toBe(100);
});

test('interpretAll supports extern native functions', () => {
  const config = new Map([
    [
      ['main'],
      'extern use { get } from lib; extern fn get() : I32; get()',
    ],
  ]);
  const nativeConfig = new Map([[['lib'], 'export function get() { return 100; }']]);
  expect(interpretAll(['main'], config, nativeConfig)).toBe(100);
});
