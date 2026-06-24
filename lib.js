function Ok(value) {
  return { variant: "ok", value };
}

function Err(error) {
  return { variant: "err", error };
}

export function compileTuffToJS(source) {
  const trimmed = source.trim();

  if (trimmed === "") {
    return Ok("return 0;");
  }

  // Split into statements by semicolon, filter out empty ones
  const statements = trimmed
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  let jsLines = [];
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    // Replace all read() calls with tokens.shift() to consume stdin sequentially
    const compiledStmt = stmt.replace(/read\(\)/g, "tokens.shift()");

    if (i === statements.length - 1) {
      jsLines.push(`return ${compiledStmt};`);
    } else {
      jsLines.push(compiledStmt + ";");
    }
  }

  const body =
    `const tokens = stdIn.split(/\\s+/).map(t => parseInt(t, 10));\n` +
    jsLines.join("\n");

  return Ok(body);
}
