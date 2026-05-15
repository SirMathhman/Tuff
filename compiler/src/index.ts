export function compileTuffToTS(tuffSourceCode: string): string {
  if (tuffSourceCode === "") {
    return "return 0;";
  }
  throw new Error(
    "Throws error by default, invalid source code: " + tuffSourceCode,
  );
}
