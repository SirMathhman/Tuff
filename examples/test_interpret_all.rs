use std::collections::HashMap;
use tuff::interpret_all;

fn main() {
    // Test 1: Simple main file
    let mut sources = HashMap::new();
    sources.insert("main".to_string(), "100 + 200".to_string());

    let result = interpret_all("main", sources);
    println!("Test 1 (simple expression): {:?}", result);
    assert_eq!(result, Ok("300".to_string()));

    // Test 2: Main with variables
    let mut sources2 = HashMap::new();
    sources2.insert(
        "main".to_string(),
        "let x = 100; let y = 200; x + y".to_string(),
    );

    let result2 = interpret_all("main", sources2);
    println!("Test 2 (with variables): {:?}", result2);
    assert_eq!(result2, Ok("300".to_string()));

    // Test 3: Main with functions
    let mut sources3 = HashMap::new();
    sources3.insert(
        "main".to_string(),
        "fn add(a : I32, b : I32) => a + b; add(100, 200)".to_string(),
    );

    let result3 = interpret_all("main", sources3);
    println!("Test 3 (with function): {:?}", result3);
    assert_eq!(result3, Ok("300".to_string()));

    // Test 4: Missing main file
    let mut sources4 = HashMap::new();
    sources4.insert("other".to_string(), "100".to_string());

    let result4 = interpret_all("main", sources4);
    println!("Test 4 (missing main): {:?}", result4);
    assert!(result4.is_err());
    assert_eq!(
        result4,
        Err("main file 'main' not found in source set".to_string())
    );

    // Test 5: Different main name
    let mut sources5 = HashMap::new();
    sources5.insert("program".to_string(), "42".to_string());

    let result5 = interpret_all("program", sources5);
    println!("Test 5 (custom main name): {:?}", result5);
    assert_eq!(result5, Ok("42".to_string()));

    println!("\nAll tests passed!");
}
