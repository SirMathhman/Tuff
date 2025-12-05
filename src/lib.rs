pub fn interpret(input: &str) -> String {
    const SUFFIXES: [&str; 8] = ["U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64"];

    for sfx in SUFFIXES {
        if input.ends_with(sfx) {
            let pos = input.len() - sfx.len();
            if pos > 0 && input.as_bytes().get(pos - 1).map(|b| b.is_ascii_digit()).unwrap_or(false) {
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
}
