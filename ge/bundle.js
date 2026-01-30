process.exit(
  (function () {
    const __tuff_native_module_lib = (function () {
      const exports = {};
      const module = { exports: exports };
      ('use strict');
      // This file is expected to change substantially and should not be depended on for tests.
      Object.defineProperty(exports, '__esModule', { value: true });
      exports.alloc = alloc;
      exports.free = free;
      exports.checkMemoryOrPanic = checkMemoryOrPanic;
      exports.readContent = readContent;
      exports.println = println;
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
      const fs = require('fs');
      function readContent() {
        // READ the README.md file using fs
        return fs.readFileSync('README.md', 'utf-8');
      }
      function println(content) {
        console.log(content);
      }

      return module.exports;
    })();
    const __tuff_extern_alloc = __tuff_native_module_lib.alloc;
    const __tuff_extern_free = __tuff_native_module_lib.free;
    const __tuff_extern_checkMemoryOrPanic = __tuff_native_module_lib.checkMemoryOrPanic;
    const __tuff_extern_readContent = __tuff_native_module_lib.readContent;
    const __tuff_extern_println = __tuff_native_module_lib.println;
    function alloc(length) {
      return __tuff_extern_alloc(length);
    }
    function free(_this) {
      return (() => {
        return __tuff_extern_free(_this);
      })();
    }
    function checkMemoryOrPanic() {
      return (() => {
        return __tuff_extern_checkMemoryOrPanic();
      })();
    }
    function readContent() {
      return __tuff_extern_readContent();
    }
    function println(content) {
      return (() => {
        return __tuff_extern_println(content);
      })();
    }
    function List() {
      const __thisParent = this;
      const __thisScope = new Proxy(
        {},
        {
          get: function (_target, prop) {
            if (prop === 'this') {
              return __thisParent && __thisParent.__thisValue ? __thisParent.__thisValue : __thisParent;
            }
            if (prop === '__thisValue') {
              return _target.__thisValue;
            }
            return eval(String(prop));
          },
          set: function (_target, prop, newValue) {
            if (prop === '__thisValue') {
              _target.__thisValue = newValue;
              return true;
            }
            eval(String(prop) + ' = newValue');
            return true;
          },
        }
      );
      return (() => {
        let array = alloc.call(__thisScope, 10);
        function set(index, element) {
          const __thisParent = this;
          const __thisScope = new Proxy(
            {},
            {
              get: function (_target, prop) {
                if (prop === 'this') {
                  return __thisParent && __thisParent.__thisValue ? __thisParent.__thisValue : __thisParent;
                }
                if (prop === '__thisValue') {
                  return _target.__thisValue;
                }
                return eval(String(prop));
              },
              set: function (_target, prop, newValue) {
                if (prop === '__thisValue') {
                  _target.__thisValue = newValue;
                  return true;
                }
                eval(String(prop) + ' = newValue');
                return true;
              },
            }
          );
          return (() => {
            array[index] = element;
            return __thisScope.this;
          })();
        }
        function getFirst() {
          return array[0];
        }
        if (typeof free === 'function') {
          free(array);
        }
        const __thisValue = {
          this: typeof __thisParent !== 'undefined' ? __thisParent.__thisValue || __thisParent : undefined,
          get array() {
            return array;
          },
          set array(newValue) {
            array = newValue;
          },
          set: set,
          getFirst: getFirst,
        };
        if (typeof __thisScope !== 'undefined') __thisScope.__thisValue = __thisValue;
        return __thisValue;
      })();
    }
    List().set(0, 100).getFirst();
    println(readContent());
    checkMemoryOrPanic();
    return +100;
  })()
);
