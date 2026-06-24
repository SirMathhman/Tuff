// TODO: setup Jest

import { test, expect } from "jest";
import { compileTuffToJS } from ".";

function expectValid(source, stdIn, expectedExitCode) {
  const compiledJS = compileTuffToJS(source);
  const actualExitCode = new Function(compiledJS, "stdIn")(stdIn);
  expect(expectedExitCode).toBe(actualExitCode);
}


