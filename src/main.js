process.exit(Number((function() {
  function Point(x, y) { function manhattan() { return x + y; }; let o = {x: x, y: y, manhattan: manhattan}; o.this = o; return o; };
let point = Point(3, 4);
return point.manhattan();
})()));