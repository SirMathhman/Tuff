export function createArray() {
  return new Array(3);
}

export function complexCalculation(n: number): number {
  let result = 0;
  for (let i = 0; i < n; i++) {
    result += helper(i);
  }
  return result;
}

function helper(x: number): number {
  return x * x + 1;
}
