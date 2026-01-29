import fs from 'fs';
import os from 'os';
import path from 'path';
import { add, interpretAll, buildReplInputs } from '../src/index';

const buildMainConfig = (source: string) => new Map([[['main'], source]]);
const buildLibConfig = (source: string) => new Map([[['lib'], source]]);

const interpretWithLib = (mainSource: string, libSource: string): number => {
  const config = buildMainConfig(mainSource);
  const nativeConfig = buildLibConfig(libSource);
  return interpretAll(['main'], config, nativeConfig);
};

const createArrayLibSource =
  'export function createArray<T>(length: number): T[] { return new Array<T>(length); }';
const complexLibSource =
  createArrayLibSource +
  '\n' +
  'export function complexCalculation(n: number): number { let result = 0; for (let i = 0; i < n; i++) { result += helper(i); } return result; }' +
  '\n' +
  'function helper(x: number): number { return x * x + 1; }';

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
  const config = buildMainConfig(
    'extern use { get } from lib; extern fn get<T>() : I32; get<Bool>()'
  );
  const nativeConfig = buildLibConfig('export function get<T>() { return 100; }');
  expect(interpretAll(['main'], config, nativeConfig)).toBe(100);
});

test('interpretAll reports missing native exports with context', () => {
  const config = buildMainConfig(
    'extern use { resizeArray } from lib; extern fn resizeArray<T>(ptr : *mut [T], length : USize) : *mut [T]; 0'
  );
  const nativeConfig = buildLibConfig('export function createArray<T>() { return 0; }');
  expect(() => interpretAll(['main'], config, nativeConfig)).toThrow(
    'native export not found: resizeArray. Cause: extern use references a native export that does not exist. Fix: export resizeArray from lib.ts or remove it. Context: module lib.'
  );
});

test('interpretAll reports missing extern fn export with context', () => {
  const config = buildMainConfig(
    'extern use { createArray } from lib; extern fn resizeArray<T>(ptr : *mut [T], length : USize) : *mut [T]; 0'
  );
  const nativeConfig = buildLibConfig('export function createArray<T>() { return 0; }');
  expect(() => interpretAll(['main'], config, nativeConfig)).toThrow(
    'native export not found: resizeArray. Cause: extern fn declares a native symbol without a matching export. Reason: extern functions must be provided by a native module. Fix: add extern use { resizeArray } from lib and export it from lib.ts. Context: module lib.'
  );
});

test('interpretAll allows unused void native functions', () => {
  const config = buildMainConfig(
    'extern use { createArray } from lib; extern fn createArray<T>(length : USize) : *[T]; 0'
  );
  const nativeConfig = buildLibConfig(
    'export function createArray<T>(length: number) { return new Array<T>(length); }\nexport function println(content: string) { console.log(content); }'
  );
  expect(interpretAll(['main'], config, nativeConfig)).toBe(0);
});

test('interpretAll handles native createArray without copying arrays', () => {
  const config = buildMainConfig(
    'extern use { createArray } from lib; extern fn createArray<T>(length : USize) : *[T]; let array = createArray<I32>(3); 0'
  );
  const nativeConfig = buildLibConfig(
    'export function createArray<T>(length: number) { return new Array<T>(length); }'
  );
  expect(interpretAll(['main'], config, nativeConfig)).toBe(0);
});

test('buildReplInputs should not load index.ts as a native module', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-native-'));
  const srcDir = path.join(tempDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  // Create a minimal index.tuff
  fs.writeFileSync(path.join(srcDir, 'index.tuff'), '100');
  // Create index.ts (simulating the interpreter source file)
  fs.writeFileSync(
    path.join(srcDir, 'index.ts'),
    'export function interpret() { if (true) { return 0; } return 1; }'
  );
  // Create lib.ts (actual native module)
  fs.writeFileSync(path.join(srcDir, 'lib.ts'), 'export const x = 7;');

  const replInputs = buildReplInputs(tempDir);
  // Verify index.ts is not in nativeConfig and lib.ts is present
  const nativeKeys = Array.from(replInputs.nativeConfig.keys());
  const hasIndex = nativeKeys.some((key) => key.length === 1 && key[0] === 'index');
  const hasLib = nativeKeys.some((key) => key.length === 1 && key[0] === 'lib');
  expect(hasIndex).toBe(false);
  expect(hasLib).toBe(true);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('interpretAll handles mutable array from native function', () => {
  expect(
    interpretWithLib(
      'extern use { createArray } from lib; extern fn createArray<T>(length : USize) : *mut [T]; let array = createArray<I32>(1); array[0] = 100; array[0]',
      createArrayLibSource
    )
  ).toBe(100);
});

test('interpretAll handles complex native function with unrestricted syntax', () => {
  expect(
    interpretWithLib(
      'extern use { complexCalculation } from lib; extern fn complexCalculation(n : I32) : I32; complexCalculation(5)',
      complexLibSource
    )
  ).toBe(35);
});
