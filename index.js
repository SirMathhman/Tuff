function isValidChar(ch) {
  if (ch >= "0" && ch <= "9") return true;
  const allowed = " \t\n\r+-*/()";
  return allowed.indexOf(ch) !== -1;
}

function validateSource(source) {
  let i = 0;
  while (i < source.length) {
    if (source.substring(i, i + 6) === "read()") {
      i += 6;
      continue;
    }
    if (!isValidChar(source[i])) {
      return false;
    }
    i++;
  }
  return true;
}

function replaceRead(source) {
  let result = "";
  let i = 0;
  while (i < source.length) {
    if (source.substring(i, i + 6) === "read()") {
      result += "parseInt(stdIn)";
      i += 6;
    } else {
      result += source[i];
      i++;
    }
  }
  return result;
}

export function compile(source) {
  if (source === "") {
    return "return 0;";
  }

  if (!validateSource(source)) {
    throw new Error("Invalid source: " + source);
  }

  const generated = replaceRead(source);
  return "return " + generated + ";";
}
