import { interpret } from '../src/index';

test('interpret is a stub that returns 0 for empty input', () => {
  expect(interpret('')).toBe(0);
});

test('interpret returns 0 for arbitrary input (stub)', () => {
  expect(interpret('some input')).toBe(0);
});

test('interpret parses integer numeric literals', () => {
  expect(interpret('100')).toBe(100);
});

test('interpret ignores struct declarations', () => {
  expect(interpret('struct Empty {}')).toBe(0);
});

test('interpret rejects duplicate struct declarations', () => {
  expect(() =>
    interpret('struct Empty {} struct Empty {}')
  ).toThrow('struct already defined: Empty');
});

test('interpret rejects duplicate struct fields', () => {
  expect(() =>
    interpret('struct Empty { x : I32; x : I32; }')
  ).toThrow('duplicate struct field: x');
});

test('interpret allows structs with multiple fields', () => {
  expect(interpret('struct Point { x : I32; y : I32; }')).toBe(0);
});

test('interpret accesses struct field through variable', () => {
  expect(
    interpret('struct Wrapper { x : I32; } let value : Wrapper = Wrapper { 100 }; value.x')
  ).toBe(100);
});

test('interpret rejects struct instantiation with missing fields', () => {
  expect(() =>
    interpret('struct Wrapper { x : I32; } let value : Wrapper = Wrapper {}; value.x')
  ).toThrow();
});

test('interpret rejects access to non-existent struct field', () => {
  expect(() =>
    interpret('struct Wrapper { x : I32; } let value = Wrapper { 100 }; value.y')
  ).toThrow();
});

test('interpret creates and accesses arrays with indexing', () => {
  expect(
    interpret('let array : [I32; 1; 1] = [100]; array[0]')
  ).toBe(100);
});

test('interpret indexes array literals directly', () => {
  expect(interpret('[1, 2, 3][1]')).toBe(2);
});

test('interpret indexes arrays returned by calls', () => {
  expect(interpret('fn getFirst() => [1, 2, 3]; getFirst()[1]')).toBe(2);
});

test('interpret rejects assigning void function result', () => {
  expect(() =>
    interpret('fn outer() : Void => { fn inner() => {} } let value = outer()')
  ).toThrow('void function cannot return a value');
});

test('interpret rejects assigning inferred void function result', () => {
  expect(() => interpret('fn outer() => {} let value = outer(); value')).toThrow(
    'void function cannot return a value'
  );
});

test('interpret rejects assigning implicit void from block with inner fn', () => {
  expect(() =>
    interpret('fn outer() => { fn inner() => {} } let value = outer(); value')
  ).toThrow('void function cannot return a value');
});

test('interpret rejects array element type mismatch', () => {
  expect(() => interpret('let array : [I32; 1; 1] = [true]; array[0]')).toThrow();
});

test('interpret rejects array initializer with too few elements', () => {
  expect(() => interpret('let array : [I32; 3; 3] = [1, 2]')).toThrow();
});

test('interpret enforces numeric type constraints in declarations', () => {
  expect(interpret('let x : I32 < 10 = 5; x')).toBe(5);
  expect(() => interpret('let x : I32 < 10 = 20; x')).toThrow();
});

test('interpret supports type aliases and is operator', () => {
  expect(
    interpret('type MyAlias = I32; let temp : MyAlias = 100; temp is I32 && temp is MyAlias')
  ).toBe(1);
});

test('interpret supports forward type alias references', () => {
  expect(
    interpret('let temp : MyAlias = 100; type MyAlias = I32; temp is I32 && temp is MyAlias')
  ).toBe(1);
});

test('interpret supports generic structs', () => {
  expect(
    interpret('struct Wrapper<T> { field : T; } let wrapper : Wrapper<I32> = Wrapper<I32> { 100 }; wrapper.field')
  ).toBe(100);
});

test('interpret supports generic structs with type checking', () => {
  expect(
    interpret('struct Wrapper<T> { field : T; } let wrapper = Wrapper<Bool> { true }; wrapper.field is I32')
  ).toBe(0);
});

test('interpret supports USize type', () => {
  expect(interpret('let x : USize = 100USize; x')).toBe(100);
});

