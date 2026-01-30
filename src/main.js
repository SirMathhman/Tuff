process.exit((function() {
  let x = (function() { let y = 100; return y; })();
return x;
})());