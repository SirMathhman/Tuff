#[test]
fn test_print_function() {
    let code = "print(42); 123";
    let result = tuff::interpret(code);
    eprintln!("Result: {:?}", result);
    assert_eq!(result, Ok("123|42".to_string()));
}

#[test]
fn test_print_simple_literal() {
    let code = "print(100); print(1); 1";
    let result = tuff::interpret(code);
    eprintln!("Result: {:?}", result);
    assert_eq!(result, Ok("1|100\n1".to_string()));
}

#[test]
fn test_print_with_let() {
    let code = "let r1 = 1; print(100); r1";
    let result = tuff::interpret(code);
    eprintln!("Result: {:?}", result);
    assert_eq!(result, Ok("1|100".to_string()));
}

#[test]
fn test_print_multiline_formatting() {
    let code = r#"
let r1 = 1;
print(100);
r1
    "#;
    let result = tuff::interpret(code);
    eprintln!("Result: {:?}", result);
    assert_eq!(result, Ok("1|100".to_string()));
}
