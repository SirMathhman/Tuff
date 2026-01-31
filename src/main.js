process.exit(Number((function() {
  let x = 100;
(x < 10 ? (function() { return x = 20; })() : (function() { return x = 300; })());
return x;
})()));