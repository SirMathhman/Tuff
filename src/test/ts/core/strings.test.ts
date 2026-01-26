import { describe } from "bun:test";
import { itBoth } from "../test-helpers";

describe("strings - basic", () => {
  itBoth("supports string length property", (assertValid) => {
    assertValid('"hello".length', 5);
  });

  itBoth("supports string length for empty string", (assertValid) => {
    assertValid('"".length', 0);
  });

  itBoth("supports string length on variable", (assertValid) => {
    assertValid('let x : Str = "test"; x.length', 4);
  });

  itBoth("supports string pointer length property", (assertValid) => {
    assertValid('let x : *Str = "test"; x.length', 4);
  });
});

describe("strings - escaping", () => {
  itBoth("supports string with escaped characters", (assertValid) => {
    assertValid('"hello\\nworld".length', 11);
  });

  itBoth("supports string with escaped tab", (assertValid) => {
    assertValid('"tab\\there".length', 8);
  });

  itBoth("supports string with escaped quotes", (assertValid) => {
    assertValid('"hello world".length', 11);
  });

  itBoth("supports string with escaped backslash", (assertValid) => {
    assertValid('"path\\\\to\\\\file".length', 12);
  });

  itBoth("supports multiple strings in expression", (assertValid) => {
    assertValid('"a".length + "bb".length', 3);
  });

  itBoth("supports string in variable and length access", (assertValid) => {
    assertValid('let msg : Str = "message"; let len = msg.length; len', 7);
  });
});

describe("strings - indexing", () => {
  itBoth("supports string indexing with literals", (assertValid) => {
    assertValid('"test"[0]', 116); // 't'
  });

  itBoth("supports string indexing at different positions", (assertValid) => {
    assertValid('"test"[1]', 101); // 'e'
  });

  itBoth("supports string indexing last character", (assertValid) => {
    assertValid('"test"[3]', 116); // 't'
  });

  itBoth("supports string indexing on variable", (assertValid) => {
    assertValid('let x : Str = "hello"; x[0]', 104); // 'h'
  });

  itBoth("supports string indexing on pointer", (assertValid) => {
    assertValid('let x : *Str = "test"; x[0]', 116); // 't'
  });

  itBoth("supports string indexing with expression index", (assertValid) => {
    assertValid('"test"[1 + 1]', 115); // 's'
  });
});

describe("strings - indexing-special", () => {
  itBoth("supports string indexing space character", (assertValid) => {
    assertValid('"a b"[1]', 32); // ' '
  });

  itBoth("supports string indexing with escaped characters", (assertValid) => {
    assertValid('"a\\nb"[1]', 10); // '\n'
  });

  itBoth("throws for string index out of bounds", (_, assertInvalid) => {
    assertInvalid('"test"[4]');
  });

  itBoth("throws for string index negative", (_, assertInvalid) => {
    assertInvalid('"test"[-1]');
  });
});
