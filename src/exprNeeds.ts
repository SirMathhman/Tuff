export function needsArithmetic(s: string): boolean {
  return (
    s.indexOf("+") !== -1 ||
    s.indexOf("-") !== -1 ||
    s.indexOf("*") !== -1 ||
    s.indexOf("/") !== -1 ||
    s.indexOf("<") !== -1 ||
    s.indexOf(">") !== -1 ||
    s.indexOf("==") !== -1 ||
    s.indexOf("!=") !== -1 ||
    s.indexOf("&&") !== -1 ||
    s.indexOf("||") !== -1 ||
    s.startsWith("if ") ||
    s.startsWith("if(")
  );
}
