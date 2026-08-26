/**
 * Whether two element lists are equal element-wise.
 *
 * @param a - The first element list.
 * @param b - The second element list.
 * @param equal - The element-wise equality predicate.
 * @returns True when the lists have equal length and equal elements.
 */
export function tupleElementsEqual<T>(
  a: readonly T[],
  b: readonly T[],
  equal: (x: T, y: T) => boolean,
): boolean {
  return a.length === b.length && a.every((el, i) => equal(el, b[i] as T));
}
