import compileTuffToJS from "../src/index.js";

function executeTuff(source, stdIn = "") {
  const compiled = compileTuffToJS(source);
  return new Function("stdIn", compiled)(stdIn);
}

test('executeTuff("let temp : { x : I32 } = { x : 100 }; temp.x") => 100', () => {
  expect(executeTuff("let temp : { x : I32 } = { x : 100 }; temp.x", "")).toBe(
    100,
  );
});

test('executeTuff struct type alias: "type Wrapper = { x : I32 }; let temp : Wrapper = { x : 100 }; temp.x" => 100', () => {
  expect(
    executeTuff(
      "type Wrapper = { x : I32 }; let temp : Wrapper = { x : 100 }; temp.x",
      "",
    ),
  ).toBe(100);
});

test('executeTuff struct keyword: "struct Wrapper { x : I32 } let temp : Wrapper = { x : 100 }; temp.x" => 100', () => {
  expect(
    executeTuff(
      "struct Wrapper { x : I32 } let temp : Wrapper = { x : 100 }; temp.x",
      "",
    ),
  ).toBe(100);
});

test('executeTuff anon struct not assignable to named struct: "struct Wrapper { x : I32 } let temp : { x : I32 } = { x : 100 }; temp is Wrapper" => 0', () => {
  expect(
    executeTuff(
      "struct Wrapper { x : I32 } let temp : { x : I32 } = { x : 100 }; temp is Wrapper",
      "",
    ),
  ).toBe(0);
});

test('executeTuff anon struct matches inline struct: "let temp : { x : I32 } = { x : 100 }; temp is { x : I32 }" => 1', () => {
  expect(
    executeTuff("let temp : { x : I32 } = { x : 100 }; temp is { x : I32 }", ""),
  ).toBe(1);
});

test('executeTuff named struct matches inline struct: "struct Wrapper { x : I32 } let temp : Wrapper = { x : 100 }; temp is { x : I32 }" => 1', () => {
  expect(
    executeTuff("struct Wrapper { x : I32 } let temp : Wrapper = { x : 100 }; temp is { x : I32 }", ""),
  ).toBe(1);
});

test('executeTuff named struct matches same named struct: "struct Wrapper { x : I32 } let temp : Wrapper = { x : 100 }; temp is Wrapper" => 1', () => {
  expect(
    executeTuff("struct Wrapper { x : I32 } let temp : Wrapper = { x : 100 }; temp is Wrapper", ""),
  ).toBe(1);
});

test('executeTuff different named structs do not match: "struct A { x : I32 } struct B { y : I32 } let temp : A = { x : 100 }; temp is B" => 0', () => {
  expect(
    executeTuff("struct A { x : I32 } struct B { y : I32 } let temp : A = { x : 100 }; temp is B", ""),
  ).toBe(0);
});
