fn interpret_tuff(input: &str) -> i32 {
    if input.is_empty() {
        return 0;
    }
    todo!()
}

fn main() {
    println!("Hello, world!");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interpret_tuff_empty_string_returns_0() {
        assert_eq!(interpret_tuff(""), 0);
    }
}
