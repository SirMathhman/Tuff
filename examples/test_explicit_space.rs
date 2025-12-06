use tuff::interpret;

fn main() {
    // Test: explicit form with tail separated by space (no semicolon)
    let explicit_space = "fn Point(x : I32, y : I32) { fn manhattan() => x + y; this } let p : Point = Point(3, 4); p.manhattan()";
    println!("Explicit with space: {}", explicit_space);
    let result = interpret(explicit_space);
    println!("Result: {:?}\n", result);
}
