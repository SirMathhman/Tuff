export function compileTuffToJS(tuffSource: string): string {
  return tuffSource.replace(/in let \w+;?\s*/g, "");
}
