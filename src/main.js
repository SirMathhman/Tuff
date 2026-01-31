process.exit(Number((function() {
  function outer() { function inner() {  }; };
return 0;
})()));