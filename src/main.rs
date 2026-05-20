fn parse_typed_literal(token: &str) -> Result<u64, ()> {
    let suffixes: [(&str, u64); 4] = [
        ("U8", 255),
        ("U16", 65535),
        ("U32", 4_294_967_295),
        ("U64", u64::MAX),
    ];

    for (suffix, max) in suffixes {
        if let Some(literal) = token.strip_suffix(suffix) {
            if literal.starts_with('-') {
                return Err(());
            }
            if let Ok(n) = literal.parse::<u64>() {
                if n <= max {
                    return Ok(n);
                }
            }
            return Err(());
        }
    }

    Err(())
}

fn interpret_tuff(input: &str) -> Result<u64, ()> {
    let input = input.trim();
    if input.is_empty() {
        return Ok(0);
    }

    let tokens: Vec<&str> = input.split_whitespace().collect();

    if tokens.len() == 1 {
        return parse_typed_literal(tokens[0]);
    }

    if tokens.len() % 2 == 0 {
        return Err(());
    }

    let mut result = parse_typed_literal(tokens[0])?;

    let mut i = 1;
    while i < tokens.len() {
        let op = tokens[i];
        let b = parse_typed_literal(tokens[i + 1])?;
        result = match op {
            "+" => result.checked_add(b).ok_or(()),
            "-" => result.checked_sub(b).ok_or(()),
            "*" => result.checked_mul(b).ok_or(()),
            "/" => result.checked_div(b).ok_or(()),
            _ => Err(()),
        }?;
        i += 2;
    }

    Ok(result)
}

use std::io::{self, Write};

fn main() -> io::Result<()> {
    let stdin = io::stdin();
    let mut stdout = io::stdout();

    loop {
        print!("> ");
        stdout.flush()?;

        let mut line = String::new();
        if stdin.read_line(&mut line)? == 0 {
            break;
        }

        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if line == ":quit" || line == ":q" {
            break;
        }

        match interpret_tuff(line) {
            Ok(value) => println!("{:?}", value),
            Err(()) => println!("Err"),
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interpret_tuff_empty_string_returns_0() {
        assert_eq!(interpret_tuff(""), Ok(0));
    }

    #[test]
    fn interpret_tuff_whitespace_only_returns_0() {
        assert_eq!(interpret_tuff(" "), Ok(0));
    }

    #[test]
    fn interpret_tuff_u8_suffix() {
        assert_eq!(interpret_tuff("100U8"), Ok(100));
    }

    #[test]
    fn interpret_tuff_negative_u8_is_err() {
        assert_eq!(interpret_tuff("-100U8"), Err(()));
    }

    #[test]
    fn interpret_tuff_u8_overflow_is_err() {
        assert_eq!(interpret_tuff("256U8"), Err(()));
    }

    #[test]
    fn interpret_tuff_u16_suffix() {
        assert_eq!(interpret_tuff("500U16"), Ok(500));
    }

    #[test]
    fn interpret_tuff_u16_overflow_is_err() {
        assert_eq!(interpret_tuff("65536U16"), Err(()));
    }

    #[test]
    fn interpret_tuff_u32_suffix() {
        assert_eq!(interpret_tuff("70000U32"), Ok(70000));
    }

    #[test]
    fn interpret_tuff_u32_overflow_is_err() {
        assert_eq!(interpret_tuff("4294967296U32"), Err(()));
    }

    #[test]
    fn interpret_tuff_u64_suffix() {
        assert_eq!(interpret_tuff("100U64"), Ok(100));
    }

    #[test]
    fn interpret_tuff_u64_large_value() {
        assert_eq!(interpret_tuff("3000000000U64"), Ok(3000000000));
    }

    #[test]
    fn interpret_tuff_u64_max_value() {
        assert_eq!(
            interpret_tuff("18446744073709551615U64"),
            Ok(18446744073709551615)
        );
    }

    #[test]
    fn interpret_tuff_addition() {
        assert_eq!(interpret_tuff("1U8 + 2U8"), Ok(3));
    }

    #[test]
    fn interpret_tuff_multi_addition() {
        assert_eq!(interpret_tuff("1U8 + 2U8 + 3U8"), Ok(6));
    }
}
