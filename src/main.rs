#[allow(dead_code)]
fn interpret(input: &str) -> i32 {
    if input.is_empty() {
        0
    } else {
        input.parse().unwrap_or(0)
    }
}

fn main() {
    println!("Hello, world!");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interpret_empty_string() {
        assert_eq!(interpret(""), 0);
    }

    #[test]
    fn test_interpret_100() {
        assert_eq!(interpret("100"), 100);
    }
}
