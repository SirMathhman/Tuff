import compileTuffToJS, {
  compileAllTuffToJSBundled,
  compileAllTuffWithExtern,
} from "../src/index.js";

function executeTuff(source, stdIn = "") {
  // Don't change this!
  const compiled = compileTuffToJS(source);
  return new Function("stdIn", compiled)(stdIn);
}

test('executeTuff("") => 0', () => {
  expect(executeTuff("")).toBe(0);
});

test("executeTuff(whitespace) => 0", () => {
  expect(executeTuff("   ")).toBe(0);
  expect(executeTuff("\t\n\r")).toBe(0);
  expect(executeTuff(" \n\t ")).toBe(0);
});

test('executeTuff("read()", "1") => 1', () => {
  expect(executeTuff("read()", "1")).toBe(1);
});

test('executeTuff("read()", "1 2") => 1', () => {
  expect(executeTuff("read()", "1 2")).toBe(1);
});

test('executeTuff("read() + read()", "1 2") => 3', () => {
  expect(executeTuff("read() + read()", "1 2")).toBe(3);
});

test('executeTuff("read() + read() + read()", "1 2 3") => 6', () => {
  expect(executeTuff("read() + read() + read()", "1 2 3")).toBe(6);
});

test('executeTuff("let x = read(); x", "1") => 1', () => {
  expect(executeTuff("let x = read(); x", "1")).toBe(1);
});

test('executeTuff("let mut x = read(); x = read(); x", "1 2") => 2', () => {
  expect(executeTuff("let mut x = read(); x = read(); x", "1 2")).toBe(2);
});

test('executeTuff("let mut x = read(); x += read(); x", "1 2") => 3', () => {
  expect(executeTuff("let mut x = read(); x += read(); x", "1 2")).toBe(3);
});

test('executeTuff("let mut total = 0; let count = read(); while (total < count) total += 1; total", "4") => 4', () => {
  expect(
    executeTuff(
      "let mut total = 0; let count = read(); while (total < count) total += 1; total",
      "4",
    ),
  ).toBe(4);
});

test('executeTuff("let count = read(); let mut sum = 0; for (i in 0..count) sum += i; sum", "4") => 6', () => {
  expect(
    executeTuff(
      "let count = read(); let mut sum = 0; for (i in 0..count) sum += i; sum",
      "4",
    ),
  ).toBe(6);
});

test('executeTuff("let array = [read()]; array[0]", "6") => 6', () => {
  expect(executeTuff("let array = [read()]; array[0]", "6")).toBe(6);
});

test('executeTuff("let mut array = [0]; array[0] = read(); array[0]", "6") => 6', () => {
  expect(
    executeTuff("let mut array = [0]; array[0] = read(); array[0]", "6"),
  ).toBe(6);
});

test('executeTuff("let x = read(); { let x = read(); } x", "1 2") => 1', () => {
  expect(executeTuff("let x = read(); { let x = read(); } x", "1 2")).toBe(1);
});

test('executeTuff("let x = 1; let y = &x; *y") => 1', () => {
  expect(executeTuff("let x = 1; let y = &x; *y")).toBe(1);
});

test('executeTuff("let mut x = 0; let y = &mut x; *y = read(); x", "1") => 1', () => {
  expect(
    executeTuff("let mut x = 0; let y = &mut x; *y = read(); x", "1"),
  ).toBe(1);
});

test('executeTuff("let mut array = [0]; let slice = &array; slice[0] = read(); array[0]", "1") => 1', () => {
  expect(
    executeTuff(
      "let mut array = [0]; let slice = &array; slice[0] = read(); array[0]",
      "1",
    ),
  ).toBe(1);
});

test('executeTuff("let mut array = [0]; let slice = &mut array; *slice = read(); array[0]", "1") => 1', () => {
  expect(
    executeTuff(
      "let mut array = [0]; let slice = &mut array; *slice = read(); array[0]",
      "1",
    ),
  ).toBe(1);
});

test('executeTuff("let mut array = [0, 0]; let slice = &mut array; *(slice + 1) = read(); array[1]", "1") => 1', () => {
  expect(
    executeTuff(
      "let mut array = [0, 0]; let slice = &mut array; *(slice + 1) = read(); array[1]",
      "1",
    ),
  ).toBe(1);
});

test('executeTuff("let mut array = [0, 0, 0]; let slice = &mut array[1..3]; *(slice + 1) = read(); array[2]", "1") => 1', () => {
  expect(
    executeTuff(
      "let mut array = [0, 0, 0]; let slice = &mut array[1..3]; *(slice + 1) = read(); array[2]",
      "1",
    ),
  ).toBe(1);
});

test('executeTuff("let x = 1; &x == &x") => 1', () => {
  expect(executeTuff("let x = 1; &x == &x")).toBe(1);
});

test('executeTuff("let x = 1; let y = 1; &x == &y") => 0', () => {
  expect(executeTuff("let x = 1; let y = 1; &x == &y")).toBe(0);
});

test('executeTuff("let x = readBool(); x", "true") => 1', () => {
  expect(executeTuff("let x = readBool(); x", "true")).toBe(1);
});

