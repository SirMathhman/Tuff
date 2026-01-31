process.exit(Number((function() {
  let x = 0;
while (x < 4) (function() { return x += 1; })();
return x;
})()));