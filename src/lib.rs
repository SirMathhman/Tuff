mod parser;

use std::fmt;

use parser::Parser;

/// Error returned by [`interpret`] when the input cannot be interpreted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// The input uses syntax that is not yet supported.
    UnsupportedSyntax {
        /// Byte offset of the first offending character.
        offset: usize,
    },
    /// The result of an operation does not fit in an `i64`.
    Overflow {
        /// Byte offset of the operator that caused the overflow.
        offset: usize,
    },
    /// A variable was referenced that was not bound by an enclosing `let`.
    UndefinedVariable {
        /// Byte offset of the variable name.
        offset: usize,
        /// The name of the undefined variable.
        name: String,
    },
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::UnsupportedSyntax { offset } => {
                write!(f, "unsupported syntax at offset {offset}")
            }
            Error::Overflow { offset } => {
                write!(
                    f,
                    "arithmetic overflow at offset {offset}: the result does not fit in an i64; reduce the operands"
                )
            }
            Error::UndefinedVariable { offset, name } => {
                write!(
                    f,
                    "undefined variable '{name}' at offset {offset}: bind it with a `let` before this point"
                )
            }
        }
    }
}

impl std::error::Error for Error {}

/// Interprets `input` and returns its value.
///
/// The bare minimum for now: an empty string is `0`; a non-negative
/// integer literal is its value; a chain of literals joined by `+`,
/// `-`, or `*` (optional surrounding spaces) is evaluated with `*`
/// binding tighter than `+`/`-`; parentheses group subexpressions;
/// curly braces delimit blocks of `let` bindings ending in an
/// expression, whose value is the block's value; the top level is a
/// sequence of `;`-separated statements whose value is the value of
/// the last statement; a `let` statement evaluates to `0`; anything
/// else is not yet supported.
pub fn interpret(input: &str) -> Result<i64, Error> {
    if input.is_empty() {
        return Ok(0);
    }
    let mut parser = Parser {
        input,
        pos: 0,
        env: Vec::new(),
    };
    parser.parse_program()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_string_is_zero() {
        assert_eq!(interpret(""), Ok(0));
    }

    #[test]
    fn single_digit_one() {
        assert_eq!(interpret("1"), Ok(1));
    }

    #[test]
    fn multi_digit_number() {
        assert_eq!(interpret("20"), Ok(20));
    }

    #[test]
    fn addition_of_two_digits() {
        assert_eq!(interpret("1 + 2"), Ok(3));
    }

    #[test]
    fn addition_of_three_digits() {
        assert_eq!(interpret("1 + 2 + 3"), Ok(6));
    }

    #[test]
    fn mixed_addition_and_subtraction() {
        assert_eq!(interpret("2 + 3 - 4"), Ok(1));
    }

    #[test]
    fn multiplication_binds_tighter_than_addition() {
        assert_eq!(interpret("2 * 3 + 4"), Ok(10));
    }

    #[test]
    fn addition_then_multiplication_term() {
        assert_eq!(interpret("2 + 3 * 4"), Ok(14));
    }

    #[test]
    fn parenthesized_group() {
        assert_eq!(interpret("(2 + 3) * 4"), Ok(20));
    }

    #[test]
    fn curly_braced_group() {
        assert_eq!(interpret("{ 2 + 3 } * 4"), Ok(20));
    }

    #[test]
    fn let_binding_in_block() {
        assert_eq!(interpret("{ let x = 2 + 3; x } * 4"), Ok(20));
    }

    #[test]
    fn top_level_let_binding() {
        assert_eq!(interpret("let y = { let x = 2 + 3; x } * 4; y"), Ok(20));
    }

    #[test]
    fn let_statement_evaluates_to_zero() {
        assert_eq!(interpret("let x = 100;"), Ok(0));
    }

    #[test]
    fn multiplication_overflow_is_reported() {
        // 9^20 does not fit in an i64; the 19th `*` is at offset 74.
        let input = "9 * ".repeat(19) + "9";
        assert_eq!(interpret(&input), Err(Error::Overflow { offset: 74 }));
    }

    // Coverage test: non-empty input must yield Err, not panic.
    #[test]
    fn non_empty_input_is_unsupported() {
        assert_eq!(interpret("@"), Err(Error::UnsupportedSyntax { offset: 0 }));
    }

    #[test]
    fn unsupported_syntax_reports_true_offset() {
        assert_eq!(
            interpret("1 + @"),
            Err(Error::UnsupportedSyntax { offset: 4 })
        );
    }

    #[test]
    fn undefined_variable_is_reported() {
        assert_eq!(
            interpret("x"),
            Err(Error::UndefinedVariable {
                offset: 0,
                name: "x".into()
            })
        );
    }
}
