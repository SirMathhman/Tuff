export function compileTuffToJS(tuffSource: string): string {
  // Strip environment-injected variable declarations
  let js = tuffSource.replace(/in let \w+;?\s*/g, "");
  // Wrap bare numeric/arithmetic expressions in process.exit()
  js = js.replace(/^(\d[\d+\-*/\s]*)$/gm, "process.exit($1)");
  return js;
}
