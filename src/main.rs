use std::io::{self, BufRead, Write};

#[cfg(not(coverage))]
fn main() {
    let stdin = io::stdin();
    loop {
        print!("> ");
        io::stdout().flush().unwrap();

        let mut input = String::new();
        match stdin.lock().read_line(&mut input) {
            Ok(0) => break, // EOF
            Ok(_) => {
                let trimmed = input.trim();
                if trimmed.is_empty() {
                    continue;
                }
                match tuff::execute_tuff(trimmed) {
                    Ok(value) => println!("{}", value),
                    Err(e) => eprintln!("Error: {}", e),
                }
            }
            Err(_) => break,
        }
    }
}

/// Parse a single typed value like "100U8" or "-50I16".
fn parse_value(token: &str, context: &str) -> Result<i32, String> {
    let token = token.trim();

    // Determine the type prefix (U/u for unsigned, I/i for signed).
    match token.find(|c| c == 'U' || c == 'u' || c == 'I' || c == 'i') {
        Some(pos) => {
            let value_str = &token[..pos];
            if value_str.is_empty() {
                return Err(format!("invalid input: {}", context));
            }

            let is_unsigned = token.as_bytes()[pos] == b'U' || token.as_bytes()[pos] == b'u';

            // Reject negative values for unsigned types.
            if is_unsigned && value_str.starts_with('-') {
                return Err(format!("negative value not allowed: {}", context));
            }

            let value = value_str
                .parse::<i32>()
                .map_err(|_| format!("invalid number in '{}': {}", token, context))?;

            // Extract and validate the type suffix (e.g., "8", "16", "32").
            let suffix = &token[pos + 1..];
            if !suffix.is_empty() {
                match suffix.parse::<u32>() {
                    Ok(bits) => {
                        if is_unsigned {
                            // Unsigned range: [0, 2^bits - 1]
                            let unsigned_max = (1u64 << bits).wrapping_sub(1);
                            if value < 0 || value as u64 > unsigned_max {
                                return Err(format!(
                                    "value out of range for U{}: {}",
                                    bits, context
                                ));
                            }
                        } else {
                            // Signed range: [-2^(bits-1), 2^(bits-1) - 1]
                            let half_bits = if bits == 0 { 0 } else { bits - 1 };
                            let signed_max = (1i64 << half_bits).wrapping_sub(1);
                            let signed_min = -(signed_max + 1);
                            let value_i64: i64 = value as i64;

                            if value_i64 > signed_max || value_i64 < signed_min {
                                return Err(format!(
                                    "value out of range for I{}: {}",
                                    bits, context
                                ));
                            }
                        }
                    }
                    Err(_) => {
                        return Err(format!("invalid type suffix in '{}': {}", token, context));
                    }
                }
            }

            Ok(value)
        }
        None => token
            .parse::<i32>()
            .map_err(|_| format!("invalid number: {}", context)),
    }
}

