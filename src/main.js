process.exit(Number((function() {
  function get() { let y = (true ? (function() { let z = 100; return z; })() : 5); return y; };
return get();
})()));