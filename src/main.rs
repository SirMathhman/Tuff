#![deny(clippy::too_many_lines)]

fn parse_input(input: &str) -> (&str, String) {
    let mut number_end = 0;
    let chars: Vec<char> = input.chars().collect();

    if !chars.is_empty() && chars[0] == '-' {
        number_end = 1;
    }

    while number_end < chars.len() && chars[number_end].is_numeric() {
        number_end += 1;
    }

    let number_part = &input[..number_end];
    let type_suffix = input[number_end..].to_uppercase();
    (number_part, type_suffix)
}

fn parse_and_validate(input: &str) -> Result<i32, String> {
    let (number_part, type_suffix) = parse_input(input);

    if number_part.is_empty() || number_part == "-" {
        return Ok(0);
    }

    let value = number_part
        .parse::<i64>()
        .map_err(|_| "Failed to parse number".to_string())?;

    validate_and_convert(value, &type_suffix)
}

fn parse_term(term: &str) -> Result<i32, String> {
    parse_and_validate(term.trim())
}

fn apply_operation(left: i32, right: i32, op: char) -> i32 {
    match op {
        '+' => left.saturating_add(right),
        '-' => left.saturating_sub(right),
        _ => left,
    }
}

fn extract_type_suffix(term: &str) -> String {
    let (_, type_suffix) = parse_input(term.trim());
    type_suffix
}

fn extract_first_term(input: &str) -> String {
    let mut current_term = String::new();
    for ch in input.chars() {
        match ch {
            '+' | '-' if !current_term.trim().is_empty() => break,
            _ => current_term.push(ch),
        }
    }
    current_term
}

fn get_first_term_type(input: &str) -> String {
    extract_type_suffix(extract_first_term(input).trim())
}

fn evaluate_expression(input: &str) -> Result<i32, String> {
    let first_type_suffix = get_first_term_type(input);
    let first_term = extract_first_term(input);
    let mut result = parse_term(&first_term)?;
    let mut current_op = '+';
    let mut current_term = String::new();
    let remaining = &input[first_term.len()..];

    for ch in remaining.chars() {
        match ch {
            '+' | '-' if !current_term.trim().is_empty() => {
                let term_value = parse_term(&current_term)?;
                result = apply_operation(result, term_value, current_op);
                current_op = ch;
                current_term.clear();
            }
            _ => current_term.push(ch),
        }
    }

    if !current_term.trim().is_empty() {
        let term_value = parse_term(&current_term)?;
        result = apply_operation(result, term_value, current_op);
    }

    if !first_type_suffix.is_empty() {
        validate_and_convert(result as i64, &first_type_suffix)?;
    }

    Ok(result)
}

fn validate_unsigned(value: i64, bits: u32) -> Result<i32, String> {
    let max = (1i64 << bits) - 1;
    if (0..=max).contains(&value) {
        Ok(value as i32)
    } else {
        Err(format!("Value exceeds U{} range (0-{})", bits, max))
    }
}

fn validate_signed(value: i64, bits: u32) -> Result<i32, String> {
    let max = (1i64 << (bits - 1)) - 1;
    let min = -(1i64 << (bits - 1));
    if (min..=max).contains(&value) {
        Ok(value as i32)
    } else {
        Err(format!(
            "Value exceeds I{} range ({} to {})",
            bits, min, max
        ))
    }
}

fn validate_and_convert(value: i64, type_suffix: &str) -> Result<i32, String> {
    let is_signed = type_suffix.starts_with('I') || type_suffix.is_empty();

    if !is_signed && value < 0 {
        return Err("Negative numbers are not allowed for unsigned types".to_string());
    }

    match type_suffix {
        "U8" => validate_unsigned(value, 8),
        "U16" => validate_unsigned(value, 16),
        "U32" => validate_unsigned(value, 32),
        "U64" => {
            if value >= 0 {
                Ok(std::cmp::min(value, i32::MAX as i64) as i32)
            } else {
                Err("Value exceeds U64 range (0-18446744073709551615)".to_string())
            }
        }
        "I8" => validate_signed(value, 8),
        "I16" => validate_signed(value, 16),
        "I32" => validate_signed(value, 32),
        "I64" => {
            let clamped = std::cmp::max(std::cmp::min(value, i32::MAX as i64), i32::MIN as i64);
            Ok(clamped as i32)
        }
        "" => {
            if (i32::MIN as i64..=i32::MAX as i64).contains(&value) {
                Ok(value as i32)
            } else {
                Err("Value exceeds i32 range".to_string())
            }
        }
        _ => Err(format!("Unsupported type suffix: {}", type_suffix)),
    }
}

