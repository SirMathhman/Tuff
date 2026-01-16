#[cfg(test)]
mod tests {
    use crate::parser::interpret;

    #[test]
    fn test_function_definition_and_call() {
        assert_eq!(
            interpret("fn add(first : I32, second : I32) : I32 => first + second; add(3, 4)"),
            Ok(7)
        );
    }

    #[test]
    fn test_function_with_single_parameter() {
        assert_eq!(
            interpret("fn double(x : I32) : I32 => x * 2; double(5)"),
            Ok(10)
        );
    }

    #[test]
    fn test_function_with_multiple_calls() {
        assert_eq!(
            interpret("fn add(a : I32, b : I32) : I32 => a + b; add(1, 2) + add(3, 4)"),
            Ok(10)
        );
    }

    #[test]
    fn test_function_pointer_assignment() {
        assert_eq!(
            interpret("fn add(first : I32, second : I32) : I32 => first + second; let accept : (I32, I32) => I32 = add; accept(3, 4)"),
            Ok(7)
        );
    }

    #[test]
    fn test_this_scope_access() {
        assert_eq!(interpret("let x = 100; this.x"), Ok(100));
    }

    #[test]
    fn test_this_scope_assignment() {
        assert_eq!(interpret("let mut x = 0; this.x = 100; x"), Ok(100));
    }

    #[test]
    fn test_simple_nested_function() {
        // Test that function definition inside a function works
        let result1 = interpret("fn a(first : I32) : I32 => fn second(second : I32) => 0; a(3)");
        eprintln!("Result1 (simple nested): {:?}", result1);
        assert_eq!(result1, Ok(0));
        
        let result2 = interpret("fn a(first : I32) : (I32) => I32 => fn second(second : I32) => first + second; a(3)(4)");
        eprintln!("Result2 (with capture and chaining): {:?}", result2);
        assert_eq!(result2, Ok(7), "Expected Ok(7), got {:?}", result2);
    }

    #[test]
    fn test_curried_function() {
        assert_eq!(
            interpret("fn a(first : I32) : (I32) => I32 => fn second(second : I32) => first + second; a(3)(4)"),
            Ok(7)
        );
    }
}
