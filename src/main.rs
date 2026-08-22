fn main() {
    println!("Hello, world!");
}

pub fn evaluate(input: &str) -> i64 {
    // Stub: always returns 0.
    let _ = input;
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_string_evaluates_to_zero() {
        assert_eq!(evaluate(""), 0);
    }
}
