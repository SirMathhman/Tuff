process.exit(Number((function() {
  function Wrapper() { let field = 100; return {field: field}; };
let value = Wrapper();
return value.field;
})()));