fn main() {
    // Automatic drop handler invocation at scope exit
    let input1 = "let mut sum = 0; fn drop[&mut sum](this : DroppableI32) => sum += 1; type DroppableI32 = I32!drop; let value : DroppableI32 = 100; sum";
    println!("Test 1 (auto drop): {:?}", tuff::interpret(input1));

    // Manual drop handler call
    let input2 =
        "let mut sum = 0; fn drop[&mut sum](this : DroppableI32) => sum += 1; drop(100); sum";
    println!("Test 2 (manual drop): {:?}", tuff::interpret(input2));
}
