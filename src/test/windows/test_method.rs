use tuff::interpret;

#[test]
fn method_call_on_constructor() {
    let result = interpret(
        r#"fn Point(x : I32, y : I32) => {fn manhattan() => x + y; this}; let p : Point = Point(3, 4); p.manhattan()"#,
    );
    assert_eq!(result, Ok("7".to_string()));
}