test('interpret supports tuple indexing', () => {
  expect(
    interpret(
      'let myTuple : (I32, Bool) = (100, true); if (myTuple[1]) myTuple[0] else -1'
    )
  ).toBe(100);
});

test('interpret supports generic identity function', () => {
  expect(interpret('fn pass<T>(value : T) => value; pass(100)')).toBe(100);
});

test('interpret rejects copying arrays', () => {
  expect(() =>
    interpret('let array : [I32; 3; 3] = [1, 2, 3]; let array0 = array;')
  ).toThrow();
});

test('interpret supports slice pointer indexing', () => {
  expect(
    interpret('let array = [1, 2, 3]; let slice : *[I32] = &array; slice[0] + slice[1] + slice[2]')
  ).toBe(6);
});

test('interpret allows copying slice pointers', () => {
  expect(
    interpret('let array = [1, 2, 3]; let x : *[I32] = &array; let y = x; y[0]')
  ).toBe(1);
});

test('interpret handles array indexing bounds', () => {
  expect(interpret('let array = [1, 2, 3]; array[1]')).toBe(2);
  expect(() => interpret('let array = [1, 2, 3]; array[-1]')).toThrow();
  expect(() => interpret('let array = [1, 2, 3]; array[3]')).toThrow();
});

test('interpret enforces ordered array initialization', () => {
  expect(() => interpret('let mut array : [I32; 0; 3]; array[0]')).toThrow();
  expect(interpret('let mut array : [I32; 0; 3]; array[0] = 100; array[0]')).toBe(100);
  expect(() =>
    interpret('let mut array : [I32; 0; 3]; array[1] = 1; array[0] = 2; array[0]')
  ).toThrow();
});

test('interpret allows assigning into uninitialized arrays before passing', () => {
  expect(
    interpret(
      'let mut array : [I32; 0; 3]; array[0] = 100; fn getFirst(arr : [I32; 1; 3]) => arr[0]; getFirst(array)'
    )
  ).toBe(100);
});

test('interpret rejects passing arrays with insufficient initialized elements', () => {
  expect(() =>
    interpret(
      'let mut array : [I32; 0; 3]; fn getFirst(arr : [I32; 1; 3]) => arr[0]; getFirst(array)'
    )
  ).toThrow();
});

test('interpret rejects calling a non-function variable', () => {
  expect(() => interpret('let x = 100; x()')).toThrow('function not found: x');
});

test('interpret parses integer numeric literals with unsigned suffixes', () => {
  expect(interpret('100U8')).toBe(100);
});

test('interpret throws for negative values with unsigned suffixes', () => {
  expect(() => interpret('-100U8')).toThrow('unsigned literal cannot be negative');
});

test('interpret rejects lowercase unsigned suffix', () => {
  expect(() => interpret('100u8')).toThrow('invalid suffix');
});

test('interpret throws for unsigned overflow (U8)', () => {
  expect(() => interpret('256U8')).toThrow('unsigned literal out of range');
});

test('interpret accepts max unsigned U8', () => {
  expect(interpret('255U8')).toBe(255);
});

test('interpret accepts max unsigned U16', () => {
  expect(interpret('65535U16')).toBe(65535);
});

test('interpret rejects unsigned overflow U16', () => {
  expect(() => interpret('65536U16')).toThrow('unsigned literal out of range');
});

test('interpret accepts signed I8 bounds', () => {
  expect(interpret('127I8')).toBe(127);
  expect(interpret('-128I8')).toBe(-128);
});

test('interpret rejects signed I8 overflow', () => {
  expect(() => interpret('128I8')).toThrow('signed literal out of range');
  expect(() => interpret('-129I8')).toThrow('signed literal out of range');
});

test('interpret rejects unsupported suffixes and invalid widths', () => {
  expect(() => interpret('100XYZ')).toThrow('invalid suffix');
  expect(() => interpret('100U7')).toThrow('invalid suffix');
});

test('interpret adds two U8 literals', () => {
  expect(interpret('1U8 + 2U8')).toBe(3);
});

test('interpret adds mixed literal and U8 literal', () => {
  expect(interpret('1 + 2U8')).toBe(3);
});

test('interpret adds mixed U8 literal and plain literal', () => {
  expect(interpret('1U8 + 2')).toBe(3);
});

