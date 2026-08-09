fn main() {
    println!("Hello, world!");
}

fn compile_tuff_to_c(tuff_source: &str) -> String {
    todo!()
}

fn execute_tuff(_tuff_source: &str, _args: Vec<String>) -> i32 {
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execute_tuff_empty_source_no_args() {
        assert_eq!(execute_tuff("", vec![]), 0);
    }
}
