import { compileTuffToJS } from ".";

function evaluate(source: string, args: string[]) {
  const generatedJS = compileTuffToJS("in let args : &[Str]; " + source);
  const wrappedJS =
    "let __exit__ = undefined; let process = { exit : (arg) => { __exit__ = arg; } };" +
    generatedJS +
    " __exit__";

  try {
    return new Function("args", wrappedJS)(args) as number;
  } catch (e) {
    throw new Error(
      "Failed to execute runtime JS: '" + wrappedJS + "'",
      e instanceof Error ? e : new Error(JSON.stringify(e)),
    );
  }
}