test('interpret throws when sum overflows operand type (U8)', () => {
  expect(() => interpret('1U8 + 255')).toThrow('unsigned literal out of range');
});

test('interpret allows sum with mixed widths using wider type (U8 + U16)', () => {
  expect(interpret('1U8 + 255U16')).toBe(256);
});

test('interpret throws when sum overflows wider type in mixed-width addition', () => {
  expect(() => interpret('1U8 + 65535U16')).toThrow('unsigned literal out of range');
});

test('interpret supports chained addition', () => {
  expect(interpret('1U8 + 2U8 + 3U8')).toBe(6);
});

test('interpret supports chained addition with mixed suffixes and widths', () => {
  expect(interpret('1U8 + 2 + 1000U16')).toBe(1003);
});

test('interpret throws when chained sum overflows the widest type', () => {
  expect(() => interpret('1U8 + 1 + 254')).toThrow('unsigned literal out of range');
});

test('interpret supports addition and subtraction', () => {
  expect(interpret('2U8 + 3U8 - 4U8')).toBe(1);
});

test('interpret supports multiplication with operator precedence', () => {
  expect(interpret('2 * 3 - 4')).toBe(2);
});

test('interpret respects operator precedence (multiplication before addition)', () => {
  expect(interpret('4 + 2 * 3')).toBe(10);
});

test('interpret supports division operator', () => {
  expect(interpret('10 / 2')).toBe(5);
});

test('interpret throws on division by zero', () => {
  expect(() => interpret('10 / 0')).toThrow('division by zero');
});

test('interpret supports parenthesized expressions', () => {
  expect(interpret('(4 + 2) * 3')).toBe(18);
});

test('interpret supports curly braces as grouping operators', () => {
  expect(interpret('(4 + { 2 }) * 3')).toBe(18);
});

test('interpret supports variable declarations within braces', () => {
  expect(interpret('(4 + { let x : U8 = 2; x }) * 3')).toBe(18);
});

test('interpret supports multiple variable declarations within braces', () => {
  expect(interpret('(4 + { let x : U8 = 2; let y : U8 = x; y }) * 3')).toBe(18);
});

test('interpret supports top-level variable declarations', () => {
  expect(interpret('let z : U8 = (4 + { let x : U8 = 2; let y : U8 = x; y }) * 3; z')).toBe(18);
});

test('interpret supports variable declarations without type annotations', () => {
  expect(interpret('let x = 18; x')).toBe(18);
});

test('interpret supports variable declarations with suffix in initializer', () => {
  expect(interpret('let x : U16 = 18U8; x')).toBe(18);
});

test('interpret rejects narrowing conversions in variable declarations', () => {
  expect(() => interpret('let x : U8 = 18U16; x')).toThrow();
});

test('interpret returns 0 for a declaration without a trailing expression', () => {
  expect(interpret('let x = 100;')).toBe(0);
});

test('interpret rejects variable re-declaration in the same scope', () => {
  expect(() => interpret('let x = 100; let x = 200;')).toThrow('variable already declared');
});

test('interpret supports mutable variables and assignment', () => {
  expect(interpret('let mut x = 0; x = 100; x')).toBe(100);
});

test('interpret rejects assignment to immutable variables', () => {
  expect(() => interpret('let x = 0; x = 100;')).toThrow('cannot assign to immutable variable');
});

test('interpret rejects assignment to undefined variables', () => {
  expect(() => interpret('x = 100U16; x')).toThrow('undefined variable');
});

test('interpret rejects narrowing conversions when assigning to mutable variables', () => {
  expect(() => interpret('let mut x = 0U8; x = 100U16; x')).toThrow();
});

test('interpret returns 0 for a block ending in an assignment with a semicolon', () => {
  expect(interpret('let mut x : U16 = 100; x = 100U16;')).toBe(0);
});

test('interpret supports variable declarations without initializers', () => {
  expect(interpret('let x : U8; x = 100; x')).toBe(100);
});

test('interpret supports reassignment to mutable uninitialized variables', () => {
  expect(interpret('let mut x : U8; x = 100; x = 200; x')).toBe(200);
});

