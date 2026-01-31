process.exit(Number((function() {
  let x = 0;
let y = {value: x};
return y.value = 100;
x;
})()));