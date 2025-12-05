pub fn interpret(input: &str) -> String {
    let bytes = input.as_bytes();
    if bytes.is_empty() {
        return input.to_string();
    }

    // Find the start of the trailing digit run (if any)
    let mut j = bytes.len();
    while j > 0 {
        match bytes.get(j - 1) {
            Some(b) if b.is_ascii_digit() => j -= 1,
            _ => break,
        }
    }

    // If there is a trailing digit run, check for a preceding alphabetic run
    if j < bytes.len() {
        let mut k = j;
        while k > 0 {
            match bytes.get(k - 1) {
                Some(b) if b.is_ascii_alphabetic() => k -= 1,
                _ => break,
            }
        }

        // Only strip when there is at least one letter directly before the
        // trailing digits and those letters themselves follow a digit
        // (e.g. `100U8`, `42u32`). This avoids removing letters that are
        // part of a word (e.g. `valueU16` remains unchanged).
        if k < j && k > 0 && bytes.get(k - 1).map(|b| b.is_ascii_digit()).unwrap_or(false)
        {
            return input[..k].to_string();
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
        assert_eq!(interpret("42u32"), "42");
        assert_eq!(interpret("valueU16"), "valueU16");
        // non-suffix digits-only should be unchanged
        assert_eq!(interpret("12345"), "12345");
    }
}
