use std::collections::HashMap;
use tuff::interpret_all;

#[test]
fn test_extern_use_and_fn_declaration() {
    let mut sources = HashMap::new();

    // stdlib module with a simple function that returns a value
    sources.insert(
        "stdlib".to_string(),
        "out let alloc_value = fn alloc_value(size : USize) : USize => size;".to_string(),
    );

    // main program using extern declarations
    sources.insert(
        "main".to_string(),
        "extern use stdlib;
        extern fn alloc_value<T>(size : USize) : T;
        alloc_value(100USize)"
            .to_string(),
    );

    let result = interpret_all("main", sources);
    assert_eq!(result, Ok("100".to_string()));
}

#[test]
fn test_extern_fn_without_generics() {
    let mut sources = HashMap::new();

    sources.insert(
        "libc".to_string(),
        "out let getpid = fn getpid() : I32 => 1234;".to_string(),
    );

    sources.insert(
        "main".to_string(),
        "extern use libc;
        extern fn getpid() : I32;
        getpid()"
            .to_string(),
    );

    let result = interpret_all("main", sources);
    assert_eq!(result, Ok("1234".to_string()));
}

#[test]
fn test_multiple_extern_declarations() {
    let mut sources = HashMap::new();

    sources.insert(
        "math".to_string(),
        "out let add = fn add(a : I32, b : I32) : I32 => a + b;
        out let multiply = fn multiply(a : I32, b : I32) : I32 => a * b;"
            .to_string(),
    );

    sources.insert(
        "main".to_string(),
        "extern use math;
        extern fn add(a : I32, b : I32) : I32;
        extern fn multiply(a : I32, b : I32) : I32;
        let x = add(10, 20);
        let y = multiply(x, 2);
        y"
        .to_string(),
    );

    let result = interpret_all("main", sources);
    assert_eq!(result, Ok("60".to_string()));
}

#[test]
fn test_extern_with_struct() {
    let mut sources = HashMap::new();

    sources.insert(
        "types".to_string(),
        "out let make_point = fn make_point(x : I32, y : I32) => {
            fn getX() => x;
            fn getY() => y;
            this
        };"
        .to_string(),
    );

    sources.insert(
        "main".to_string(),
        "extern use types;
        extern fn make_point(x : I32, y : I32);
        let p = make_point(10, 20);
        p.getX()"
            .to_string(),
    );

    let result = interpret_all("main", sources);
    assert_eq!(result, Ok("10".to_string()));
}
