import { describe } from "bun:test";
import { itBoth } from "../test-helpers";

describe("arithmetic - basic - types", () => {
  itBoth("returns 0 for empty string", (assertValid) => {
    assertValid("", 0);
  });

  itBoth("parses a number string and returns the number", (assertValid) => {
    assertValid("100", 100);
  });

  itBoth(
    "parses a number with a type suffix and returns the number",
    (assertValid) => {
      assertValid("100U8", 100);
    },
  );

  itBoth(
    "throws for negative value with unsigned suffix",
    (_assertValid, assertInvalid) => {
      assertInvalid("-100U8");
    },
  );

  itBoth(
    "throws for overflow with unsigned suffix U8",
    (_assertValid, assertInvalid) => {
      assertInvalid("256U8");
    },
  );
});

describe("arithmetic - basic - addition", () => {
  itBoth("parses simple addition with typed literals", (assertValid) => {
    assertValid("1U8 + 2U8", 3);
  });

  itBoth(
    "throws on overflow when adding two U8 values",
    (_assertValid, assertInvalid) => {
      assertInvalid("1U8 + 255U8");
    },
  );

  itBoth(
    "parses addition with mixed typed and untyped operands",
    (assertValid) => {
      assertValid("1 + 2U8", 3);
    },
  );

  itBoth(
    "parses addition with typed operand on left and untyped on right",
    (assertValid) => {
      assertValid("1U8 + 2", 3);
    },
  );

  itBoth("parses chained addition expressions", (assertValid) => {
    assertValid("1 + 2 + 3", 6);
  });

  itBoth("parses mixed addition and subtraction", (assertValid) => {
    assertValid("2 + 3 - 4", 1);
  });
});

describe("arithmetic - basic - precedence", () => {
  itBoth(
    "respects operator precedence: multiplication before subtraction",
    (assertValid) => {
      assertValid("2 * 3 - 4", 2);
    },
  );

  itBoth(
    "respects operator precedence: multiplication before addition",
    (assertValid) => {
      assertValid("2 + 3 * 4", 14);
    },
  );

  itBoth("respects parentheses for grouping", (assertValid) => {
    assertValid("(2 + 3) * 4", 20);
  });
});

describe("arithmetic - unary", () => {
  itBoth(
    "supports logical not operator on boolean literal true",
    (assertValid) => {
      assertValid("!true", 0);
    },
  );

  itBoth(
    "supports logical not operator on boolean literal false",
    (assertValid) => {
      assertValid("!false", 1);
    },
  );

  itBoth("supports logical not on variable", (assertValid) => {
    assertValid("let x = true; !x", 0);
  });

  itBoth("supports logical not on expression", (assertValid) => {
    assertValid("!(1 + 1 > 2)", 1);
  });

  itBoth("supports double negation", (assertValid) => {
    assertValid("!!true", 1);
  });
});

describe("arithmetic - unary - minus", () => {
  itBoth("supports unary minus on positive number", (assertValid) => {
    assertValid("-(5)", -5);
  });

  itBoth("supports unary minus on variable", (assertValid) => {
    assertValid("let x = 10; -x", -10);
  });

  itBoth("supports unary minus on expression", (assertValid) => {
    assertValid("-(2 + 3)", -5);
  });
});
