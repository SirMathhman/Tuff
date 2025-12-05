pub fn interpret(input: &str) -> String {
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
}
