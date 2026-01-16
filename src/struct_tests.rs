#[cfg(test)]
mod tests {
    use crate::parser::interpret;

    #[test]
    fn test_struct_definition_and_instantiation() {
        assert_eq!(
            interpret("struct Wrapper { value : I32 } Wrapper { value : 100 }"),
            Ok(0)
        );
    }

    #[test]
    fn test_struct_field_access() {
        assert_eq!(
            interpret("struct Wrapper { value : I32 } Wrapper { value : 100 }.value"),
            Ok(100)
        );
    }

    #[test]
    fn test_struct_field_access_in_expression() {
        assert_eq!(
            interpret("struct Wrapper { value : I32 } Wrapper { value : 50 }.value + 50"),
            Ok(100)
        );
    }

    #[test]
    fn test_struct_with_variable() {
        assert_eq!(
            interpret("let x = 100; struct Wrapper { value : I32 } Wrapper { value : x }.value"),
            Ok(100)
        );
    }

    #[test]
    fn test_struct_multiple_fields() {
        assert_eq!(
            interpret("struct Point { x : I32, y : I32 } Point { x : 10, y : 20 }.x"),
            Ok(10)
        );
    }

    #[test]
    fn test_struct_multiple_fields_second_field() {
        assert_eq!(
            interpret("struct Point { x : I32, y : I32 } Point { x : 10, y : 20 }.y"),
            Ok(20)
        );
    }

    #[test]
    fn test_struct_variable_assignment() {
        assert_eq!(
            interpret("struct Wrapper { value : I32 } let result : Wrapper = Wrapper { value : 100 }; result.value"),
            Ok(100)
        );
    }

    #[test]
    fn test_struct_constructor_function() {
        assert_eq!(
            interpret("struct Point { x : I32, y : I32 } fn Point(x : I32, y : I32) : Point => { this } let point : Point = Point(3, 4); point.x + point.y"),
            Ok(7)
        );
    }

    #[test]
    fn test_block_with_if() {
        // Test if we can evaluate a block with an if statement
        assert_eq!(
            interpret("{ if (1) 5 else 10 }"),
            Ok(5)
        );
    }

    #[test]
    fn test_simple_nested_if() {
        // Test if a function with a nested if works
        assert_eq!(
            interpret("fn outer() : I32 => { if (1) 5 else 10 } outer()"),
            Ok(5)
        );
    }

    #[test]
    fn test_simple_block_function() {
        // Test if a simple block function works
        assert_eq!(
            interpret("fn outer() : I32 => { 10 } outer()"),
            Ok(10)
        );
    }

    #[test]
    fn test_simple_function_with_nested_fn() {
        // Test if a function with a nested fn can be called
        assert_eq!(
            interpret("fn outer() : I32 => { fn inner() => 5; 10 } outer()"),
            Ok(10)
        );
    }

    #[test]
    fn test_function_call_after_nested_fn_parsing() {
        // Test if we can call a function after parsing another function with nested fn
        assert_eq!(
            interpret("fn foo() : I32 => 7 fn bar() : I32 => { fn inner() => 5; 10 } foo()"),
            Ok(7)
        );
    }

    #[test]
    fn test_struct_with_nested_fn_no_let() {
        // Does Point(3, 4) work when the Point function has an inner fn?
        assert_eq!(
            interpret("struct Point { x : I32, y : I32 } fn Point(x : I32, y : I32) : Point => { fn dummy() => 5; this } Point(3, 4)"),
            Ok(0)
        );
    }

    #[test]
    fn test_struct_with_nested_fn_with_let() {
        // Does Point(3, 4) work when the Point function has an inner fn AND we use a let statement?
        assert_eq!(
            interpret("struct Point { x : I32, y : I32 } fn Point(x : I32, y : I32) : Point => { fn dummy() => 5; this } let point : Point = Point(3, 4); 0"),
            Ok(0)
        );
    }

    #[test]
    fn test_struct_instance_method() {
        assert_eq!(
            interpret("fn Point(x : I32, y : I32) : I32 => { fn get() : I32 => x + y; get() } Point(3, 4)"),
            Ok(7)
        );
    }

    #[test]
    fn test_struct_instantiation() {
        let result = interpret("struct Point { x : I32, y : I32 } fn Point(x : I32, y : I32) : Point => { this } Point(3, 4)");
        assert!(result.is_ok(), "Got: {:?}", result);
    }

    #[test]
    fn test_struct_with_methods() {
        assert_eq!(
            interpret("struct Point { x : I32, y : I32 } fn Point(x : I32, y : I32) : Point => { fn get() => x + y; this } let point : Point = Point(3, 4); point.get()"),
            Ok(7)
        );
    }

    #[test]
    fn test_struct_with_methods_simplified() {
        assert_eq!(
            interpret("struct Point { x : I32, y : I32 } fn Point(x : I32, y : I32) : Point => { this } let point : Point = Point(3, 4); point.x"),
            Ok(3)
        );
    }
}
