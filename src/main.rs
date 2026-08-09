fn main() {
    println!("Hello, world!");
}

fn compile_tuff_to_c(tuff_source: &str) -> String {
    todo!()
}

fn execute_tuff(tuff_source: &str, _args: Vec<String>) -> i32 {
    tuff_source.trim().parse().unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execute_tuff_empty_source_no_args() {
        assert_eq!(execute_tuff("", vec![]), 0);
    }

    #[test]
    fn test_execute_tuff_returns_expression_value() {
        assert_eq!(execute_tuff("1", vec![]), 1);
    }
}
