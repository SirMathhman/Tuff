export function evaluateTuff(input) {
  if (input === "") {
    return 0;
  }
  return new Function(input)();
}
