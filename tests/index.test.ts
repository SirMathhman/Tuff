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

test('buildReplInputs loads src tree for repl', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-repl-'));
  const srcDir = path.join(tempDir, 'src');
  fs.mkdirSync(path.join(srcDir, 'foo', 'bar'), { recursive: true });
  fs.writeFileSync(
    path.join(srcDir, 'index.tuff'),
    'use { pass } from lib; pass<I32>(100)'
  );
  fs.writeFileSync(path.join(srcDir, 'lib.tuff'), 'fn pass<T>(value : T) => value;');
  fs.writeFileSync(path.join(srcDir, 'foo', 'bar', 'something.tuff'), '100');
  fs.writeFileSync(path.join(srcDir, 'native.ts'), 'export const myConst = 7;');

  const replInputs = buildReplInputs(tempDir);
  expect(replInputs.inputs).toEqual(['index']);

  const modules = new Map<string, string>();
  for (const [key, value] of replInputs.config) {
    modules.set(key.join('/'), value);
  }
  expect(modules.get('index')).toBe('use { pass } from lib; pass<I32>(100)');
  expect(modules.get('lib')).toBe('fn pass<T>(value : T) => value;');
  expect(modules.get('foo/bar/something')).toBe('100');

  const nativeModules = new Map<string, string>();
  for (const [key, value] of replInputs.nativeConfig) {
    nativeModules.set(key.join('/'), value);
  }
  expect(nativeModules.get('native')).toBe('export const myConst = 7;');

  expect(interpretAll(replInputs.inputs, replInputs.config, replInputs.nativeConfig)).toBe(100);
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

test('interpretAll supports generic extern native functions', () => {
  const config = new Map([
    [
      ['main'],
      'extern use { get } from lib; extern fn get<T>() : I32; get<Bool>()',
    ],
  ]);
  const nativeConfig = new Map([[['lib'], 'export function get<T>() { return 100; }']]);
  expect(interpretAll(['main'], config, nativeConfig)).toBe(100);
});

test('interpretAll allows unused void native functions', () => {
  const config = new Map([
    [
      ['main'],
      'extern use { createArray } from lib; extern fn createArray<T>(length : USize) : *[T]; 0',
    ],
  ]);
  const nativeConfig = new Map([
    [
      ['lib'],
      'export function createArray<T>(length: number) { return new Array<T>(length); }\nexport function println(content: string) { console.log(content); }',
    ],
  ]);
  expect(interpretAll(['main'], config, nativeConfig)).toBe(0);
});

test('interpretAll handles native createArray without copying arrays', () => {
  const config = new Map([
    [
      ['main'],
      'extern use { createArray } from lib; extern fn createArray<T>(length : USize) : *[T]; let array = createArray<I32>(3); 0',
    ],
  ]);
  const nativeConfig = new Map([
    [
      ['lib'],
      'export function createArray<T>(length: number) { return new Array<T>(length); }',
    ],
  ]);
  expect(interpretAll(['main'], config, nativeConfig)).toBe(0);
});
