process.exit((function() {
  let z = (2 + (function() { let x = 3; return x; })()) * 4;
return z;
})());