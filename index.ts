export function compileTuffToJS(tuffSource: string): string {
  // Strip environment-injected variable declarations
  let js = tuffSource.replace(/in let \w+;?\s*/g, "");
  // Wrap bare numeric expressions in process.exit()
  js = js.replace(/^(\d+)$/gm, "process.exit($1)");
  return js;
}
