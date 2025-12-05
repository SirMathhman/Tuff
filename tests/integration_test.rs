use tuff::parser::Parser;
use tuff::value::Evaluator;

#[test]
fn test_arithmetic() {
    let mut evaluator = Evaluator::new();
    let mut parser = Parser::new("2 + 3;");
    let program = parser.parse().unwrap();
    let result = evaluator.eval_program(&program).unwrap();
    assert_eq!(result.to_string(), "5");
}

#[test]
fn test_variables() {
    let mut evaluator = Evaluator::new();
    let mut parser = Parser::new("let x = 42; x;");
    let program = parser.parse().unwrap();
    let result = evaluator.eval_program(&program).unwrap();
    assert_eq!(result.to_string(), "42");
}

#[test]
fn test_functions() {
    let mut evaluator = Evaluator::new();
    let mut parser = Parser::new("fn add(a : I32, b : I32) : I32 { a + b; } add(3, 4);");
    let program = parser.parse().unwrap();
    let result = evaluator.eval_program(&program).unwrap();
    assert_eq!(result.to_string(), "7");
}

#[test]
fn test_if_statement() {
    let mut evaluator = Evaluator::new();
    let mut parser = Parser::new("if (true) { 99; } else { 1; }");
    let program = parser.parse().unwrap();
    let result = evaluator.eval_program(&program).unwrap();
    assert_eq!(result.to_string(), "99");
}

#[test]
fn test_while_loop() {
    let mut evaluator = Evaluator::new();
    let mut parser = Parser::new("let x = 0; while (x < 3) { x = x + 1; } x;");
    let program = parser.parse().unwrap();
    let result = evaluator.eval_program(&program).unwrap();
    assert_eq!(result.to_string(), "3");
}

#[test]
fn test_arrays() {
    let mut evaluator = Evaluator::new();
    let mut parser = Parser::new("let arr = [1, 2, 3]; arr[1];");
    let program = parser.parse().unwrap();
    let result = evaluator.eval_program(&program).unwrap();
    assert_eq!(result.to_string(), "2");
}
