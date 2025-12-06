use tuff::interpret;

#[test]
fn class_basic_method() {
    let result = interpret("class fn Point(x : I32, y : I32) => {fn manhattan() => x + y;} let p : Point = Point(3, 4); p.manhattan()");
    assert_eq!(
        result,
        Ok("7".to_string()),
        "class should create constructor with method"
    );
}

#[test]
fn class_explicit_form_equivalent() {
    let result = interpret("fn Point(x : I32, y : I32) => {fn manhattan() => x + y; this}; let p : Point = Point(3, 4); p.manhattan()");
    assert_eq!(
        result,
        Ok("7".to_string()),
        "explicit form should also work"
    );
}

#[test]
fn class_multiple_methods_area() {
    let result = interpret(
        "class fn Rect(w : I32, h : I32) => {
            fn area() => w * h;
            fn perimeter() => (w + h) * 2;
        }
        let r : Rect = Rect(5, 3);
        r.area()",
    );
    assert_eq!(
        result,
        Ok("15".to_string()),
        "class area method should work"
    );
}

#[test]
fn class_multiple_methods_perimeter() {
    let result = interpret(
        "class fn Rect(w : I32, h : I32) => {
            fn area() => w * h;
            fn perimeter() => (w + h) * 2;
        }
        let r : Rect = Rect(5, 3);
        r.perimeter()",
    );
    assert_eq!(
        result,
        Ok("16".to_string()),
        "class perimeter method should work"
    );
}
