import fs from 'fs';
import os from 'os';
import path from 'path';
import { add, buildReplInputs } from '../src/index';
import { assertAllInvalid, assertAllValid } from './utils';

const buildMainConfig = (source: string) => new Map([[['main'], source]]);
const buildLibConfig = (source: string) => new Map([[['lib'], source]]);

const assertWithLib = (mainSource: string, libSource: string, expected: number): void => {
  const config = buildMainConfig(mainSource);
  const nativeConfig = buildLibConfig(libSource);
  assertAllValid(['main'], config, nativeConfig, expected);
};

const createArrayLibSource = 'export function createArray<T>(length: number): T[] { return new Array<T>(length); }';
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
  assertAllValid(['main'], config, new Map(), 100);
});

test('interpretAll supports struct type aliases', () => {
  const config = buildMainConfig('struct Some {} type OtherSome = Some; 0');
  assertAllValid(['main'], config, new Map(), 0);
});

test('buildReplInputs loads src tree for repl', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-repl-'));
  const srcDir = path.join(tempDir, 'src');
  fs.mkdirSync(path.join(srcDir, 'foo', 'bar'), { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'index.tuff'), 'use { pass } from lib; pass<I32>(100)');
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

  assertAllValid(replInputs.inputs, replInputs.config, replInputs.nativeConfig, 100);
});

test('interpretAll supports extern native bindings', () => {
  const config = new Map([[['main'], 'extern use { myConst } from lib; extern let myConst : I32; myConst']]);
  const nativeConfig = new Map([[['lib'], 'export const myConst = 100;']]);
  assertAllValid(['main'], config, nativeConfig, 100);
});

test('interpretAll reports missing native module', () => {
  const config = new Map([[['main'], 'extern use { myConst } from lib; extern let myConst : I32; myConst']]);
  const nativeConfig = new Map();
  assertAllInvalid(['main'], config, nativeConfig);
});

test('interpretAll supports extern native functions', () => {
  const config = new Map([[['main'], 'extern use { get } from lib; extern fn get() : I32; get()']]);
  const nativeConfig = new Map([[['lib'], 'export function get() { return 100; }']]);
  assertAllValid(['main'], config, nativeConfig, 100);
});

test('interpretAll supports generic extern native functions', () => {
  const config = buildMainConfig('extern use { get } from lib; extern fn get<T>() : I32; get<Bool>()');
  const nativeConfig = buildLibConfig('export function get<T>() { return 100; }');
  assertAllValid(['main'], config, nativeConfig, 100);
});

test('interpretAll reports missing native exports with context', () => {
  const config = buildMainConfig('extern use { resizeArray } from lib; extern fn resizeArray<T>(ptr : *mut [T], length : USize) : *mut [T]; 0');
  const nativeConfig = buildLibConfig('export function createArray<T>() { return 0; }');
  assertAllInvalid(['main'], config, nativeConfig);
});

test('interpretAll reports missing extern fn export with context', () => {
  const config = buildMainConfig('extern use { createArray } from lib; extern fn resizeArray<T>(ptr : *mut [T], length : USize) : *mut [T]; 0');
  const nativeConfig = buildLibConfig('export function createArray<T>() { return 0; }');
  assertAllInvalid(['main'], config, nativeConfig);
});

test('interpretAll allows unused void native functions', () => {
  const config = buildMainConfig('extern use { createArray } from lib; extern fn createArray<T>(length : USize) : *[T]; 0');
  const nativeConfig = buildLibConfig(
    'export function createArray<T>(length: number) { return new Array<T>(length); }\nexport function println(content: string) { console.log(content); }'
  );
  assertAllValid(['main'], config, nativeConfig, 0);
});

test('interpretAll handles native createArray without copying arrays', () => {
  const config = buildMainConfig('extern use { createArray } from lib; extern fn createArray<T>(length : USize) : *[T]; let array = createArray<I32>(3); 0');
  const nativeConfig = buildLibConfig('export function createArray<T>(length: number) { return new Array<T>(length); }');
  assertAllValid(['main'], config, nativeConfig, 0);
});

test('buildReplInputs loads index.ts as a native module', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-native-'));
  const srcDir = path.join(tempDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  // Create a minimal index.tuff
  fs.writeFileSync(path.join(srcDir, 'index.tuff'), '100');
  // Create index.ts (can be used as a native module)
  fs.writeFileSync(path.join(srcDir, 'index.ts'), 'export function interpret() { return 99; }');
  // Create lib.ts (actual native module)
  fs.writeFileSync(path.join(srcDir, 'lib.ts'), 'export const x = 7;');

  const replInputs = buildReplInputs(tempDir);
  // Verify both index.ts and lib.ts are in nativeConfig
  const nativeKeys = Array.from(replInputs.nativeConfig.keys());
  const hasIndex = nativeKeys.some((key) => key.length === 1 && key[0] === 'index');
  const hasLib = nativeKeys.some((key) => key.length === 1 && key[0] === 'lib');
  expect(hasIndex).toBe(true);
  expect(hasLib).toBe(true);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('interpretAll handles mutable array from native function', () => {
  assertWithLib(
    'extern use { createArray } from lib; extern fn createArray<T>(length : USize) : *mut [T]; let array = createArray<I32>(1); array[0] = 100; array[0]',
    createArrayLibSource,
    100
  );
});

test('interpretAll handles complex native function with unrestricted syntax', () => {
  assertWithLib('extern use { complexCalculation } from lib; extern fn complexCalculation(n : I32) : I32; complexCalculation(5)', complexLibSource, 35);
});
