use tuff::interpret;

fn main() {
    // Test: explicit form with tail
    let explicit_with_tail = "fn Point(x : I32, y : I32) => {fn manhattan() => x + y; this} let p : Point = Point(3, 4); p.manhattan()";
    println!("Explicit with tail: {}", explicit_with_tail);
    let result = interpret(explicit_with_tail);
    println!("Result: {:?}\n", result);

    // Test: class form with tail
    let class_with_tail = "class fn Point(x : I32, y : I32) => {fn manhattan() => x + y;} let p : Point = Point(3, 4); p.manhattan()";
    println!("Class with tail: {}", class_with_tail);
    let result2 = interpret(class_with_tail);
    println!("Result: {:?}", result2);
}
