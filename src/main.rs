fn main() {
    use std::io::{self, Write};

    let stdin = io::stdin();
    let mut stdout = io::stdout();

    loop {
        print!("interpret> ");
        #[allow(clippy::expect_used)]
        stdout.flush().expect("flush failed");

        let mut input = String::new();
        match stdin.read_line(&mut input) {
            Ok(0) => {
                // EOF
                println!();
                break;
            }
            Ok(_) => {}
            Err(e) => {
                eprintln!("input error: {}", e);
                break;
            }
        }

        let line = input.trim();
        if line.is_empty() {
            continue;
        }
        if line.eq_ignore_ascii_case("exit") || line.eq_ignore_ascii_case("quit") {
            break;
        }

        match interpret(line) {
            Ok(val) => println!("{}", val),
            Err(err) => println!("Error: {}", err),
        }
    }
}

fn parse_numeric_prefix(s: &str) -> Result<usize, String> {
    let bytes = s.as_bytes();
    let mut i: usize = 0;
    let len = bytes.len();

    // optional leading sign
    if i < len {
        if let Some(&byte) = bytes.get(i) {
            if byte == b'+' || byte == b'-' {
                i = i.saturating_add(1);
                if i == len {
                    return Err("invalid number".to_string());
                }
            }
        }
    }

    let mut seen_digit = false;
    let mut seen_dot = false;
    let mut seen_exp = false;

    while i < len {
        let c = match bytes.get(i) {
            Some(&byte) => byte as char,
            None => break,
        };
        if c.is_ascii_digit() {
            seen_digit = true;
            i = i.saturating_add(1);
            continue;
        }
        if c == '.' {
            if seen_dot || seen_exp {
                break;
            }
            seen_dot = true;
            i = i.saturating_add(1);
            continue;
        }
        if (c == 'e' || c == 'E') && !seen_exp && seen_digit {
            // start exponent
            seen_exp = true;
            i = i.saturating_add(1);
            if i < len {
                if let Some(&byte) = bytes.get(i) {
                    if byte == b'+' || byte == b'-' {
                        i = i.saturating_add(1);
                    }
                }
            }
            let mut exp_digits: u32 = 0;
            while i < len {
                if let Some(&byte) = bytes.get(i) {
                    if (byte as char).is_ascii_digit() {
                        exp_digits = exp_digits.saturating_add(1);
                        i = i.saturating_add(1);
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }
            if exp_digits == 0 {
                return Err("invalid exponent".to_string());
            }
            continue;
        }
        // any alpha or other char means suffix or terminator
        break;
    }

    if !seen_digit {
        return Err("no digits".to_string());
    }

    Ok(i)
}

fn interpret(input: &str) -> Result<String, String> {
    let s = input.trim();
    if s.is_empty() {
        return Err("empty input".to_string());
    }

    // simple expression: look for a '+' operator at top level
    if let Some(op_pos) = find_top_level_plus(s) {
        let lhs = s.get(..op_pos).ok_or_else(|| "slice error".to_string())?;
        let rhs = s
            .get(op_pos.saturating_add(1)..)
            .ok_or_else(|| "slice error".to_string())?;
        return evaluate_add(lhs.trim(), rhs.trim());
    }

    let i = parse_numeric_prefix(s)?;
    let numeric = s.get(..i).ok_or_else(|| "slice error".to_string())?;

    // Validate suffix: only allow specific integer suffixes, preserving case
    let suffix = s.get(i..).ok_or_else(|| "slice error".to_string())?.trim();
    const ALLOWED: [&str; 8] = ["U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64"];
    if suffix.is_empty() || ALLOWED.contains(&suffix) {
        // Disallow negative numbers with unsigned suffixes like U8, U16, U32, U64.
        if !suffix.is_empty() && (suffix.starts_with('U')) && numeric.starts_with('-') {
            return Err("negative value with unsigned suffix".to_string());
        }

        // If a suffix is present, validate the numeric range/type for integer suffixes.
        if !suffix.is_empty() {
            validate_integer_suffix(numeric, suffix)?;
        }
        return Ok(numeric.to_string());
    }

    Err("unsupported suffix".to_string())
}

fn validate_integer_suffix(numeric: &str, suffix: &str) -> Result<(), String> {
    // Numeric must be an integer literal (no dot or exponent) for integer suffixes.
    if numeric.contains('.') || numeric.contains('e') || numeric.contains('E') {
        return Err("invalid integer literal for integer suffix".to_string());
    }

    // Strip leading + if present. If leading '-', keep for signed parsing.
    let s = numeric.strip_prefix('+').unwrap_or(numeric);

    match suffix {
        "U8" => s
            .parse::<u8>()
            .map(|_| ())
            .map_err(|_| "out of range for U8".to_string()),
        "U16" => s
            .parse::<u16>()
            .map(|_| ())
            .map_err(|_| "out of range for U16".to_string()),
        "U32" => s
            .parse::<u32>()
            .map(|_| ())
            .map_err(|_| "out of range for U32".to_string()),
        "U64" => s
            .parse::<u64>()
            .map(|_| ())
            .map_err(|_| "out of range for U64".to_string()),
        "I8" => numeric
            .parse::<i8>()
            .map(|_| ())
            .map_err(|_| "out of range for I8".to_string()),
        "I16" => numeric
            .parse::<i16>()
            .map(|_| ())
            .map_err(|_| "out of range for I16".to_string()),
        "I32" => numeric
            .parse::<i32>()
            .map(|_| ())
            .map_err(|_| "out of range for I32".to_string()),
        "I64" => numeric
            .parse::<i64>()
            .map(|_| ())
            .map_err(|_| "out of range for I64".to_string()),
        _ => Err("unsupported integer suffix".to_string()),
    }
}

fn find_top_level_plus(s: &str) -> Option<usize> {
    // Try to find a '+' operator between two numeric tokens. We use parse_numeric_prefix
    // to locate the left numeric token and ensure a '+' follows.
    let trimmed = s.trim();

    if trimmed.is_empty() {
        return None;
    }

    // Left side: try parse a numeric prefix starting at offset 0
    match parse_numeric_prefix(trimmed) {
        Ok(i) => {
            let mut pos = i;
            let bytes = trimmed.as_bytes();
            // skip letters/digits for the suffix
            while pos < bytes.len() {
                if let Some(&byte) = bytes.get(pos) {
                    if byte.is_ascii_alphanumeric() {
                        pos = pos.saturating_add(1);
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }
            // skip whitespace
            while pos < bytes.len() {
                if let Some(&byte) = bytes.get(pos) {
                    if byte.is_ascii_whitespace() {
                        pos = pos.saturating_add(1);
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }
            if pos < bytes.len() {
                if let Some(&byte) = bytes.get(pos) {
                    if byte == b'+' {
                        return Some(pos);
                    }
                }
            }
        }
        Err(_) => return None,
    }

    None
}

fn evaluate_add(lhs: &str, rhs: &str) -> Result<String, String> {
    let lhs_trim = lhs.trim();
    let rhs_trim = rhs.trim();

    let li = parse_numeric_prefix(lhs_trim)?;
    let ri = parse_numeric_prefix(rhs_trim)?;

    let lnum = lhs_trim
        .get(..li)
        .ok_or_else(|| "slice error".to_string())?;
    let rnum = rhs_trim
        .get(..ri)
        .ok_or_else(|| "slice error".to_string())?;
    let lsuffix = lhs_trim
        .get(li..)
        .ok_or_else(|| "slice error".to_string())?
        .trim();
    let rsuffix = rhs_trim
        .get(ri..)
        .ok_or_else(|| "slice error".to_string())?
        .trim();

    if lsuffix.is_empty() || rsuffix.is_empty() {
        return Err("missing integer suffix on operand".to_string());
    }
    if lsuffix != rsuffix {
        return Err("mismatched suffix types".to_string());
    }

    // Validate both operands within their ranges
    validate_integer_suffix(lnum, lsuffix)?;
    validate_integer_suffix(rnum, rsuffix)?;

    match lsuffix {
        "U8" => {
            let a = lnum
                .strip_prefix('+')
                .unwrap_or(lnum)
                .parse::<u8>()
                .map_err(|_| "invalid operand".to_string())?;
            let b = rnum
                .strip_prefix('+')
                .unwrap_or(rnum)
                .parse::<u8>()
                .map_err(|_| "invalid operand".to_string())?;
            a.checked_add(b)
                .map(|s| s.to_string())
                .ok_or_else(|| "overflow".to_string())
        }
        "U16" => {
            let a = lnum
                .strip_prefix('+')
                .unwrap_or(lnum)
                .parse::<u16>()
                .map_err(|_| "invalid operand".to_string())?;
            let b = rnum
                .strip_prefix('+')
                .unwrap_or(rnum)
                .parse::<u16>()
                .map_err(|_| "invalid operand".to_string())?;
            a.checked_add(b)
                .map(|s| s.to_string())
                .ok_or_else(|| "overflow".to_string())
        }
        "U32" => {
            let a = lnum
                .strip_prefix('+')
                .unwrap_or(lnum)
                .parse::<u32>()
                .map_err(|_| "invalid operand".to_string())?;
            let b = rnum
                .strip_prefix('+')
                .unwrap_or(rnum)
                .parse::<u32>()
                .map_err(|_| "invalid operand".to_string())?;
            a.checked_add(b)
                .map(|s| s.to_string())
                .ok_or_else(|| "overflow".to_string())
        }
        "U64" => {
            let a = lnum
                .strip_prefix('+')
                .unwrap_or(lnum)
                .parse::<u64>()
                .map_err(|_| "invalid operand".to_string())?;
            let b = rnum
                .strip_prefix('+')
                .unwrap_or(rnum)
                .parse::<u64>()
                .map_err(|_| "invalid operand".to_string())?;
            a.checked_add(b)
                .map(|s| s.to_string())
                .ok_or_else(|| "overflow".to_string())
        }
        "I8" => {
            let a = lnum
                .parse::<i8>()
                .map_err(|_| "invalid operand".to_string())?;
            let b = rnum
                .parse::<i8>()
                .map_err(|_| "invalid operand".to_string())?;
            a.checked_add(b)
                .map(|s| s.to_string())
                .ok_or_else(|| "overflow".to_string())
        }
        "I16" => {
            let a = lnum
                .parse::<i16>()
                .map_err(|_| "invalid operand".to_string())?;
            let b = rnum
                .parse::<i16>()
                .map_err(|_| "invalid operand".to_string())?;
            a.checked_add(b)
                .map(|s| s.to_string())
                .ok_or_else(|| "overflow".to_string())
        }
        "I32" => {
            let a = lnum
                .parse::<i32>()
                .map_err(|_| "invalid operand".to_string())?;
            let b = rnum
                .parse::<i32>()
                .map_err(|_| "invalid operand".to_string())?;
            a.checked_add(b)
                .map(|s| s.to_string())
                .ok_or_else(|| "overflow".to_string())
        }
        "I64" => {
            let a = lnum
                .parse::<i64>()
                .map_err(|_| "invalid operand".to_string())?;
            let b = rnum
                .parse::<i64>()
                .map_err(|_| "invalid operand".to_string())?;
            a.checked_add(b)
                .map(|s| s.to_string())
                .ok_or_else(|| "overflow".to_string())
        }
        _ => Err("unsupported integer suffix".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_numeric_with_suffix() {
        assert_eq!(interpret("100U8").unwrap(), "100");
        assert_eq!(interpret("+123I32").unwrap(), "+123");
        assert!(interpret("-1.5F").is_err());
        assert!(interpret("1e10u64").is_err());
        assert!(interpret("1e10U64").is_err());
        assert!(interpret("abc").is_err());
        assert!(interpret("").is_err());
        // test more allowed suffixes
        assert_eq!(interpret("42U16").unwrap(), "42");
        assert_eq!(interpret("7I8").unwrap(), "7");
        assert_eq!(interpret("0U32").unwrap(), "0");
        assert_eq!(interpret("-128I8").unwrap(), "-128");
        assert!(interpret("-100U8").is_err());
        assert!(interpret("100u8").is_err());
        assert!(interpret("100U8abc").is_err());
        // Bounds tests
        assert_eq!(interpret("255U8").unwrap(), "255");
        assert!(interpret("256U8").is_err());
        assert_eq!(interpret("65535U16").unwrap(), "65535");
        assert!(interpret("65536U16").is_err());
        assert_eq!(interpret("2147483647I32").unwrap(), "2147483647");
        assert!(interpret("2147483648I32").is_err());
        assert!(interpret("18446744073709551616U64").is_err());
        // Addition expressions
        assert_eq!(interpret("1U8 + 2U8").unwrap(), "3");
        assert_eq!(interpret("1U8+2U8").unwrap(), "3");
        assert!(interpret("255U8+1U8").is_err());
        assert!(interpret("1U8 + 2U16").is_err());
        assert_eq!(interpret("-1I8 + 2I8").unwrap(), "1");
        // Mixed/invalid operator/case
        assert!(interpret("100U8 + 100U8*").is_err());
    }
}
