

export function tokenize(tuffSource: string): string[] {
  return tuffSource
    .replaceAll("\t", " ")
    .replaceAll("(", " ( ")
    .replaceAll(")", " ) ")
    .replaceAll("{", " { ")
    .replaceAll("}", " } ")
    .replaceAll("+", " + ")
    .replaceAll("-", " - ")
    .replaceAll("*", " * ")
    .split(" ")
    .filter((token) => token !== "");
}