test('executeTuff("let mut x = 0; if (readBool()) x = 1; else x = 2; x", "true") => 1', () => {
  expect(
    executeTuff("let mut x = 0; if (readBool()) x = 1; else x = 2; x", "true"),
  ).toBe(1);
});

test('executeTuff("fn get() => read(); get()", "1") => 1', () => {
  expect(executeTuff("fn get() => read(); get()", "1")).toBe(1);
});

test('executeTuff("fn add(first, second) => first + second; add(read(), read())", "1 2") => 3', () => {
  expect(
    executeTuff(
      "fn add(first, second) => first + second; add(read(), read())",
      "1 2",
    ),
  ).toBe(3);
});

test('executeTuff("let temp = { value : read() }; temp.value", "1") => 1', () => {
  expect(executeTuff("let temp = { value : read() }; temp.value", "1")).toBe(1);
});

test('executeTuff("readString().length", "test foo") => 4', () => {
  expect(executeTuff("readString().length", "test foo")).toBe(4);
});

test('executeTuff("test".length, "test foo") => 4', () => {
  expect(executeTuff('"test".length', "test foo")).toBe(4);
});

test("compileTuffToJS throws on unexpected character", () => {
  expect(() => compileTuffToJS("@foo")).toThrow();
});

test("compileTuffToJS throws on unclosed parenthesis", () => {
  expect(() => compileTuffToJS("read(")).toThrow();
});

test("compileTuffToJS throws on bare identifier", () => {
  expect(() => compileTuffToJS("foo")).toThrow();
});

function executeAllTuffWithExtern(entryPoints, sources, externs, stdIn = "") {
  for (const entry of entryPoints) {
    if (!(entry in sources)) throw new Error(`Missing source for "${entry}"`);
    const compiled = compileAllTuffWithExtern(sources, externs, entry);
    return new Function("stdIn", compiled)(stdIn);
  }
}

function executeAllTuff(entryPoints, sources, stdIn = "") {
  for (const entry of entryPoints) {
    if (!(entry in sources)) throw new Error(`Missing source for "${entry}"`);
    const compiled = compileAllTuffToJSBundled(sources, entry);
    return new Function("stdIn", compiled)(stdIn);
  }
}

test('executeAllTuff(["index"], {"index": "read()"}, "1") => 1', () => {
  expect(executeAllTuff(["index"], { index: "read()" }, "1")).toBe(1);
});

test('executeAllTuff(["index"], {"index": "lib::x", "lib": "out let x = read();"}, "1") => 1', () => {
  expect(
    executeAllTuff(
      ["index"],
      { index: "lib::x", lib: "out let x = read();" },
      "1",
    ),
  ).toBe(1);
});

test('executeAllTuff(["index"], {"index": "lib::add(read(),read())", "lib": "let mut y = 0; out fn add(a,b) => a + b;"}, "3 4") => 7', () => {
  expect(
    executeAllTuff(
      ["index"],
      { index: "lib::add(read(),read())", lib: "out fn add(a,b) => a + b;" },
      "3 4",
    ),
  ).toBe(7);
});

test('executeAllTuff(["index"], {"index": "", "lib": ""})', () => {
  expect(executeAllTuff(["index"], { index: "", lib: "" })).toBe(0);
});

test("compileAllTuffToJSBundled throws on missing entry", () => {
  expect(() => compileAllTuffToJSBundled({ foo: "1" }, "bar")).toThrow();
});

test('executeAllTuff(["index"], {"index": "lib::x + lib::y", "lib": "out let x = read(); out let y = read();"}, "2 3") => 5', () => {
  expect(
    executeAllTuff(
      ["index"],
      {
        index: "lib::x + lib::y",
        lib: "out let x = read(); out let y = read();",
      },
      "2 3",
    ),
  ).toBe(5);
});

test('executeAllTuff(["index"], {"index": "let temp = lib; temp.x", "lib": "out let x = read();"}, "1") => 1', () => {
  expect(
    executeAllTuff(
      ["index"],
      { index: "let temp = lib; temp.x", lib: "out let x = read();" },
      "1",
    ),
  ).toBe(1);
});

test('executeAllTuff(["index"], {"index": "let { x } = lib; x", "lib": "out let x = read();"}, "1") => 1', () => {
  expect(
    executeAllTuff(
      ["index"],
      { index: "let { x } = lib; x", lib: "out let x = read();" },
      "1",
    ),
  ).toBe(1);
});

test('executeAllTuff(["index"], {"index": "lib.x", "lib": "out let x = read();"}, "1") => 1', () => {
  expect(
    executeAllTuff(
      ["index"],
      { index: "lib.x", lib: "out let x = read();" },
      "1",
    ),
  ).toBe(1);
});

test('executeAllTuffWithExtern(["index"], {"index": "extern let { add } = native; add(read(), read())"}, {"native": "export function add(first, second) { return first + second; }"}, "1 2") => 3', () => {
  expect(
    executeAllTuffWithExtern(
      ["index"],
      { index: "extern let { add } = native; add(read(), read())" },
      {
        native: "export function add(first, second) { return first + second; }",
      },
      "1 2",
    ),
  ).toBe(3);
});

test('executeAllTuff(["index"], {"index": "unknown::z"}) throws', () => {
  expect(() =>
    compileAllTuffToJSBundled({ index: "unknown::z" }, "index"),
  ).toThrow();
});
