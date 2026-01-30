process.exit((function() {
  return (function() {
  const result = 1 + 255;
  if (result < 0 || result > 255) {
    throw new Error("Overflow: " + result + " is above maximum for U8 (255)");
  }
  return result;
})();
})());