/// Evaluate a Tuff expression and return the result.
pub fn execute_tuff(input: &str) -> Result<i32, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Ok(0);
    }

    // Check for binary operators (+, -, *, /) and evaluate as expression.
    let ops = ['+', '-', '*', '/'];
    for ch in &ops {
        if let Some(pos) = trimmed.find(*ch) {
            // Avoid treating a leading '-' as subtraction (it's part of a negative number).
            if *ch == '-' && pos == 0 {
                continue;
            }

            let left_str = &trimmed[..pos];
            let right_str = &trimmed[pos + 1..];

            // Recursively evaluate each side to support chained expressions.
            let left_val = execute_tuff(left_str)?;
            let right_val = execute_tuff(right_str)?;

            return match ch {
                '+' => Ok(left_val + right_val),
                '-' => Ok(left_val - right_val),
                '*' => Ok(left_val * right_val),
                '/' => {
                    if right_val == 0 {
                        Err(format!("division by zero: {}", input))
                    } else {
                        Ok(left_val / right_val)
                    }
                }
                _ => unreachable!(),
            };
        }
    }

    // No operator found — parse as a single value.
    parse_value(trimmed, input)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execute_tuff_empty_string() {
        assert_eq!(execute_tuff(""), Ok(0));
    }

    #[test]
    fn test_execute_tuff_whitespace() {
        assert_eq!(execute_tuff("   "), Ok(0));
    }

    // U8 tests
    #[test]
    fn test_execute_tuff_100u8() {
        assert_eq!(execute_tuff("100U8"), Ok(100));
    }

    #[test]
    fn test_execute_tuff_negative_u8_error() {
        assert!(execute_tuff("-100U8").is_err());
    }

    #[test]
    fn test_execute_tuff_256u8_overflow_error() {
        assert!(execute_tuff("256U8").is_err());
    }

    // U16 tests
    #[test]
    fn test_execute_tuff_u16_valid() {
        assert_eq!(execute_tuff("30000U16"), Ok(30000));
    }

    #[test]
    fn test_execute_tuff_u16_overflow_error() {
        assert!(execute_tuff("65536U16").is_err()); // max is 65535
    }

    // U32 tests
    #[test]
    fn test_execute_tuff_u32_valid() {
        assert_eq!(execute_tuff("2147483647U32"), Ok(2_147_483_647)); // i32::MAX fits in U32
    }

    #[test]
    fn test_execute_tuff_u32_negative_error() {
        assert!(execute_tuff("-100U32").is_err());
    }

    // I8 tests
    #[test]
    fn test_execute_tuff_i8_valid() {
        assert_eq!(execute_tuff("127I8"), Ok(127));
    }

    #[test]
    fn test_execute_tuff_i8_negative_valid() {
        assert_eq!(execute_tuff("-128I8"), Ok(-128));
    }

    #[test]
    fn test_execute_tuff_i8_overflow_error() {
        assert!(execute_tuff("128I8").is_err()); // max is 127
    }

    #[test]
    fn test_execute_tuff_i8_underflow_error() {
        assert!(execute_tuff("-129I8").is_err()); // min is -128
    }

    // I16 tests
    #[test]
    fn test_execute_tuff_i16_valid() {
        assert_eq!(execute_tuff("30000I16"), Ok(30000));
    }

    #[test]
    fn test_execute_tuff_i16_negative_valid() {
        assert_eq!(execute_tuff("-32768I16"), Ok(-32768));
    }

    #[test]
    fn test_execute_tuff_i16_overflow_error() {
        assert!(execute_tuff("32768I16").is_err()); // max is 32767
    }

    // I32 tests
    #[test]
    fn test_execute_tuff_i32_valid() {
        assert_eq!(execute_tuff("2000000000I32"), Ok(2_000_000_000));
    }

    #[test]
    fn test_execute_tuff_i32_negative_valid() {
        assert_eq!(execute_tuff("-2000000000I32"), Ok(-2_000_000_000));
    }

    // Case insensitivity tests
    #[test]
    fn test_execute_tuff_lowercase_u8() {
        assert_eq!(execute_tuff("100u8"), Ok(100));
    }

    #[test]
    fn test_execute_tuff_lowercase_i8() {
        assert_eq!(execute_tuff("-50i8"), Ok(-50));
    }

    // Expression tests
    #[test]
    fn test_execute_tuff_addition_expression() {
        assert_eq!(execute_tuff("1U8 + 2U8"), Ok(3));
    }

    #[test]
    fn test_execute_tuff_chained_addition_expression() {
        assert_eq!(execute_tuff("1U8 + 2U8 + 3U8"), Ok(6));
    }

    #[test]
    fn test_execute_tuff_subtraction_expression() {
        assert_eq!(execute_tuff("5I8 - 3I8"), Ok(2));
    }

    #[test]
    fn test_execute_tuff_multiplication_expression() {
        assert_eq!(execute_tuff("4U8 * 5U8"), Ok(20));
    }

    #[test]
    fn test_execute_tuff_division_expression() {
        assert_eq!(execute_tuff("10I32 / 2I32"), Ok(5));
    }

    #[test]
    fn test_execute_tuff_division_by_zero_error() {
        assert!(execute_tuff("10U8 / 0U8").is_err());
    }

    // Mixed operator expressions (tests precedence/ordering)
    #[test]
    fn test_execute_tuff_mixed_expression_add_sub() {
        assert_eq!(execute_tuff("10I32 + 5I32 - 3I32"), Ok(12));
    }

    // Error paths in parse_value
    #[test]
    fn test_execute_tuff_invalid_number_error() {
        assert!(execute_tuff("abcU8").is_err());
    }

    #[test]
    fn test_execute_tuff_plain_integer_valid() {
        assert_eq!(execute_tuff("42"), Ok(42));
    }

    #[test]
    fn test_execute_tuff_plain_integer_negative_error() {
        assert!(execute_tuff("abc").is_err());
    }
}
