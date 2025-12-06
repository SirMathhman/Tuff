use std::collections::HashMap;
use tuff::interpret_all;

#[test]
fn use_statement_basic() {
    let mut sources = HashMap::new();
    sources.insert("main".to_string(), "use other::value; value".to_string());
    sources.insert("other".to_string(), "out let value = 100;".to_string());
    let result = interpret_all("main", sources);
    assert_eq!(result, Ok("100".to_string()));
}

#[test]
fn use_statement_multiple_exports() {
    let mut sources = HashMap::new();
    sources.insert("main".to_string(), "use math::pi; pi".to_string());
    sources.insert(
        "math".to_string(),
        "out let pi = 314; out let e = 271;".to_string(),
    );
    let result = interpret_all("main", sources);
    assert_eq!(result, Ok("314".to_string()));
}

#[test]
fn use_statement_multiple_imports() {
    let mut sources = HashMap::new();
    sources.insert(
        "main".to_string(),
        "use lib::x; use lib::y; x + y".to_string(),
    );
    sources.insert(
        "lib".to_string(),
        "out let x = 100; out let y = 200;".to_string(),
    );
    let result = interpret_all("main", sources);
    assert_eq!(result, Ok("300".to_string()));
}

#[test]
fn use_statement_export_function() {
    let mut sources = HashMap::new();
    sources.insert(
        "main".to_string(),
        "use utils::add; add(10, 20)".to_string(),
    );
    sources.insert(
        "utils".to_string(),
        "out fn add(a : I32, b : I32) => a + b;".to_string(),
    );
    let result = interpret_all("main", sources);
    assert_eq!(result, Ok("30".to_string()));
}

#[test]
fn use_statement_module_not_found() {
    let mut sources = HashMap::new();
    sources.insert("main".to_string(), "use missing::value; value".to_string());
    let result = interpret_all("main", sources);
    assert!(result.is_err());
    assert_eq!(
        result,
        Err("module 'missing' not found in source set".to_string())
    );
}

#[test]
fn use_statement_with_computation() {
    let mut sources = HashMap::new();
    sources.insert(
        "main".to_string(),
        "use config::port; let doubled = port * 2; doubled".to_string(),
    );
    sources.insert("config".to_string(), "out let port = 8080;".to_string());
    let result = interpret_all("main", sources);
    assert_eq!(result, Ok("16160".to_string()));
}
