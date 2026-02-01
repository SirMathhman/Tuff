import { greet } from '../src/index.js';

test('greet', () => {
  expect(greet('World')).toBe('Hello, World!');
});