test('interpret supports Bool type and true/false literals', () => {
  expect(interpret('let x : Bool = true; x')).toBe(1);
  expect(interpret('let x : Bool = false; x')).toBe(0);
});

test('interpret evaluates conditional expressions in initializers', () => {
  expect(interpret('let x : U8 = if (true) 2 else 3; x')).toBe(2);
});

test('interpret rejects non-boolean if conditions', () => {
  expect(() => interpret('if (100) 3 else 5')).toThrow('if condition must be boolean');
});

test('interpret rejects mismatched if branches', () => {
  expect(() => interpret('if (true) true else 5')).toThrow('if branches must match types');
});

test('interpret rejects bool declarations with numeric iff branches', () => {
  expect(() => interpret('let x : Bool = if (true) 5 else 5;')).toThrow(
    'cannot convert numeric type to Bool'
  );
});

test('interpret allows widening iff results when matching declared suffix', () => {
  expect(interpret('let x : U16 = if (true) 5U16 else 5U8; x')).toBe(5);
});

test('interpret rejects narrowing iff results against declared width', () => {
  expect(() => interpret('let x : U8 = if (true) 5U16 else 5U8;')).toThrow();
});

test('interpret evaluates chained if/else-if expressions', () => {
  expect(interpret('if (false) 2 else if (false) 3 else 4')).toBe(4);
});

test('interpret evaluates empty block expressions', () => {
  expect(interpret('let mut x = 0; {} x')).toBe(0);
});

test('interpret evaluates block with assignment', () => {
  expect(interpret('let mut x = 0; { x = 1; } x')).toBe(1);
});

test('interpret keeps block-scoped variables from leaking', () => {
  expect(() => interpret('{ let mut x = 0 }; x = 1; x')).toThrow('undefined variable');
});

test('interpret handles compound assignment operators', () => {
  expect(interpret('let mut x = 0; x += 1; x')).toBe(1);
});

test('interpret rejects compound assignment to undefined variables', () => {
  expect(() => interpret('x += 1;')).toThrow('undefined variable');
});

test('interpret rejects compound assignment to boolean variables', () => {
  expect(() => interpret('let mut x = true; x += 1;')).toThrow(
    'cannot perform arithmetic on booleans'
  );
});

test('interpret rejects compound assignment with boolean rhs', () => {
  expect(() => interpret('let mut x = 0; x += true;')).toThrow(
    'cannot perform arithmetic on booleans'
  );
});

test('interpret allows compound assignment for mutable variables', () => {
  expect(interpret('let mut x = 10; x += 1; x')).toBe(11);
});

test('interpret rejects compound assignment for immutable variables', () => {
  expect(() => interpret('let x = 10; x += 1; x')).toThrow('cannot assign to immutable variable');
});

test('interpret handles while loops', () => {
  expect(interpret('let mut x = 0; while (x < 4) x += 1; x')).toBe(4);
});

test('interpret handles while loops with braces', () => {
  expect(interpret('let mut x = 0; while (x < 4) { x += 1; } x')).toBe(4);
});

test('interpret rejects non-boolean while conditions', () => {
  expect(() => interpret('let mut x = 0; while (100) x += 1; x')).toThrow(
    'while condition must be boolean'
  );
});

test('interpret rejects numeric values for Bool type', () => {
  expect(() => interpret('let x : Bool = 1;')).toThrow();
  expect(() => interpret('let x : Bool; x = 1;')).toThrow();
});

test('interpret rejects reassignment to immutable variables even if initially uninitialized', () => {
  expect(() => interpret('let x : U8; x = 100; x = 200; x')).toThrow(
    'cannot assign to immutable variable'
  );
});

test('interpret rejects arithmetic operations on boolean literals', () => {
  expect(() => interpret('true + false')).toThrow('cannot perform arithmetic on booleans');
});

test('interpret rejects arithmetic operations on boolean variables', () => {
  expect(() => interpret('let x : Bool = true; x + 1')).toThrow(
    'cannot perform arithmetic on booleans'
  );
});

test('interpret supports less-than comparison operator', () => {
  expect(interpret('let x = 0; let y = 1; x < y')).toBe(1);
  expect(interpret('let x = 1; let y = 0; x < y')).toBe(0);
});

