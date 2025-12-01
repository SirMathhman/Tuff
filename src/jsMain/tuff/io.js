// io.js - JavaScript implementation
// Maps to extern functions in io.tuff

function print(message) {
  process.stdout.write(message);
}

function println(message) {
  console.log(message);
}

module.exports = {
  print,
  println,
};
