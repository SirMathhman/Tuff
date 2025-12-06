use tuff::interpret;

fn main() {
    // Test the transformation
    let input = "class fn Point(x : I32, y : I32) => {fn manhattan() => x + y;}";
    println!("Input: {}", input);

    // Try the explicit form first
    let explicit = "fn Point(x : I32, y : I32) => {fn manhattan() => x + y; this}";
    println!("Explicit: {}", explicit);
    let result = interpret(explicit);
    println!("Explicit result: {:?}\n", result);

    // Now test transformation
    let result2 = interpret(input);
    println!("Class result: {:?}", result2);
}
