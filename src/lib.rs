pub fn interpret(input: &str) -> String {
    const SUFFIXES: [&str; 8] = ["U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64"];

    // Support very simple addition expressions where both operands are
    // numeric literals with the exact same supported suffix. Example:
    // "100U8 + 50U8" -> "150". Whitespace around '+' is allowed.
    if let Some(idx) = input.find('+') {
        let left = input[..idx].trim();
        let right = input[idx + 1..].trim();

        for sfx in SUFFIXES {
            if left.ends_with(sfx) && right.ends_with(sfx) {
                let lpos = left.len() - sfx.len();
                let rpos = right.len() - sfx.len();
                if lpos > 0 && rpos > 0
                    && left.as_bytes().get(lpos - 1).map(|b| b.is_ascii_digit()).unwrap_or(false)
                    && right.as_bytes().get(rpos - 1).map(|b| b.is_ascii_digit()).unwrap_or(false)
                {
                    let ln = &left[..lpos];
                    let rn = &right[..rpos];

                    if sfx.starts_with('U') {
                        if let (Ok(a), Ok(b)) = (ln.parse::<u128>(), rn.parse::<u128>()) {
                            return (a + b).to_string();
                        }
                    } else if let (Ok(a), Ok(b)) = (ln.parse::<i128>(), rn.parse::<i128>()) {
                        return (a + b).to_string();
                    }
                }
            }
        }
    }

    for sfx in SUFFIXES {
        if input.ends_with(sfx) {
            let pos = input.len() - sfx.len();
            if pos > 0
                && input
                    .as_bytes()
                    .get(pos - 1)
                    .map(|b| b.is_ascii_digit())
                    .unwrap_or(false)
            {
                return input[..pos].to_string();
            }
        }
    }

    input.to_string()
}

#[cfg(test)]
mod tests {
    use crate::interpret;

    #[test]
    fn interpret_returns_same_string() {
        let input = "hello world";
        let out = interpret(input);
        assert_eq!(out, input);
    }

    #[test]
    fn interpret_strips_type_like_suffix() {
        assert_eq!(interpret("100U8"), "100");
        assert_eq!(interpret("123U16"), "123");
        assert_eq!(interpret("7I32"), "7");
        assert_eq!(interpret("900U64"), "900");

        // Case-sensitive: lowercase should not match
        assert_eq!(interpret("42u32"), "42u32");

        // Don't strip when letters are part of a word
        assert_eq!(interpret("valueU16"), "valueU16");

        // digits-only should be unchanged
        assert_eq!(interpret("12345"), "12345");
    }

    #[test]
    fn interpret_adds_same_suffix_literals() {
        assert_eq!(interpret("100U8 + 50U8"), "150");
        assert_eq!(interpret("20I32+22I32"), "42");

        // mismatched suffix or variant should not be evaluated
        assert_eq!(interpret("100U8 + 50u8"), "100U8 + 50u8");
        assert_eq!(interpret("abc + 123"), "abc + 123");
    }
}
