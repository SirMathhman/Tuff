process.exit(
  Number(
    (function () {
      function a(ref) {
        let __scope = { this: null };
        __scope.this = __scope;
        ref: (ref, (__scope.ref = ref));
        function b() {
          let __scope = { this: this };
          function c() {
            return this.this.this.ref;
          }
          return c.call(__scope);
        }
        return b.call(__scope);
      }
      return a(100);
    })(),
  ),
);
