export function greet(name = 'world') {
  return `Hello, ${name}!`;
}

if (import.meta.main) {
  // entrypoint when run directly with bun
  // eslint-disable-next-line no-console
  console.log(greet());
}
