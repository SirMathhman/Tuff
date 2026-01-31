process.exit(Number((function() {
  function Wrapper() { function get() { return 100; }; return {get: get}; };
let obj = Wrapper();
return obj.get();
})()));