test('interpret supports all comparison operators', () => {
  expect(interpret('1 < 2')).toBe(1);
  expect(interpret('2 < 1')).toBe(0);
  expect(interpret('1 <= 1')).toBe(1);
  expect(interpret('1 <= 0')).toBe(0);
  expect(interpret('2 > 1')).toBe(1);
  expect(interpret('1 > 2')).toBe(0);
  expect(interpret('1 >= 1')).toBe(1);
  expect(interpret('0 >= 1')).toBe(0);
  expect(interpret('1 == 1')).toBe(1);
  expect(interpret('1 == 2')).toBe(0);
  expect(interpret('1 != 2')).toBe(1);
  expect(interpret('1 != 1')).toBe(0);
});

test('interpret supports logical OR operator', () => {
  expect(interpret('true || false')).toBe(1);
  expect(interpret('false || false')).toBe(0);
  expect(interpret('let x = true; let y = false; x || y')).toBe(1);
});

test('interpret supports logical AND operator', () => {
  expect(interpret('true && false')).toBe(0);
  expect(interpret('true && true')).toBe(1);
});

test('interpret rejects equality comparison between different types (number and bool)', () => {
  expect(() => interpret('100 == true')).toThrow('cannot compare different types');
});

test('interpret rejects logical operators on numeric types', () => {
  expect(() => interpret('let x = 10U8; let y = 20U8; x || y')).toThrow(
    'logical operators only supported for booleans'
  );
});

test('interpret rejects narrowing conversions when assigning variables', () => {
  expect(() => interpret('let x = 100U16; let y : U8 = x;')).toThrow();
});

test('interpret treats un-suffixed numeric variables as I32 and rejects narrowing', () => {
  expect(() => interpret('let x = 100; let y : U8 = x; y')).toThrow();
});

test('interpret treats un-suffixed numeric variables as I32 and allows assignment to I32', () => {
  expect(interpret('let x = 100; let y : I32 = x; y')).toBe(100);
});

test('interpret handles pointer types with reference and dereference operators', () => {
  expect(interpret('let x = 100; let y : *I32 = &x; *y')).toBe(100);
});

test('interpret handles mutable pointers with assignment through dereference', () => {
  expect(interpret('let mut x = 0; let y : *mut I32 = &mut x; *y = 100; x')).toBe(100);
});

test('interpret rejects dereferencing non-pointer types', () => {
  expect(() => interpret('let x = 100; *x')).toThrow('cannot dereference non-pointer type');
});

test('interpret rejects pointer type mismatches in initialization', () => {
  expect(() => interpret('let x = 100; let y : *Bool = &x; *y')).toThrow();
});

test('interpret rejects assignment through immutable pointers', () => {
  expect(() => interpret('let mut x = 0; let y = &x; *y = 100; x')).toThrow(
    'cannot assign through immutable pointer'
  );
});

test('interpret allows multiple immutable references to the same variable', () => {
  expect(interpret('let mut x = 0; let y = &x; let z = &x; *y + *z')).toBe(0);
});

test('interpret allows a single mutable reference', () => {
  expect(interpret('let mut x = 0; let z = &mut x; *z')).toBe(0);
});

test('interpret rejects multiple mutable references to the same variable', () => {
  expect(() => interpret('let mut x = 0; let y = &mut x; let z = &mut x; *y + *z')).toThrow(
    'cannot have multiple mutable references to the same variable'
  );
});

test('interpret function definitions return 0', () => {
  expect(interpret('fn empty() : I32 => 100;')).toBe(0);
});

test('interpret rejects duplicate parameter names in functions', () => {
  expect(() => interpret('fn something(first : I32, first : I32) => {};')).toThrow(
    'duplicate parameter name: first'
  );
});

test('interpret supports void function definitions returning 0', () => {
  expect(interpret('fn empty() : Void => {};')).toBe(0);
});

test('interpret calls void functions and treats result as 0', () => {
  expect(interpret('fn empty() : Void => {}; empty()')).toBe(0);
});

test('interpret rejects bool function results assigned to numeric', () => {
  expect(() =>
    interpret('fn empty() => true; let result : I32 = empty(); result')
  ).toThrow('cannot convert Bool to numeric type');
});

