// @ts-expect-error: globalThis does not have getNativeValue
globalThis.getNativeValue = function () {
  return 42;
};
