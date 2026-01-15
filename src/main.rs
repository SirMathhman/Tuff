#[allow(dead_code)]
fn interpret(input: &str) -> i32 {
    input.parse::<i32>().ok().map_or(0, |x| x)
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
}
