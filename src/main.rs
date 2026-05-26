// Feel free to change param type if required
fn interpret_tuff(source: &str) -> i64 {
    return 0;
}

fn main() {
    println!("Hello, world!");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interpret_tuff_empty_string() {
        assert_eq!(interpret_tuff(""), 0);
    }

    #[test]
    fn test_interpret_tuff_whitespace() {
        assert_eq!(interpret_tuff("   "), 0);
        assert_eq!(interpret_tuff("\t"), 0);
        assert_eq!(interpret_tuff("\n"), 0);
    }
}
