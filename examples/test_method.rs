use std::io::Write;
use tuff::interpret;

fn main() {
    // Test calling the method directly
    let code3 = r#"fn Point(x : I32, y : I32) => {fn manhattan() => x + y; this}; let p : Point = Point(3, 4); p.manhattan()"#;
    eprintln!("=== Test 3 (call method): {} ===", code3);
    std::io::stderr().flush().unwrap();
    let result3 = interpret(code3);
    eprintln!("=== Result: {:?} ===\n", result3);
    std::io::stderr().flush().unwrap();
}
