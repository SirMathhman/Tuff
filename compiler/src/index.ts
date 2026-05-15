export function compileTuffToTS(tuffSourceCode: string): string {
  if (tuffSourceCode === "") {
    return "return 0;";
  }

  // Handle read<U8>(), read<U16>() etc. - parse stdin as unsigned integer
  const prefix = "read<U";
  const suffix = ">()";
  if (tuffSourceCode.startsWith(prefix) && tuffSourceCode.endsWith(suffix)) {
    const inner = tuffSourceCode.slice(
      prefix.length,
      tuffSourceCode.length - suffix.length,
    );
    // Check that inner contains only digits
    let valid = true;
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (!ch || ch < "0" || ch > "9") {
        valid = false;
        break;
      }
    }
    if (valid && inner.length > 0) {
      return "const value = parseInt(stdIn, 10);\nreturn value;";
    }
  }

  throw new Error(
    "Throws error by default, invalid source code: " + tuffSourceCode,
  );
}
