use tuff::interpret;

#[test]
fn test_char_literal_basic() {
    let code = "'a'";
    let result = interpret(code);
    assert_eq!(result, Ok("'a'".to_string()));
}

#[test]
fn test_char_literal_uppercase() {
    let code = "'Z'";
    let result = interpret(code);
    assert_eq!(result, Ok("'Z'".to_string()));
}

#[test]
fn test_char_literal_number() {
    let code = "'5'";
    let result = interpret(code);
    assert_eq!(result, Ok("'5'".to_string()));
}

#[test]
fn test_char_literal_space() {
    let code = "' '";
    let result = interpret(code);
    assert_eq!(result, Ok("' '".to_string()));
}

#[test]
fn test_type_of_char() {
    let code = "typeOf('a')";
    let result = interpret(code);
    assert_eq!(result, Ok("Char".to_string()));
}

#[test]
fn test_type_of_char_uppercase() {
    let code = "typeOf('M')";
    let result = interpret(code);
    assert_eq!(result, Ok("Char".to_string()));
}

#[test]
fn test_char_in_let() {
    let code = "let x = 'a'; x";
    let result = interpret(code);
    assert_eq!(result, Ok("'a'".to_string()));
}

#[test]
fn test_char_comparison() {
    let code = "'a' == 'a'";
    let result = interpret(code);
    assert_eq!(result, Ok("true".to_string()));
}

#[test]
fn test_char_different() {
    let code = "'a' == 'b'";
    let result = interpret(code);
    assert_eq!(result, Ok("false".to_string()));
}
