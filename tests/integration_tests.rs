// Integration tests for the Tuff compiler
// Tests full pipeline: Tuff source → parsed → type-checked → borrow-checked → code-generated → C

#[cfg(test)]
mod integration_tests {
    use tuff_compiler::compiler::lexer::Lexer;
    use tuff_compiler::compiler::parser::Parser;
    use tuff_compiler::compiler::type_checker::TypeChecker;
    use tuff_compiler::compiler::borrow_checker::BorrowChecker;
    use tuff_compiler::compiler::codegen::CodeGenerator;

    /// Helper function to compile Tuff source through full pipeline
    fn compile_tuff(source: &str) -> Result<String, String> {
        // Lexical analysis
        let mut lexer = Lexer::new(source, "test.tuff");
        let tokens = lexer.tokenize();

        // Parsing
        let mut parser = Parser::new(tokens, "test.tuff".to_string());
        let program = parser.parse()
            .map_err(|errs| format!("{} parse errors", errs.len()))?;

        // Type checking
        let mut type_checker = TypeChecker::new();
        type_checker.check_program(&program)
            .map_err(|errs| format!("{} type errors", errs.len()))?;

        // Borrow checking
        let mut borrow_checker = BorrowChecker::new();
        borrow_checker.check_program(&program)
            .map_err(|errs| format!("{} borrow errors", errs.len()))?;

        // Code generation
        let mut codegen = CodeGenerator::new();
        codegen.generate_program(&program);
        Ok(codegen.finish())
    }

    #[test]
    fn test_pipeline_empty_program() {
        let source = "";
        match compile_tuff(source) {
            Ok(c_code) => {
                assert!(c_code.contains("#include"));
                assert!(c_code.contains("stdint.h"));
            }
            Err(e) => panic!("Should compile empty program: {}", e),
        }
    }

    #[test]
    fn test_pipeline_simple_extern() {
        let source = r#"
extern {
    fn printf(s: &str) -> i32;
}
"#;
        match compile_tuff(source) {
            Ok(c_code) => {
                assert!(c_code.contains("printf"));
                assert!(c_code.contains("extern"));
            }
            Err(e) => panic!("Should compile extern declaration: {}", e),
        }
    }

    #[test]
    fn test_pipeline_simple_function() {
        let source = r#"
fn add(a: i32, b: i32) -> i32 {
    let result = a + b;
}
"#;
        match compile_tuff(source) {
            Ok(c_code) => {
                assert!(c_code.contains("int32_t add"));
                assert!(c_code.contains("int32_t a, int32_t b"));
            }
            Err(e) => panic!("Should compile function: {}", e),
        }
    }

    #[test]
    fn test_pipeline_with_literals() {
        let source = r#"
fn get_number() -> i32 {
    let x = 42;
}
"#;
        match compile_tuff(source) {
            Ok(c_code) => {
                assert!(c_code.contains("42"));
                assert!(c_code.contains("int32_t x"));
            }
            Err(e) => panic!("Should compile literals: {}", e),
        }
    }

    #[test]
    fn test_pipeline_type_inference() {
        let source = r#"
fn test() -> void {
    let num = 100;
}
"#;
        match compile_tuff(source) {
            Ok(c_code) => {
                // Type checking should infer num as i32
                assert!(c_code.contains("100"));
            }
            Err(e) => panic!("Should infer types: {}", e),
        }
    }

    #[test]
    fn test_pipeline_binary_operations() {
        let source = r#"
fn compute() -> void {
    let a = 5;
    let b = 3;
    let sum = a + b;
}
"#;
        match compile_tuff(source) {
            Ok(c_code) => {
                assert!(c_code.contains("+"));
                assert!(c_code.contains("5"));
                assert!(c_code.contains("3"));
            }
            Err(e) => panic!("Should handle binary ops: {}", e),
        }
    }

    #[test]
    fn test_pipeline_boolean_logic() {
        let source = r#"
fn check() -> void {
    let x = true;
    let y = false;
    let result = x && y;
}
"#;
        match compile_tuff(source) {
            Ok(c_code) => {
                assert!(c_code.contains("bool"));
                assert!(c_code.contains("true") || c_code.contains("1"));
                assert!(c_code.contains("false") || c_code.contains("0"));
            }
            Err(e) => panic!("Should handle booleans: {}", e),
        }
    }

    #[test]
    fn test_pipeline_string_literal() {
        let source = r#"
fn greet() -> void {
    let message = "Hello";
}
"#;
        match compile_tuff(source) {
            Ok(c_code) => {
                assert!(c_code.contains("Hello"));
            }
            Err(e) => panic!("Should handle strings: {}", e),
        }
    }

    #[test]
    fn test_pipeline_if_statement() {
        let source = r#"
fn test() -> void {
    if true {
        let x = 1;
    }
}
"#;
        match compile_tuff(source) {
            Ok(c_code) => {
                assert!(c_code.contains("if"));
            }
            Err(e) => panic!("Should handle if statements: {}", e),
        }
    }

    #[test]
    fn test_pipeline_return_statement() {
        let source = r#"
fn get_five() -> i32 {
    return 5;
}
"#;
        match compile_tuff(source) {
            Ok(c_code) => {
                assert!(c_code.contains("return"));
                assert!(c_code.contains("5"));
            }
            Err(e) => panic!("Should handle return statements: {}", e),
        }
    }

    #[test]
    fn test_bootstrap_lexer_helpers() {
        // Test self-hosting: compiler can compile Tuff code that would be used in its own implementation
        let source = r#"
fn is_whitespace(code: i32) -> bool {
    return code == 32 || code == 9 || code == 10;
}

fn is_digit(code: i32) -> bool {
    return code >= 48 && code <= 57;
}

fn is_alpha(code: i32) -> bool {
    return (code >= 97 && code <= 122) || (code >= 65 && code <= 90);
}

fn is_lower(code: i32) -> bool {
    return code >= 97 && code <= 122;
}

fn is_upper(code: i32) -> bool {
    return code >= 65 && code <= 90;
}
"#;
        match compile_tuff(source) {
            Ok(c_code) => {
                // Verify all functions were compiled
                assert!(c_code.contains("is_whitespace"));
                assert!(c_code.contains("is_digit"));
                assert!(c_code.contains("is_alpha"));
                assert!(c_code.contains("is_lower"));
                assert!(c_code.contains("is_upper"));
                // Verify they're C functions
                assert!(c_code.contains("bool"));
                assert!(c_code.contains("int32_t"));
            }
            Err(e) => panic!("Should compile bootstrap code: {}", e),
        }
    }
}
