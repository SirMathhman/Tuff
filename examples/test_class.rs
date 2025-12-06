// Test the class keyword as syntactic sugar
// class fn Point(x : I32, y : I32) => {fn manhattan() => x + y;}
// Should be equivalent to:
// fn Point(x : I32, y : I32) => {fn manhattan() => x + y; this}

use tuff::interpret;

fn main() {
    // Test 1: Basic class with method
    let result1 = interpret("class fn Point(x : I32, y : I32) => {fn manhattan() => x + y;} let p : Point = Point(3, 4); p.manhattan()");
    println!("Test 1 (class with manhattan): {:?}", result1);
    assert_eq!(
        result1,
        Ok("7".to_string()),
        "class should create constructor with method"
    );

    // Test 2: Equivalent explicit form should work the same way
    let result2 = interpret("fn Point(x : I32, y : I32) => {fn manhattan() => x + y; this}; let p : Point = Point(3, 4); p.manhattan()");
    println!("Test 2 (explicit form): {:?}", result2);
    assert_eq!(
        result2,
        Ok("7".to_string()),
        "explicit form should also work"
    );

    // Test 3: Class with multiple methods
    let result3 = interpret(
        "class fn Rect(w : I32, h : I32) => {
            fn area() => w * h;
            fn perimeter() => (w + h) * 2;
        }
        let r : Rect = Rect(5, 3);
        r.area()",
    );
    println!("Test 3 (class with multiple methods - area): {:?}", result3);
    assert_eq!(
        result3,
        Ok("15".to_string()),
        "class area method should work"
    );

    let result4 = interpret(
        "class fn Rect(w : I32, h : I32) => {
            fn area() => w * h;
            fn perimeter() => (w + h) * 2;
        }
        let r : Rect = Rect(5, 3);
        r.perimeter()",
    );
    println!(
        "Test 4 (class with multiple methods - perimeter): {:?}",
        result4
    );
    assert_eq!(
        result4,
        Ok("16".to_string()),
        "class perimeter method should work"
    );

    println!("All tests passed!");
}
