#[cfg(test)]
mod debug_tests {
    use crate::parser::interpret;

    #[test]
    fn test_function_return_type() {
        // Test what happens when we call a(3) and check the return type
        let input = "fn a(first : I32) : (I32) => I32 => fn second(second : I32) => first + second; a(3)";
        let result = interpret(input);
        eprintln!("Result of a(3): {:?}", result);
        assert!(result.is_ok());
    }
}
