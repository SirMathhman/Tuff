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

fn tokenize(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut buf = String::new();
    for c in input.chars() {
        if c.is_whitespace() {
            if !buf.is_empty() {
                tokens.push(std::mem::take(&mut buf));
            }
        } else if c == '(' || c == ')' {
            if !buf.is_empty() {
                tokens.push(std::mem::take(&mut buf));
            }
            tokens.push(c.to_string());
        } else {
            buf.push(c);
        }
    }
    if !buf.is_empty() {
        tokens.push(buf);
    }
    tokens
}

fn parse_expr(tokens: &[String], pos: &mut usize) -> Result<u64, ()> {
    let mut acc = parse_term(tokens, pos)?;
    while *pos < tokens.len() {
        match tokens[*pos].as_str() {
            "+" => {
                *pos += 1;
                acc = acc.checked_add(parse_term(tokens, pos)?).ok_or(())?;
            }
            "-" => {
                *pos += 1;
                acc = acc.checked_sub(parse_term(tokens, pos)?).ok_or(())?;
            }
            _ => break,
        }
    }
    Ok(acc)
}

fn parse_term(tokens: &[String], pos: &mut usize) -> Result<u64, ()> {
    let mut acc = parse_factor(tokens, pos)?;
    while *pos < tokens.len() {
        match tokens[*pos].as_str() {
            "*" => {
                *pos += 1;
                acc = acc.checked_mul(parse_factor(tokens, pos)?).ok_or(())?;
            }
            "/" => {
                *pos += 1;
                acc = acc.checked_div(parse_factor(tokens, pos)?).ok_or(())?;
            }
            _ => break,
        }
    }
    Ok(acc)
}

fn parse_factor(tokens: &[String], pos: &mut usize) -> Result<u64, ()> {
    if *pos >= tokens.len() {
        return Err(());
    }
    if tokens[*pos] == "(" {
        *pos += 1;
        let val = parse_expr(tokens, pos)?;
        if *pos >= tokens.len() || tokens[*pos] != ")" {
            return Err(());
        }
        *pos += 1;
        Ok(val)
    } else {
        let lit = parse_typed_literal(&tokens[*pos])?;
        *pos += 1;
        Ok(lit)
    }
}

fn interpret_tuff(input: &str) -> Result<u64, ()> {
    let input = input.trim();
    if input.is_empty() {
        return Ok(0);
    }

    let tokens = tokenize(input);
    if tokens.is_empty() {
        return Ok(0);
    }

    let mut pos = 0;
    let result = parse_expr(&tokens, &mut pos)?;
    if pos != tokens.len() {
        return Err(());
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

    #[test]
    fn interpret_tuff_precedence() {
        assert_eq!(interpret_tuff("1U8 * 2U8 + 3U8"), Ok(5));
    }

    #[test]
    fn interpret_tuff_reverse_precedence() {
        assert_eq!(interpret_tuff("1U8 + 2U8 * 3U8"), Ok(7));
    }

    #[test]
    fn interpret_tuff_parentheses() {
        assert_eq!(interpret_tuff("(1U8 + 2U8) * 3U8"), Ok(9));
    }
}
