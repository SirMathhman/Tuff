export function compileTuffToJS(source: string): string {
  // If the user source (after the implicit declaration) is empty, return 0 exit code
  const lastSemicolon = source.lastIndexOf(";");
  const userSource =
    lastSemicolon >= 0 ? source.slice(lastSemicolon + 1) : source;
  if (userSource.trim() === "") {
    return "process.exit(0);";
  }

  return "";
}
