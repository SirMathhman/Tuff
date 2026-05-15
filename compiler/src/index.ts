export function compileTuffToTS(tuffSourceCode: string): string {
  if (tuffSourceCode === "") {
    return "return 0;";
  }

  // Replace all read<U...>() calls with a helper that reads from stdin tokens
  const prefix = "read<U";
  const suffix = ">()";
  let result = "";
  let i = 0;
  while (i < tuffSourceCode.length) {
    if (tuffSourceCode.slice(i, i + prefix.length) === prefix) {
      // Check for valid read pattern: read<U followed by digits and >()
      const restStart = i + prefix.length;
      let j = restStart;
      while (j < tuffSourceCode.length) {
        const ch = tuffSourceCode[j];
        if (!ch || ch < "0" || ch > "9") break;
        j++;
      }

      if (j < tuffSourceCode.length - suffix.length + 1) {
        const afterDigits = tuffSourceCode.slice(j, j + suffix.length);
        if (afterDigits === suffix) {
          result += "read()";
          i = j + suffix.length;
          continue;
        }
      }
    }
    result += tuffSourceCode[i];
    i++;
  }

  return (
    'const inputs = stdIn.split(" ").map(Number);\nlet idx = 0;\nfunction read() { return inputs[idx++]; }\nreturn ' +
    result +
    ";"
  );
}
