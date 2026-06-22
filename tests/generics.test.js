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
