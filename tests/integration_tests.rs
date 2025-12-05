use tuff::interpret;

#[test]
fn interpret_returns_same_string() {
    let input = "hello world";
    let out = interpret(input);
    assert_eq!(out, Err("invalid input".to_string()));
    // boolean literals return as-is
    assert_eq!(interpret("true"), Ok("true".to_string()));
    assert_eq!(interpret("false"), Ok("false".to_string()));
}

#[test]
fn interpret_strips_type_like_suffix() {
    assert_eq!(interpret("100U8"), Ok("100".to_string()));
    assert_eq!(interpret("123U16"), Ok("123".to_string()));
    assert_eq!(interpret("7I32"), Ok("7".to_string()));
    assert_eq!(interpret("900U64"), Ok("900".to_string()));

    // Case-sensitive: lowercase should not match and is unexpected
    assert!(interpret("42u32").is_err());

    // Don't strip when letters are part of a word -> unexpected
    assert!(interpret("valueU16").is_err());

    // digits-only should be unchanged
    assert_eq!(interpret("12345"), Ok("12345".to_string()));

    // Negative value with unsigned suffix is invalid
    assert!(interpret("-100U8").is_err());

    // values above the unsigned max are invalid
    assert!(interpret("256U8").is_err());
    assert_eq!(interpret("255U8"), Ok("255".to_string()));

    // Simple addition of same-suffix operands
    assert_eq!(interpret("1U8 + 2U8"), Ok("3".to_string()));

    // Chained addition where plain numbers adopt the suffixed type
    assert_eq!(interpret("1U8 + 3 + 2U8"), Ok("6".to_string()));

    // Chained expression with subtraction
    assert_eq!(interpret("10U8 + 3 - 5U8"), Ok("8".to_string()));

    // Multiplication then subtraction, left-to-right evaluation
    assert_eq!(interpret("10U8 * 3 - 5U8"), Ok("25".to_string()));

    // Signed multiplication then subtraction
    assert_eq!(interpret("10I8 * 3 - 5I8"), Ok("25".to_string()));

    // Parentheses + precedence: multiplication outside parentheses.
    assert_eq!(interpret("10I8 * (3 - 5I8)"), Ok("-20".to_string()));

    // Simple declaration and usage (no-type declaration supported)
    assert_eq!(
        interpret("let x : I8 = 10I8 * (3 - 5I8); x"),
        Ok("-20".to_string())
    );

    // Duplicate declarations should be an error
    assert!(interpret("let x : I32 = 100; let x : I32 = 200;").is_err());

    // Declaration-only returns empty string
    assert_eq!(interpret("let x : I32 = 100;"), Ok("".to_string()));

    // Declaration without type should work: let x = 100; x => "100"
    assert_eq!(interpret("let x = 100; x"), Ok("100".to_string()));

    // Mutable variable and assignment
    assert_eq!(
        interpret("let mut x = 100; x = 200; x"),
        Ok("200".to_string())
    );

    // Braced statement block should work the same
    assert_eq!(
        interpret("{let mut x = 100; x = 200; x}"),
        Ok("200".to_string())
    );

    // Braced expression as a statement should also work
    assert_eq!(
        interpret("let mut x = 100; x = 200; {x}"),
        Ok("200".to_string())
    );

    // Multi-statement braced block should also work and modify outer env
    assert_eq!(
        interpret("let mut x = 100; {x = 200; x}"),
        Ok("200".to_string())
    );

    // Block expressions used as RHS should evaluate in a local scope
    assert_eq!(
        interpret("let x = {let y = 200; y}; x"),
        Ok("200".to_string())
    );

    // Top-level braced block with nested block RHS should evaluate correctly
    assert_eq!(
        interpret("{let x = {let y = 200; y}; x}"),
        Ok("200".to_string())
    );

    // Declaration with explicit type but no initializer should be allowed,
    // then assignment and usage later should work.
    assert_eq!(interpret("let x : I32; x = 200; x"), Ok("200".to_string()));
    assert_eq!(
        interpret("{let x : I32; x = 200; x}"),
        Ok("200".to_string())
    );

    // Conditional execution should choose the correct branch and allow assignment
    assert_eq!(
        interpret("let x : I32; if (true) { x = 200; } else { x = 300; } x"),
        Ok("200".to_string())
    );
    assert_eq!(
        interpret("let x : I32; if (false) { x = 200; } else { x = 300; } x"),
        Ok("300".to_string())
    );
    // Single-statement then and top-level continuation should work
    assert_eq!(
        interpret("let x : I32 = 300; if (true) x = 200; x"),
        Ok("200".to_string())
    );

    // Compound assignment should work for mutable variables
    assert_eq!(interpret("let mut x = 0; x += 1; x"), Ok("1".to_string()));
    assert_eq!(interpret("let mut y = 10; y += 5; y"), Ok("15".to_string()));

    // While loop should iterate until condition false
    assert_eq!(
        interpret("let mut x = 0; while (x < 4) x += 1; x"),
        Ok("4".to_string())
    );
    // Braced while body
    assert_eq!(
        interpret("let mut z = 0; while (z < 3) { z += 1; } z"),
        Ok("3".to_string())
    );

    // Braced while with x -> should produce 4
    assert_eq!(
        interpret("let mut x = 0; while (x < 4) { x += 1; } x"),
        Ok("4".to_string())
    );
    // Assignment to immutable variable should error with a clear message
    assert_eq!(
        interpret("let x = 100; x = 200; x"),
        Err("assignment to immutable variable".to_string())
    );

    // Function definition and call (top-level, definition then invocation)
    assert_eq!(
        interpret("fn add(first : I32, second : I32) : I32 => { first + second } add(3, 4)"),
        Ok("7".to_string())
    );

    // Expression-bodied function definitions should work too
    assert_eq!(
        interpret("fn getA() : I32 => 100; getA()"),
        Ok("100".to_string())
    );
    // Expression-bodied functions without an explicit return type should work
    assert_eq!(interpret("fn getA() => 100; getA()"), Ok("100".to_string()));

    // Functions defined out-of-order should resolve at call time
    assert_eq!(
        interpret("fn getA() => getB(); fn getB() => 100; getA()"),
        Ok("100".to_string())
    );
    assert_eq!(
        interpret("fn add2(first : I32, second : I32) : I32 => first + second; add2(2, 3)"),
        Ok("5".to_string())
    );

    // Function defined with semicolons should work
    assert_eq!(
        interpret("fn simple() => 99; simple()"),
        Ok("99".to_string())
    );

    // Test if captures are being parsed
    // First, test that a function with capture syntax doesn't error during definition
    assert_eq!(
        interpret("fn withcap[&x]() => 100; 42"),
        Ok("42".to_string())
    );

    // Function with explicit return statement
    let result = interpret("fn get_five() : I32 => { return 5; } get_five()");
    eprintln!("Result: {:?}", result);
    assert_eq!(result, Ok("5".to_string()));

    // Simple struct declaration should be accepted and return empty string
    assert_eq!(interpret("struct Wrapper {}"), Ok("".to_string()));

    // Struct constructor + property access
    assert_eq!(
        interpret("struct Wrapper { value : I32} Wrapper { 100 }.value"),
        Ok("100".to_string())
    );

    // Struct declaration then variable assignment and field access
    assert_eq!(
        interpret("struct Wrapper { value : I32} let obj : Wrapper = Wrapper { 100 }; obj.value"),
        Ok("100".to_string())
    );

    // Assignment to declared I8 that overflows should error
    assert_eq!(
        interpret("let mut x : I8 = 100; x = 1000; x"),
        Err("value out of range for I8".to_string())
    );

    // typeOf helper should return type suffix for literal
    assert_eq!(interpret("typeOf(100U8)"), Ok("U8".to_string()));

    // typeOf should examine expressions and report the seen suffix
    assert_eq!(interpret("typeOf(10I8 * (3 - 5I8))"), Ok("I8".to_string()));

    // Declaration with unsigned overflow should error
    assert!(interpret("let x : U8 = 1000;").is_err());

    // Unsigned underflow should produce an error
    assert!(interpret("0U8 - 5U8").is_err());

    // Overflow when result exceeds the type max should be an error
    assert!(interpret("1U8 + 255U8").is_err());

    // Block expressions with local scoping: {let x = 3; x} + {let x = 4; x} => "7"
    assert_eq!(
        interpret("{let x = 3; x} + {let x = 4; x}"),
        Ok("7".to_string())
    );

    // Basic pointer support: address-of + dereference
    assert_eq!(
        interpret("let x = 100; let y : *I32 = &x; *y"),
        Ok("100".to_string())
    );

    // Mutable pointer type should also work with mutable target
    assert_eq!(
        interpret("let mut x = 100; let y : *mut I32 = &x; *y"),
        Ok("100".to_string())
    );

    // Write through a mutable pointer
    assert_eq!(
        interpret("let mut x = 0; let y : *mut I32 = &x; *y = 100; x"),
        Ok("100".to_string())
    );

    // Using a mutable reference operator to create a *mut pointer
    assert_eq!(
        interpret("let mut x = 0; let y : *mut I32 = &mut x; *y = 100; x"),
        Ok("100".to_string())
    );

    // Cannot take two simultaneous mutable references
    assert!(interpret("let mut x = 0; let y = &mut x; let z = &mut x;").is_err());

    // Cannot take immutable reference when a mutable borrow is active
    assert!(interpret("let mut x = 0; let y = &mut x; let z = &x;").is_err());

    // Multiple immutable references are allowed
    assert_eq!(
        interpret("let mut x = 0; let y = &x; let z = &x;"),
        Ok("".to_string())
    );

    // Function with immutable captures
    assert_eq!(
        interpret("let value = 100; fn get[&value]() => value; get()"),
        Ok("100".to_string())
    );

    // Function with immutable captures (bare syntax without &)
    assert_eq!(
        interpret("let value = 100; fn get[value]() => value; get()"),
        Ok("100".to_string())
    );

    // Function with mutable captures
    assert_eq!(
        interpret("let mut value = 100; fn addOnce[&mut value]() => value += 1; addOnce(); value"),
        Ok("101".to_string())
    );

    // Type alias: allow aliasing primitive types and using in declarations
    assert_eq!(
        interpret("type MyAlias = I32; let value : MyAlias = 100; value"),
        Ok("100".to_string())
    );
}
