#[cfg(test)]
mod tests {
    use crate::parser::interpret;

    #[test]
    fn test_compound_assignment_add() {
        assert_eq!(interpret("let mut x = 0; x += 10; x"), Ok(10));
    }

    #[test]
    fn test_compound_assignment_subtract() {
        assert_eq!(interpret("let mut x = 50; x -= 20; x"), Ok(30));
    }

    #[test]
    fn test_compound_assignment_multiply() {
        assert_eq!(interpret("let mut x = 5; x *= 3; x"), Ok(15));
    }

    #[test]
    fn test_compound_assignment_divide() {
        assert_eq!(interpret("let mut x = 100; x /= 4; x"), Ok(25));
    }

    #[test]
    fn test_compound_assignment_chained() {
        assert_eq!(
            interpret("let mut x = 10; x += 5; x -= 3; x *= 2; x"),
            Ok(24)
        );
    }

    #[test]
    fn test_while_loop_basic() {
        // Test initially false
        assert_eq!(interpret("let mut x = 10; while (x < 5) x -= 1; x"), Ok(10));
    }

    #[test]
    fn test_while_loop_accumulate() {
        // Test with block - simple version first
        assert_eq!(
            interpret("let mut i = 0; while (i < 1) { i += 1; } i"),
            Ok(1)
        );
    }

    #[test]
    fn test_while_loop_false_condition() {
        assert_eq!(interpret("let mut x = 10; while (x < 5) x += 1; x"), Ok(10));
    }

    #[test]
    fn test_while_loop_nested() {
        assert_eq!(
            interpret(
                "let mut x = 0; while (x < 2) { let mut y = 0; while (y < 3) y += 1; x += 1; } x"
            ),
            Ok(2)
        );
    }
    #[test]
    fn test_for_loop_sum() {
        assert_eq!(
            interpret("let mut sum = 0; for (let i in 0..10) sum += i; sum"),
            Ok(45)
        );
    }
    #[test]
    fn test_break_in_while() {
        assert_eq!(
            interpret("let mut x = 0; while (true) { x += 1; if (x == 5) break; } x"),
            Ok(5)
        );
    }
    #[test]
    fn test_continue_in_for() {
        assert_eq!(
            interpret("let mut sum = 0; for (let i in 0..10) { if (i == 5) continue; sum += i; } sum"),
            Ok(40)
        );
    }
    #[test]
    fn test_break_in_for() {
        assert_eq!(
            interpret("let mut sum = 0; for (let i in 0..10) { if (i == 5) break; sum += i; } sum"),
            Ok(10)
        );
    }
    #[test]
    fn test_continue_in_while() {
        assert_eq!(
            interpret("let mut x = 0; let mut sum = 0; while (x < 10) { x += 1; if (x == 5) continue; sum += x; } sum"),
            Ok(50)
        );
    }
}
