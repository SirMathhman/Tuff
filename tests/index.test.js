const { main } = require("../src/index.js");

describe("main", () => {
  it("should log a greeting", () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    main();
    expect(spy).toHaveBeenCalledWith("Hello from Tuff!");
    spy.mockRestore();
  });
});
