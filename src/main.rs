fn interpret_tuff(input: &str) -> Result<u64, ()> {
    let input = input.trim();
    if input.is_empty() {
        return Ok(0);
    }

    let suffixes: [(&str, u64); 4] = [
        ("U8", 255),
        ("U16", 65535),
        ("U32", 4_294_967_295),
        ("U64", u64::MAX),
    ];

    for (suffix, max) in suffixes {
        if let Some(literal) = input.strip_suffix(suffix) {
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
}
