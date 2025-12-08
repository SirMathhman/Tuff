/// Interpret the given input string and return a resulting string.
///
/// Currently this function is a stub and always returns an `Err` indicating
/// it is not yet implemented.
pub fn interpret(input: &str) -> Result<String, String> {
    let s = input.trim();

    // If the input is a simple integer (only digits, optional leading + or -),
    // return it as-is for now.
    if s.chars().all(|c| c.is_ascii_digit() || c == '+' || c == '-') &&
        s.chars().any(|c| c.is_ascii_digit())
    {
        return Ok(s.to_string());
    }

    Err("interpret not implemented yet".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interpret_returns_err_for_non_numeric() {
        let res = interpret("hello");
        assert!(res.is_err());
        assert_eq!(res.unwrap_err(), "interpret not implemented yet");
    }

    #[test]
    fn interpret_returns_ok_for_numeric() {
        let res = interpret("100");
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), "100");
    }
}
