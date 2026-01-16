#[cfg(test)]
mod tests {
    use crate::parser::interpret;

    #[test]
    fn test_bool_true() {
        assert_eq!(interpret("let x : Bool = true; x"), Ok(1));
    }

    #[test]
    fn test_bool_false() {
        assert_eq!(interpret("let x : Bool = false; x"), Ok(0));
    }

    #[test]
    fn test_logical_or_true_false() {
        assert_eq!(
            interpret("let x : Bool = true; let y : Bool = false; x || y"),
            Ok(1)
        );
    }

    #[test]
    fn test_logical_or_false_false() {
        assert_eq!(
            interpret("let x : Bool = false; let y : Bool = false; x || y"),
            Ok(0)
        );
    }

    #[test]
    fn test_logical_and_true_false() {
        assert_eq!(
            interpret("let x : Bool = true; let y : Bool = false; x && y"),
            Ok(0)
        );
    }

    #[test]
    fn test_logical_and_true_true() {
        assert_eq!(
            interpret("let x : Bool = true; let y : Bool = true; x && y"),
            Ok(1)
        );
    }

    #[test]
    fn test_if_true_condition() {
        assert_eq!(interpret("let x = if (true) 3 else 5; x"), Ok(3));
    }

    #[test]
    fn test_if_false_condition() {
        assert_eq!(interpret("let x = if (false) 3 else 5; x"), Ok(5));
    }

    #[test]
    fn test_if_with_logical_or() {
        assert_eq!(interpret("let x = if (true || false) 3 else 5; x"), Ok(3));
    }

    #[test]
    fn test_if_with_logical_and() {
        assert_eq!(interpret("let x = if (false && true) 3 else 5; x"), Ok(5));
    }

    #[test]
    fn test_nested_if_else() {
        assert_eq!(
            interpret("let x = if (true && false) 3 else if (false) 100 else 5; x"),
            Ok(5)
        );
    }

    #[test]
    fn test_nested_if_else_middle_branch() {
        assert_eq!(
            interpret("let x = if (false) 3 else if (true) 100 else 5; x"),
            Ok(100)
        );
    }

    #[test]
    fn test_nested_if_else_first_branch() {
        assert_eq!(
            interpret("let x = if (true) 3 else if (true) 100 else 5; x"),
            Ok(3)
        );
    }

    #[test]
    fn test_match_basic() {
        assert_eq!(
            interpret("let x = match (100) { case 100 => 5; case _ => 3; }; x"),
            Ok(5)
        );
    }

    #[test]
    fn test_match_wildcard() {
        assert_eq!(
            interpret("let x = match (50) { case 100 => 5; case _ => 3; }; x"),
            Ok(3)
        );
    }

    #[test]
    fn test_match_multiple_cases() {
        assert_eq!(
            interpret("let x = match (200) { case 100 => 5; case 200 => 10; case _ => 3; }; x"),
            Ok(10)
        );
    }

    #[test]
    fn test_match_first_match_wins() {
        assert_eq!(
            interpret("let x = match (100) { case 100 => 5; case 100 => 99; case _ => 3; }; x"),
            Ok(5)
        );
    }

    #[test]
    fn test_if_statement_true_condition() {
        assert_eq!(
            interpret("let mut x : I32 = 0; if (true) x = 100; x"),
            Ok(100)
        );
    }

    #[test]
    fn test_if_statement_false_condition() {
        assert_eq!(
            interpret("let mut x : I32 = 0; if (false) x = 100; x"),
            Ok(0)
        );
    }

    #[test]
    fn test_if_else_statement() {
        assert_eq!(
            interpret("let mut x : I32 = 0; if (true || false) x = 100; else x = 200; x"),
            Ok(100)
        );
    }

    #[test]
    fn test_if_else_statement_else_taken() {
        assert_eq!(
            interpret("let mut x : I32 = 0; if (false && true) x = 100; else x = 200; x"),
            Ok(200)
        );
    }

    #[test]
    fn test_if_else_statement_user_requirement() {
        // User requirement: let x : I32; if (true || false) x = 100; else x = 200; x => 100
        assert_eq!(
            interpret("let x : I32; if (true || false) x = 100; else x = 200; x"),
            Ok(100)
        );
    }
}