fn interpret(input: &str) -> Result<i32, String> {
    if input.is_empty() {
        return Ok(0);
    }

    if input.contains('+') || (input.contains('-') && input.match_indices('-').count() > 1) {
        return evaluate_expression(input);
    }

    parse_and_validate(input)
}

fn main() {
    // Simple REPL for interpret

    use std::io::{self, Write};

    loop {
        print!("Enter expression (or 'exit' to quit): ");
        io::stdout().flush().unwrap();

        let mut input = String::new();
        io::stdin().read_line(&mut input).unwrap();
        let input = input.trim();

        if input.eq_ignore_ascii_case("exit") {
            break;
        }

        match interpret(input) {
            Ok(result) => println!("Result: {}", result),
            Err(e) => println!("Error: {}", e),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interpret_empty_string() {
        assert_eq!(interpret(""), Ok(0));
    }

    #[test]
    fn test_interpret_100() {
        assert_eq!(interpret("100"), Ok(100));
    }

    #[test]
    fn test_interpret_100u8() {
        assert_eq!(interpret("100U8"), Ok(100));
    }

    #[test]
    fn test_interpret_negative_100u8() {
        assert!(interpret("-100U8").is_err());
    }

    #[test]
    fn test_interpret_256u8() {
        assert!(interpret("256U8").is_err());
    }

    // U16 tests
    #[test]
    fn test_interpret_256u16() {
        assert_eq!(interpret("256U16"), Ok(256));
    }

    #[test]
    fn test_interpret_65535u16() {
        assert_eq!(interpret("65535U16"), Ok(65535));
    }

    #[test]
    fn test_interpret_65536u16() {
        assert!(interpret("65536U16").is_err());
    }

    // U32 tests
    #[test]
    fn test_interpret_65536u32() {
        assert_eq!(interpret("65536U32"), Ok(65536));
    }

    #[test]
    fn test_interpret_2147483647u32() {
        assert_eq!(interpret("2147483647U32"), Ok(2147483647));
    }

    // U64 tests
    #[test]
    fn test_interpret_2147483648u64() {
        assert_eq!(interpret("2147483648U64"), Ok(2147483647)); // Clamped to i32 max
    }

    // I8 tests
    #[test]
    fn test_interpret_negative_100i8() {
        assert_eq!(interpret("-100I8"), Ok(-100));
    }

    #[test]
    fn test_interpret_127i8() {
        assert_eq!(interpret("127I8"), Ok(127));
    }

    #[test]
    fn test_interpret_128i8() {
        assert!(interpret("128I8").is_err());
    }

    #[test]
    fn test_interpret_negative_128i8() {
        assert_eq!(interpret("-128I8"), Ok(-128));
    }

    #[test]
    fn test_interpret_negative_129i8() {
        assert!(interpret("-129I8").is_err());
    }

    // I16 tests
    #[test]
    fn test_interpret_negative_1000i16() {
        assert_eq!(interpret("-1000I16"), Ok(-1000));
    }

    #[test]
    fn test_interpret_32767i16() {
        assert_eq!(interpret("32767I16"), Ok(32767));
    }

    #[test]
    fn test_interpret_32768i16() {
        assert!(interpret("32768I16").is_err());
    }

    #[test]
    fn test_interpret_negative_32768i16() {
        assert_eq!(interpret("-32768I16"), Ok(-32768));
    }

    #[test]
    fn test_interpret_negative_32769i16() {
        assert!(interpret("-32769I16").is_err());
    }

    // I32 tests
    #[test]
    fn test_interpret_negative_100i32() {
        assert_eq!(interpret("-100I32"), Ok(-100));
    }

    #[test]
    fn test_interpret_2147483647i32() {
        assert_eq!(interpret("2147483647I32"), Ok(2147483647));
    }

    #[test]
    fn test_interpret_2147483648i32() {
        assert!(interpret("2147483648I32").is_err());
    }

    #[test]
    fn test_interpret_negative_2147483648i32() {
        assert_eq!(interpret("-2147483648I32"), Ok(-2147483648));
    }

    // I64 tests - values that fit in i32
    #[test]
    fn test_interpret_negative_100i64() {
        assert_eq!(interpret("-100I64"), Ok(-100));
    }

    // Type suffix case insensitivity
    #[test]
    fn test_interpret_100u8_lowercase() {
        assert_eq!(interpret("100u8"), Ok(100));
    }

    // Expression tests
    #[test]
    fn test_interpret_expression_addition() {
        assert_eq!(interpret("1U8 + 2U8"), Ok(3));
    }

    #[test]
    fn test_interpret_expression_mixed_types() {
        assert_eq!(interpret("1U8 + 2"), Ok(3));
    }

    #[test]
    fn test_interpret_expression_overflow() {
        assert!(interpret("1U8 + 255").is_err());
    }
}
