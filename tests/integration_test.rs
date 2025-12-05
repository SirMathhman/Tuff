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

#[test]
fn test_typed_let_statement() {
    let mut evaluator = Evaluator::new();
    let mut parser = Parser::new("let x : i32 = 42; x;");
    let program = parser.parse().unwrap();
    let result = evaluator.eval_program(&program).unwrap();
    assert_eq!(result.to_string(), "42");
}
#[test]
fn test_function_return_type_validation() {
    let mut evaluator = Evaluator::new();
    let mut parser = Parser::new("fn get_number() : i32 { 42; } get_number();");
    let program = parser.parse().unwrap();
    let result = evaluator.eval_program(&program).unwrap();
    assert_eq!(result.to_string(), "42");
}

#[test]
fn test_function_argument_type_validation() {
    let mut evaluator = Evaluator::new();
    let mut parser = Parser::new("fn add(a : i32, b : i32) : i32 { a + b; } add(5, 3);");
    let program = parser.parse().unwrap();
    let result = evaluator.eval_program(&program).unwrap();
    assert_eq!(result.to_string(), "8");
}

#[test]
fn test_array_index_type_validation() {
    let mut evaluator = Evaluator::new();
    let mut parser = Parser::new("let arr = [10, 20, 30]; arr[1];");
    let program = parser.parse().unwrap();
    let result = evaluator.eval_program(&program).unwrap();
    assert_eq!(result.to_string(), "20");
}

#[test]
fn test_assignment_type_validation() {
    let mut evaluator = Evaluator::new();
    let mut parser = Parser::new("let x : i32 = 42; x = 100; x;");
    let program = parser.parse().unwrap();
    let result = evaluator.eval_program(&program).unwrap();
    assert_eq!(result.to_string(), "100");
}

#[test]
fn test_array_type_inference() {
    let mut evaluator = Evaluator::new();
    let mut parser = Parser::new("let arr : [i32; 3; 3] = [1, 2, 3]; arr[0];");
    let program = parser.parse().unwrap();
    let result = evaluator.eval_program(&program).unwrap();
    assert_eq!(result.to_string(), "1");
}

#[test]
fn test_generic_type_parsing() {
    // For now, test that generic types parse correctly without runtime enforcement
    let mut parser = Parser::new("let opt : Option<i32> = 42;");
    let result = parser.parse();
    // Should parse successfully even if not fully enforced at runtime yet
    assert!(result.is_ok());
}

#[test]
fn test_generic_vector_type_parsing() {
    // For now, test that generic vector types parse correctly
    let mut parser = Parser::new("let vec : Vec<i32> = [1, 2, 3];");
    let result = parser.parse();
    // Should parse successfully
    assert!(result.is_ok());
}

#[test]
fn test_union_type_parsing() {
    // Test that union types parse correctly
    let mut parser = Parser::new("let result : Result<i32, String> = 42;");
    let result = parser.parse();
    // Should parse successfully (union type support)
    assert!(result.is_ok());
}

#[test]
fn test_reference_type_parsing() {
    // Test that reference types parse correctly
    let mut parser = Parser::new("let ptr : &i32 = 42;");
    let result = parser.parse();
    // Should parse successfully
    assert!(result.is_ok());
}

#[test]
fn test_mutable_reference_type_parsing() {
    // Test that mutable reference types parse correctly
    let mut parser = Parser::new("let ptr : &mut i32 = 42;");
    let result = parser.parse();
    // Should parse successfully
    assert!(result.is_ok());
}

#[test]
fn test_pointer_type_parsing() {
    // Test that pointer types parse correctly
    let mut parser = Parser::new("let ptr : *i32 = 42;");
    let result = parser.parse();
    // Should parse successfully
    assert!(result.is_ok());
}




