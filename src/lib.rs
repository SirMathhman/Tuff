mod parser;

use std::fmt;

use parser::Parser;

/// Error returned by [`interpret`] when the input cannot be interpreted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// The program contains no statements.
    EmptyProgram {
        /// Byte offset of the end of the input.
        offset: usize,
    },
    /// A statement was not followed by `;` or the end of the input.
    ExpectedSemicolon {
        /// Byte offset of the character where `;` was expected.
        offset: usize,
    },
    /// A block's last statement was a `let` binding instead of an
    /// expression.
    BlockMustEndWithExpression {
        /// Byte offset of the block's closing delimiter.
        offset: usize,
    },
    /// A `let` binding was not followed by `=`.
    ExpectedEquals {
        /// Byte offset of the character where `=` was expected.
        offset: usize,
    },
    /// A character cannot start an expression here.
    UnexpectedToken {
        /// Byte offset of the offending character.
        offset: usize,
        /// The offending character, if any.
        found: Option<u8>,
    },
    /// A closing delimiter was not found where expected.
    ExpectedClosingDelimiter {
        /// Byte offset of the character where the delimiter was
        /// expected.
        offset: usize,
        /// The expected closing delimiter.
        expected: u8,
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
    /// An assignment targeted a binding that was not declared `mut`.
    AssignmentToImmutable {
        /// Byte offset of the variable name.
        offset: usize,
        /// The name of the immutable variable.
        name: String,
    },
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::EmptyProgram { offset } => {
                write!(
                    f,
                    "empty program at offset {offset}: the input must contain at least one statement"
                )
            }
            Error::ExpectedSemicolon { offset } => {
                write!(
                    f,
                    "expected ';' at offset {offset}: separate top-level statements with ';', or remove the trailing expression"
                )
            }
            Error::BlockMustEndWithExpression { offset } => {
                write!(
                    f,
                    "block must end with an expression at offset {offset}: move the trailing `let` binding before the final expression"
                )
            }
            Error::ExpectedEquals { offset } => {
                write!(
                    f,
                    "expected '=' at offset {offset}: a `let` binding needs the form `let name = expr`"
                )
            }
            Error::UnexpectedToken { offset, found } => match found {
                Some(c) => write!(
                    f,
                    "unexpected character '{}' at offset {offset}: only digits, lowercase identifiers, `true`, `false`, `(`, `{{`, and operators are supported",
                    char::from(*c)
                ),
                None => write!(
                    f,
                    "unexpected end of input at offset {offset}: an expression was expected here"
                ),
            },
            Error::ExpectedClosingDelimiter { offset, expected } => {
                write!(
                    f,
                    "expected '{}' at offset {offset}: close the group or block that was opened earlier",
                    char::from(*expected)
                )
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
            Error::AssignmentToImmutable { offset, name } => {
                write!(
                    f,
                    "cannot assign to '{name}' at offset {offset}: it was not declared `mut`; declare it with `let mut`"
                )
            }
        }
    }
}

impl std::error::Error for Error {}

/// Interprets `input` and returns its value.
///
/// The bare minimum for now: an empty string is `0`; a non-negative
/// integer literal is its value; the boolean literals `true` and
/// `false` are `1` and `0`; a chain of literals joined by `+`,
/// `-`, or `*` (optional surrounding spaces) is evaluated with `*`
/// binding tighter than `+`/`-`; parentheses group subexpressions;
/// curly braces delimit blocks of `let` bindings ending in an
/// expression, whose value is the block's value; the top level is a
/// sequence of `;`-separated statements whose value is the value of
/// the last statement; a `let` statement evaluates to `0`; booleans
/// are distinct from integers, so `==` yields `1` only for two
/// values of the same kind (e.g. `true == 1` is `0`), while
/// arithmetic treats `true` as `1` and `false` as `0`; `==` binds
/// looser than `+`, `-`, and `*`; `||` yields `1` if either side is
/// non-zero and binds looser than `==`, `+`, `-`, and `*`; `let mut`
/// declares a mutable binding, and `name = expr` assigns to it
/// (evaluating to the assigned value); assigning to a non-`mut`
/// binding is an error; anything else is not yet supported.
pub fn interpret(input: &str) -> Result<i64, Error> {
    if input.is_empty() {
        return Ok(0);
    }
    let mut parser = Parser {
        input,
        pos: 0,
        env: Vec::new(),
    };
    parser.parse_program().map(|value| value.as_i64())
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
    fn block_must_end_with_expression() {
        // The inner block ends with a `let` statement, not an
        // expression; the closing `}` is at offset 23.
        assert_eq!(
            interpret("let x = { let y = 100; }; x"),
            Err(Error::BlockMustEndWithExpression { offset: 23 })
        );
    }

    #[test]
    fn boolean_literal_true_is_one() {
        assert_eq!(interpret("let x = true; x"), Ok(1));
    }

    #[test]
    fn or_of_booleans() {
        assert_eq!(interpret("let x = true; let y = false; x || y"), Ok(1));
    }

    #[test]
    fn equality_of_unequal_values() {
        assert_eq!(interpret("let x = 1; let y = 2; x == y"), Ok(0));
    }

    #[test]
    fn boolean_is_not_equal_to_integer() {
        assert_eq!(interpret("true == 1"), Ok(0));
    }

    #[test]
    fn mutable_binding_assignment() {
        assert_eq!(interpret("let mut x = 0; x = 1; x"), Ok(1));
    }

    #[test]
    fn assignment_to_immutable_binding_is_reported() {
        assert_eq!(
            interpret("let x = 0; x = 1; x"),
            Err(Error::AssignmentToImmutable {
                offset: 11,
                name: "x".to_string()
            })
        );
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
        assert_eq!(
            interpret("@"),
            Err(Error::UnexpectedToken {
                offset: 0,
                found: Some(b'@')
            })
        );
    }

    #[test]
    fn unsupported_syntax_reports_true_offset() {
        assert_eq!(
            interpret("1 + @"),
            Err(Error::UnexpectedToken {
                offset: 4,
                found: Some(b'@')
            })
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
