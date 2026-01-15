#[allow(dead_code)]
fn interpret(input: &str) -> i32 {
    let trimmed = input
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>();
    trimmed.parse::<i32>().ok().map_or(0, |x| x)
}

fn main() {
    println!("Hello, world!");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interpret_100() {
        assert_eq!(interpret("100"), 100);
    }

    #[test]
    fn test_interpret_100u8() {
        assert_eq!(interpret("100U8"), 100);
    }
}
