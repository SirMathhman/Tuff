// Tuff Runtime Library
const print = (...args) => console.log(...args);
const input = () => { const fs = require('fs'); return fs.readFileSync(0, 'utf-8').trim(); };
const Ok = (value) => ({ kind: 'Ok', value });
const Err = (error) => ({ kind: 'Err', error });

function divide(a, b) {
  if ((b === 0)) {
    return Err("Division by zero");
  }
  return Ok((a / b));
}

let result1 = divide(10, 2);
if ((result1.kind === "Ok")) {
  print("Success:", result1.value);
} else {
  print("Error:", result1.error);
}
let result2 = divide(10, 0);
if ((result2.kind === "Ok")) {
  print("Success:", result2.value);
} else {
  print("Error:", result2.error);
}
function processResult(result) {
  if ((result.kind === "Ok")) {
    return Ok((result.value * 2));
  }
  return result;
}

let result3 = processResult(divide(20, 4));
if ((result3.kind === "Ok")) {
  print("Processed:", result3.value);
}