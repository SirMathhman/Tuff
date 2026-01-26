import { describe } from "bun:test";
import { itBoth, itInterpreter } from "../test-helpers";

describe("modules - declarations", () => {
  itBoth("supports module declaration with function", (ok) => {
    ok("module Sample { out fn get() => 100; } Sample::get()", 100);
  });

  itBoth("supports module with multiple functions", (ok) => {
    ok(
      "module Math { out fn add(a : I32, b : I32) : I32 => a + b; out fn sub(a : I32, b : I32) : I32 => a - b; } Math::add(10, 5)",
      15,
    );
  });

  itBoth("supports accessing second function from module", (ok) => {
    ok(
      "module Math { out fn add(a : I32, b : I32) : I32 => a + b; out fn sub(a : I32, b : I32) : I32 => a - b; } Math::sub(10, 5)",
      5,
    );
  });

  itBoth("supports module with variable", (ok) => {
    ok("module Config { out let PI : I32 = 314; } Config::PI", 314);
  });

  itBoth("supports module with function accessing module variable", (ok) => {
    ok(
      "module Data { let value : I32 = 42; out fn getValue() => value; } Data::getValue()",
      42,
    );
  });

  itBoth("supports nested module access in expressions", (ok) => {
    ok("module M { out fn get() => 50; } M::get() + 50", 100);
  });
});

describe("modules - error handling", () => {
  itBoth("throws when accessing non-existent module", (_, bad) => {
    bad("NonExistent::foo()");
  });

  // Compiler doesn't validate module member existence at compile time
  itInterpreter(
    "throws when accessing non-existent member in module",
    (_, bad) => {
      bad("module Sample { out fn get() => 100; } Sample::missing()");
    },
  );
});

describe("modules - objects", () => {
  itBoth("supports object singleton with variable access", (ok) => {
    ok("object MySingleton { out let x = 100; } MySingleton.x", 100);
  });

  itBoth("supports object singleton with multiple variables", (ok) => {
    ok(
      "object Config { out let mode = 42; out let timeout = 30; } Config.mode",
      42,
    );
  });

  itBoth("supports object singleton with function", (ok) => {
    ok("object Utils { out fn getValue() => 55; } Utils.getValue()", 55);
  });

  itBoth("supports public object member with out keyword", (ok) => {
    ok("object MySingleton { out let x = 100; } MySingleton.x", 100);
  });
});

describe("modules - visibility", () => {
  // Compiler doesn't validate object member visibility at compile time
  itInterpreter(
    "throws when accessing private object member without out keyword",
    (_, bad) => {
      bad("object MySingleton { let x = 100; } MySingleton.x");
    },
  );

  itBoth("supports public module member with out keyword", (ok) => {
    ok("module Config { out let PORT = 8080; } Config::PORT", 8080);
  });

  // Compiler doesn't validate module member visibility at compile time
  itInterpreter(
    "throws when accessing private module member without out keyword",
    (_, bad) => {
      bad("module Config { let PORT = 8080; } Config::PORT");
    },
  );

  itBoth("allows accessing private members within same object", (ok) => {
    ok("object Utils { let x = 10; out fn getX() => x; } Utils.getX()", 10);
  });

  itBoth("allows accessing private members within same module", (ok) => {
    ok(
      "module Data { let secret = 42; out fn reveal() => secret; } Data::reveal()",
      42,
    );
  });
});
