const regex =
  /!*[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?(?:[uUiI](?:8|16|32|64)|bool)?|!*[a-zA-Z_]\w*(?:\.\w+)*/g;
const str = "myPoint.x + myPoint.y";
console.log("Testing string:", str);
let m;
while ((m = regex.exec(str))) {
  console.log("Token:", m[0]);
}
