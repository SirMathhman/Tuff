import compileTuffToJS from "../src/index.js";

function executeTuff(source, stdIn = "") {
  const compiled = compileTuffToJS(source);
  return new Function("stdIn", compiled)(stdIn);
}

test('executeTuff generic identity: "fn pass<T>(value : T) => value; pass(read())" with stdin "100" => 100', () => {
  expect(
    executeTuff("fn pass<T>(value : T) => value; pass(read())", "100"),
  ).toBe(100);
});

test('executeTuff generic struct: "struct Wrapper<T> { x : T } let temp : Wrapper<I32> = { x : 100 }; temp is { x : I32 }" => 1', () => {
  expect(
    executeTuff(
      "struct Wrapper<T> { x : T } let temp : Wrapper<I32> = { x : 100 }; temp is { x : I32 }",
    ),
  ).toBe(1);
});
