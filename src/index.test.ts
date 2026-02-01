import { greet } from './index';

test('greet', () => {
  expect(greet('World')).toBe('Hello, World!');
});
