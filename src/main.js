process.exit(Number((function() {
  let y = (true ? (function() { let z = 100; return z; })() : 5);
return y;
})()));