test('interpret rejects duplicate function definitions', () => {
  expect(() =>
    interpret('fn empty() : Void => {}; fn empty() : Void => {};')
  ).toThrow('function already defined: empty');
});

test('interpret parses and calls parameterless functions', () => {
  expect(interpret('fn empty() : I32 => 100; empty()')).toBe(100);
});

test('interpret evaluates functions with parameters', () => {
  expect(
    interpret('fn add(first : I32, second : I32) => first + second; add(3, 4)')
  ).toBe(7);
});

test('interpret rejects function calls with missing arguments', () => {
  expect(() =>
    interpret('fn add(first : I32, second : I32) => first + second; add()')
  ).toThrow('function add expects 2 arguments, got 0');
});

test('interpret rejects boolean arguments for numeric parameters', () => {
  expect(() =>
    interpret('fn add(first : I32, second : I32) => first + second; add(true, false)')
  ).toThrow('cannot convert Bool to numeric type');
});

test('interpret rejects assigning void call result to variable', () => {
  expect(() =>
    interpret('fn empty() : Void => {}; let value = empty(); value')
  ).toThrow('void function cannot return a value');
});

test('interpret rejects boolean return for numeric function', () => {
  expect(() => interpret('fn empty() : I32 => true; empty()')).toThrow(
    'cannot return boolean value from non-bool function'
  );
});

test('interpret infers return type from function body when missing', () => {
  expect(interpret('fn empty() => true; let result = empty(); result')).toBe(1);
});

test('interpret supports forward function references', () => {
  expect(interpret('fn getA() => getB(); fn getB() => 100; getA()')).toBe(100);
});
test('interpret allows functions to access outer scope variables', () => {
  expect(interpret('let mut sum = 0; fn addOnce() => sum += 1; addOnce(); sum')).toBe(1);
});
test('interpret supports drop functions for type aliases', () => {
  expect(
    interpret(
      'let mut sum = 0; fn drop(this : MyDroppable) => sum += this; type MyDroppable = I32 then drop; let temp : MyDroppable = 100; sum'
    )
  ).toBe(100);
});

test('interpret accesses variables through this.x notation', () => {
  expect(interpret('let x = 100; this.x')).toBe(100);
});

test('interpret rejects this.x when variable does not exist', () => {
  expect(() => interpret('let y = 100; this.x')).toThrow('undefined variable: x');
});

test('interpret allows assignment through this.x notation', () => {
  expect(interpret('let mut x = 0; this.x = 100; x')).toBe(100);
});

test('interpret rejects assignment through this.x when variable is immutable', () => {
  expect(() => interpret('let x = 0; this.x = 100; x')).toThrow(
    'cannot assign to immutable variable'
  );
});

test('interpret supports this pointer type and dereference', () => {
  expect(interpret('let x = 100; let self : *This = &this; self.x')).toBe(100);
});

test('interpret supports mutable this pointer and assignment', () => {
  expect(interpret('let mut x = 0; let self : *mut This = &mut this; self.x = 100; x')).toBe(100);
});

test('interpret supports function calls through this notation', () => {
  expect(interpret('fn get() => 100; this.get()')).toBe(100);
});

test('interpret supports function pointers and calling through them', () => {
  expect(
    interpret('fn get() => 100; let func : () => I32 = get; func()')
  ).toBe(100);
});

test('interpret supports returning function pointers from functions', () => {
  expect(interpret('fn get() => 100; fn pass() : () => I32 => get; pass()()')).toBe(100);
});

test('interpret allows returning inner functions from blocks', () => {
  expect(interpret('fn outer() => { fn inner() => 100; inner } outer()()')).toBe(100);
});

test('interpret allows returning this with inner function', () => {
  expect(interpret('fn outer() => { fn inner() => 100; this } outer().inner()')).toBe(100);
});

test('interpret allows returned this to capture parameters', () => {
  expect(
    interpret('fn outer(x : I32, y : I32) => { fn inner() => x + y; this } outer(3, 4).inner()')
  ).toBe(7);
});

test('interpret allows using function name as return type alias', () => {
  expect(
    interpret(
      'fn outer(x : I32, y : I32) => { fn inner() => x + y; this } let myOuter : outer = outer(3, 4); myOuter.inner()'
    )
  ).toBe(7);
});

