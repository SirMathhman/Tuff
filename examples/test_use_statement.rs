use std::collections::HashMap;
use tuff::interpret_all;

fn main() {
    // Test 1: Basic use statement
    let mut sources = HashMap::new();
    sources.insert("main".to_string(), "use other::value; value".to_string());
    sources.insert("other".to_string(), "out let value = 100;".to_string());

    let result = interpret_all("main", sources);
    println!("Test 1 (basic use): {:?}", result);
    assert_eq!(result, Ok("100".to_string()));

    // Test 2: Multiple exports in module
    let mut sources2 = HashMap::new();
    sources2.insert("main".to_string(), "use math::pi; pi".to_string());
    sources2.insert(
        "math".to_string(),
        "out let pi = 314; out let e = 271;".to_string(),
    );

    let result2 = interpret_all("main", sources2);
    println!("Test 2 (multiple exports): {:?}", result2);
    assert_eq!(result2, Ok("314".to_string()));

    // Test 3: Import multiple items
    let mut sources3 = HashMap::new();
    sources3.insert(
        "main".to_string(),
        "use lib::x; use lib::y; x + y".to_string(),
    );
    sources3.insert(
        "lib".to_string(),
        "out let x = 100; out let y = 200;".to_string(),
    );

    let result3 = interpret_all("main", sources3);
    println!("Test 3 (multiple imports): {:?}", result3);
    assert_eq!(result3, Ok("300".to_string()));

    // Test 4: Export function
    let mut sources4 = HashMap::new();
    sources4.insert(
        "main".to_string(),
        "use utils::add; add(10, 20)".to_string(),
    );
    sources4.insert(
        "utils".to_string(),
        "out fn add(a : I32, b : I32) => a + b;".to_string(),
    );

    let result4 = interpret_all("main", sources4);
    println!("Test 4 (export function): {:?}", result4);
    assert_eq!(result4, Ok("30".to_string()));

    // Test 5: Module not found
    let mut sources5 = HashMap::new();
    sources5.insert("main".to_string(), "use missing::value; value".to_string());

    let result5 = interpret_all("main", sources5);
    println!("Test 5 (missing module): {:?}", result5);
    assert!(result5.is_err());
    assert_eq!(
        result5,
        Err("module 'missing' not found in source set".to_string())
    );

    // Test 6: Use with computation in main
    let mut sources6 = HashMap::new();
    sources6.insert(
        "main".to_string(),
        "use config::port; let doubled = port * 2; doubled".to_string(),
    );
    sources6.insert("config".to_string(), "out let port = 8080;".to_string());

    let result6 = interpret_all("main", sources6);
    println!("Test 6 (computation with import): {:?}", result6);
    assert_eq!(result6, Ok("16160".to_string()));

    println!("\nAll tests passed!");
}
