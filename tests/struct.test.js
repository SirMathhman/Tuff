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

test('executeTuff struct is_check: "struct Wrapper { x : I32 } let temp : Wrapper = { x : 100 }; temp is { x : I32 }" => 1', () => {
  expect(
    executeTuff(
      "struct Wrapper { x : I32 } let temp : Wrapper = { x : 100 }; temp is { x : I32 }",
      "",
    ),
  ).toBe(1);
});
