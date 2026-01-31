process.exit(Number((function() {
  let x = 1;
if (x < 10) (function() { return x = 2; })();
return x;
})()));