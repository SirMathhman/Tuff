const { main, compile } = require("../src/index.js");

function run(source, stdIn) {
  const compiled = compile(source);
  return new Function("stdIn", compiled)(stdIn);
}

describe("main", () => {
  it("should log a greeting", () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    main();
    expect(spy).toHaveBeenCalledWith("Hello from Tuff!");
    spy.mockRestore();
  });
});
