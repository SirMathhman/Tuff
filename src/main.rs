fn main() {
    println!("Hello, world!");
}

pub fn evaluate(input: &str) -> i64 {
    input.parse().unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_string_evaluates_to_zero() {
        assert_eq!(evaluate(""), 0);
    }

    #[test]
    fn one_evaluates_to_one() {
        assert_eq!(evaluate("1"), 1);
    }
}
