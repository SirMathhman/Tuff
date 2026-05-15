export function compileTuffToTS(tuffSourceCode: string): string {
  if (tuffSourceCode === "") {
    return "return 0;";
  }
  // Handle read<U8>() - parse stdin as unsigned 8-bit integer
  const match = tuffSourceCode.match(/^read<U8>\(\)$/);
  if (match) {
    return `const value = parseInt(stdIn, 10);\nreturn value;`;
  }
  throw new Error(
    "Throws error by default, invalid source code: " + tuffSourceCode,
  );
}
