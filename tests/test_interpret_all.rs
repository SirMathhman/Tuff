use std::collections::HashMap;
use tuff::interpret_all;

#[test]
fn interpret_all_simple_expression() {
    let mut sources = HashMap::new();
    sources.insert("main".to_string(), "100 + 200".to_string());
    let result = interpret_all("main", sources);
    assert_eq!(result, Ok("300".to_string()));
}

#[test]
fn interpret_all_with_variables() {
    let mut sources = HashMap::new();
    sources.insert(
        "main".to_string(),
        "let x = 100; let y = 200; x + y".to_string(),
    );
    let result = interpret_all("main", sources);
    assert_eq!(result, Ok("300".to_string()));
}

#[test]
fn interpret_all_with_function() {
    let mut sources = HashMap::new();
    sources.insert(
        "main".to_string(),
        "fn add(a : I32, b : I32) => a + b; add(100, 200)".to_string(),
    );
    let result = interpret_all("main", sources);
    assert_eq!(result, Ok("300".to_string()));
}

#[test]
fn interpret_all_missing_main() {
    let mut sources = HashMap::new();
    sources.insert("other".to_string(), "100".to_string());
    let result = interpret_all("main", sources);
    assert!(result.is_err());
    assert_eq!(
        result,
        Err("main file 'main' not found in source set".to_string())
    );
}

#[test]
fn interpret_all_custom_main_name() {
    let mut sources = HashMap::new();
    sources.insert("program".to_string(), "42".to_string());
    let result = interpret_all("program", sources);
    assert_eq!(result, Ok("42".to_string()));
}
#[test]
fn interpret_all_array_indexing() {
    let mut sources = std::collections::HashMap::new();
    sources.insert(
        "main".to_string(),
        "let array : [I32; 3; 3] = [1, 2, 3]; array[0]".to_string(),
    );
    let result = interpret_all("main", sources);
    assert_eq!(result, Ok("1".to_string()));
}
