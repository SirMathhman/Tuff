fn interpret_tuff(input: &str) -> Result<i32, ()> {
    let input = input.trim();
    if input.is_empty() {
        return Ok(0);
    }
    if let Some(literal) = input.strip_suffix("U8") {
        if let Ok(n) = literal.parse::<i32>() {
            if n >= 0 && n <= 255 {
                return Ok(n);
            }
        }
        return Err(());
    }
    todo!()
}

fn main() {
    println!("Hello, world!");
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
}
