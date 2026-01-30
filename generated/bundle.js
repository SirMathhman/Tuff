process.exit((function() {
const __tuff_native_module_lib = (function() {
const exports = {};
const module = { exports: exports };
"use strict";
// This file is expected to change substantially and should not be depended on for tests.
Object.defineProperty(exports, "__esModule", { value: true });
exports.alloc = alloc;
exports.free = free;
exports.checkMemoryOrPanic = checkMemoryOrPanic;
exports.readContent = readContent;
exports.println = println;
exports.format = format;
let allocated = 0;
function alloc(length) {
    allocated += length;
    return new Array(length);
}
function free(toFree) {
    allocated -= toFree.length;
}
function checkMemoryOrPanic() {
    if (allocated !== 0) {
        throw new Error('Memory leak detected: ' + allocated + ' items still allocated. Compiled code did not free all allocated memory as expected.');
    }
}
const fs = require("fs");
function readContent() {
    // READ the README.md file using fs
    return fs.readFileSync('README.md', 'utf-8');
}
function println(content) {
    console.log(content);
}
// This should be similar to C's snprintf_s (use the secure function as a model, don't use the insecure one).
function format(msg, ...args) {
    // Example invocation: format("Expected '%s', but was actually '%s'.", expectedValue, actualValue)
    // This is a trivial and nonrobust implementation.
    let formatted = msg;
    for (let i = 0; i < args.length; i++) {
        const placeholder = '%s';
        const argStr = String(args[i]);
        formatted = formatted.replace(placeholder, argStr);
    }
    return formatted;
}

return module.exports;
})();
const __tuff_extern_alloc = __tuff_native_module_lib.alloc;
const __tuff_extern_free = __tuff_native_module_lib.free;
const __tuff_extern_checkMemoryOrPanic = __tuff_native_module_lib.checkMemoryOrPanic;
const __tuff_extern_format = __tuff_native_module_lib.format;
const __tuff_extern_readContent = __tuff_native_module_lib.readContent;
const __tuff_extern_println = __tuff_native_module_lib.println;
function alloc(length) { return __tuff_extern_alloc(length); } function free(_this) { return (() => { return __tuff_extern_free(_this);; })(); } function checkMemoryOrPanic() { return (() => { return __tuff_extern_checkMemoryOrPanic();; })(); } function readContent() { return __tuff_extern_readContent(); } function println(content) { return (() => { return __tuff_extern_println(content);; })(); } function format(message) { return __tuff_extern_format(message); } const None = (function () {  return {  }; })(); function expect(actualValue, equator) { return (() => { return 0; })(); } println("100"); checkMemoryOrPanic(); return +(0);
})());