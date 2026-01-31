process.exit(Number((function() {
  function getFirst(array) { return array[0]; };
let array = [];
array[0] = 120;
return getFirst(array);;
})()));