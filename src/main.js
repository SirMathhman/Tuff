process.exit(Number((function() {
  function Outer() { function Inner() { let innerScope = this; let outerScope = innerScope.this; return outerScope; }; function get() { return 100; }; let o = {Inner: Inner, get: get}; o.this = o; return o; };
let obj = Outer();
let outerScope = obj.Inner();
return outerScope.get();
})()));