process.exit(Number((function() {
  function Wrapper(field) { return {field: field}; };
let value = Wrapper(100);
return value.field;
})()));