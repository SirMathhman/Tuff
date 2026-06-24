function Ok(value) {
  return { variant: "ok", value };
}

function Err(error) {
  return { variant: "err", error };
}

export function compileTuffToJS(source) {
  if (source.trim() === "") {
    return Ok("return 0;");
  }
  return Err("Invalid source: " + source);
}

