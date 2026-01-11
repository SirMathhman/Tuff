import { expect, test } from "vitest";
import { interpret } from "../src/interpret";

test("simple match with literal and wildcard cases", () => {
  const res = interpret(
    "let result = match (100) { case 100 => 2; case _ => 1; }; result"
  );
  expect(res).toEqual({ ok: true, value: 2 });
});

test("match chooses wildcard when no literal matches", () => {
  const res = interpret(
    "let result = match (5) { case 100 => 2; case _ => 1; }; result"
  );
  expect(res).toEqual({ ok: true, value: 1 });
});
