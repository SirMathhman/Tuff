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
}
