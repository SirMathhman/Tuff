process.exit((function() {
  return (2 + (function() { let x = 3; return x; })()) * 4;
})());