test('interpret allows binding inner function from returned this', () => {
  expect(
    interpret(
      'fn outer(x : I32, y : I32) => { fn inner() => x + y; this } let myOuter : outer = outer(3, 4); let myInnerFunc : () => I32 = myOuter.inner; myInnerFunc()'
    )
  ).toBe(7);
});

test('interpret allows extracting unbound function pointer with :: and calling with explicit context', () => {
  expect(
    interpret(
      'fn outer(x : I32, y : I32) => { fn inner() => x + y; this } let myOuter : outer = outer(3, 4); let myInnerFuncPtr : *(*outer) => I32 = myOuter::inner; myInnerFuncPtr(&myOuter)'
    )
  ).toBe(7);
});

test('interpret supports nested this with uppercase function names', () => {
  expect(
    interpret(
      'fn OuterClass(x : I32) => { fn InnerClass(y : I32) => { fn manhattan() => x + y; this } this } OuterClass(3).InnerClass(4).manhattan()'
    )
  ).toBe(7);
});

test('interpret supports returning this from inner function and reusing it', () => {
  expect(
    interpret(
      'fn outer(x : I32) => { fn inner() => this; this } let temp = outer(100); let inner = temp.inner(); let newOuter = inner.this; newOuter.x'
    )
  ).toBe(100);
});

test('interpret supports singleton objects', () => {
  expect(interpret('object MySingleton { let value = 100; } MySingleton.value')).toBe(100);
});

test('interpret supports singleton object methods updating state', () => {
  expect(
    interpret(
      'object MySingleton { let mut counter = 0; fn add() => counter += 1; } MySingleton.add(); MySingleton.counter'
    )
  ).toBe(1);
});

test('interpret allows functions to return this scope values', () => {
  expect(interpret('fn Wrap(x : I32) => this; Wrap(100).x')).toBe(100);
});

test('interpret supports method-style calls with this parameter', () => {
  expect(interpret('let x = 0; fn add(this : I32) => this + 1; 100.add()')).toBe(101);
});

test('interpret supports method-style calls with mutable pointer this', () => {
  expect(
    interpret(
      'let x = 0; fn addOnce(this : *mut I32) => *this = *this + 1; let mut y = 100; y.addOnce(); y'
    )
  ).toBe(101);
});

test('interpret supports singleton pointer identity equality', () => {
  expect(interpret('object MySingleton {} &MySingleton == &MySingleton')).toBe(1);
});

test('interpret distinguishes pointers to different variables', () => {
  expect(interpret('let x = 0; let y = 0; &x == &y')).toBe(0);
});

test('interpret supports char literals and returns UTF-8 code', () => {
  expect(interpret("let x : Char = 'a'; x")).toBe(97);
});

test('interpret supports various char literals', () => {
  expect(interpret("'A'")).toBe(65);
  expect(interpret("'z'")).toBe(122);
  expect(interpret("'0'")).toBe(48);
});

test('interpret supports string literals and indexing to get chars', () => {
  expect(interpret('let x : *Str = "test"; let y : Char = x[0]; y')).toBe(116); // 't'
});

test('interpret supports string indexing with different positions', () => {
  expect(interpret('let x : *Str = "hello"; x[1]')).toBe(101); // 'e'
  expect(interpret('let x : *Str = "hello"; x[4]')).toBe(111); // 'o'
});

test('interpret ignores line comments', () => {
  expect(interpret('let x = 1; // comment\n x + 1')).toBe(2);
});

test('interpret ignores block comments', () => {
  expect(interpret('let x = 1; /* comment */ x + 2')).toBe(3);
});

test('interpret keeps comment markers inside strings', () => {
  expect(interpret('let x : *Str = "//not a comment"; x[0]')).toBe(47);
  expect(interpret('let x : *Str = "/*not*/"; x[0]')).toBe(47);
});

test('interpret accesses .length property on dereferenced strings', () => {
  expect(interpret('let x : *Str = "test"; x.length')).toBe(4);
  expect(interpret('let x : *Str = "hello"; x.length')).toBe(5);
  expect(interpret('let x : *Str = ""; x.length')).toBe(0);
});