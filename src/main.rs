fn execute_tuff(_input: &str) -> u64 {
    todo!()
}

fn main() {
    println!("Hello, world!");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_string_returns_zero() {
        assert_eq!(execute_tuff(""), 0);
    }
}
