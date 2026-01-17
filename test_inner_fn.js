"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var interpret_1 = require("./src/interpret");
var testCases = [
    '{ fn get() => 100; } get()',
    'fn get() => 100; get()',
    '{ let x = 5; } x',
    '{ fn f() => 42; f() }',
];
for (var _i = 0, testCases_1 = testCases; _i < testCases_1.length; _i++) {
    var test_1 = testCases_1[_i];
    var result = (0, interpret_1.interpret)(test_1);
    console.log("\"".concat(test_1, "\" => ").concat(JSON.stringify(result)));
}
