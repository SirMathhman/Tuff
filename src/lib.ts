export function createArray<T>(length: number): T[] {
  return new Array<T>(length);
}

export function resizeArray<T>(_ptr: T[], length: number): T[] {
  return new Array<T>(length);
}

export function println(content: string) {
  console.log(content);
}
