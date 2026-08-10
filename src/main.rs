fn main() {
    let tuff_source = std::fs::read_to_string("index.tuff").expect("Failed to read index.tuff");
    let generated_c = compile_tuff_to_c(&tuff_source).expect("Compilation failed");
    std::fs::write("index.c", &generated_c).expect("Failed to write index.c");
}

// --- Tokenizer ---

#[derive(Debug, Clone, PartialEq)]
enum Token {
    Ident(String),
    Num(i64),
    Plus,
    Semicolon,
    Hash,
    Eof,
}

struct Tokenizer {
    chars: Vec<char>,
    pos: usize,
}

impl Tokenizer {
    fn new(input: &str) -> Self {
        Self {
            chars: input.chars().collect(),
            pos: 0,
        }
    }

    fn next_token(&mut self) -> Token {
        self.skip_whitespace();
        if self.pos >= self.chars.len() {
            return Token::Eof;
        }

        match self.chars[self.pos] {
            '+' => {
                self.pos += 1;
                Token::Plus
            }
            ';' => {
                self.pos += 1;
                Token::Semicolon
            }
            '#' => {
                self.pos += 1;
                Token::Hash
            }
            c if c.is_ascii_digit() => self.parse_num(),
            c if c == '_' || c.is_ascii_alphabetic() => self.parse_ident(),
            _ => {
                self.pos += 1;
                Token::Hash // treat unknown chars as invalid
            }
        }
    }

    fn parse_num(&mut self) -> Token {
        let start = self.pos;
        while self.pos < self.chars.len() && self.chars[self.pos].is_ascii_digit() {
            self.pos += 1;
        }
        let s: String = self.chars[start..self.pos].iter().collect();
        Token::Num(s.parse().expect("number"))
    }

    fn parse_ident(&mut self) -> Token {
        let start = self.pos;
        while self.pos < self.chars.len()
            && (self.chars[self.pos].is_ascii_alphanumeric() || self.chars[self.pos] == '.' || self.chars[self.pos] == '_')
        {
            self.pos += 1;
        }
        let s: String = self.chars[start..self.pos].iter().collect();
        Token::Ident(s)
    }

    fn skip_whitespace(&mut self) {
        while self.pos < self.chars.len() && self.chars[self.pos].is_whitespace() {
            self.pos += 1;
        }
    }
}

// --- AST ---

#[derive(Debug)]
enum Expr {
    Num(i64),
    Var(String),
    ArgsLength,
    BinOp(Box<Expr>, Box<Expr>),
}

#[derive(Debug)]
enum Stmt {
    Let(String, Expr),
    Expr(Expr),
}

// --- Parser ---

struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}

impl Parser {
    fn new(input: &str) -> Self {
        let mut tokenizer = Tokenizer::new(input);
        let mut tokens = Vec::new();
        loop {
            let tok = tokenizer.next_token();
            tokens.push(tok.clone());
            if tok == Token::Eof {
                break;
            }
        }
        Self { tokens, pos: 0 }
    }

    fn parse(&mut self) -> Result<Vec<Stmt>, CompileError> {
        let mut stmts = Vec::new();
        while self.current() != Token::Eof {
            if self.current() == Token::Hash {
                self.pos += 1;
                return Err(CompileError {});
            }
            stmts.push(self.parse_stmt()?);
        }
        Ok(stmts)
    }

    fn parse_stmt(&mut self) -> Result<Stmt, CompileError> {
        if let Token::Ident(ref s) = self.current() {
            if s == "let" {
                return self.parse_let();
            }
        }
        Ok(Stmt::Expr(self.parse_expr()?))
    }

    fn parse_let(&mut self) -> Result<Stmt, CompileError> {
        // consume "let"
        self.pos += 1;
        let name = match self.current() {
            Token::Ident(ref s) => s.clone(),
            _ => return Err(CompileError {}),
        };
        self.pos += 1;
        // consume '='
        self.pos += 1;
        let value = self.parse_expr()?;
        // consume ';'
        if self.current() == Token::Semicolon {
            self.pos += 1;
        }
        Ok(Stmt::Let(name, value))
    }

    fn parse_expr(&mut self) -> Result<Expr, CompileError> {
        self.parse_addition()
    }

    fn parse_addition(&mut self) -> Result<Expr, CompileError> {
        let left = self.parse_primary()?;
        if self.current() == Token::Plus {
            self.pos += 1;
            let right = self.parse_primary()?;
            Ok(Expr::BinOp(Box::new(left), Box::new(right)))
        } else {
            Ok(left)
        }
    }

    fn parse_primary(&mut self) -> Result<Expr, CompileError> {
        match self.current() {
            Token::Num(n) => {
                self.pos += 1;
                Ok(Expr::Num(n))
            }
            Token::Ident(ref s) => {
                self.pos += 1;
                if s == "args.length" {
                    Ok(Expr::ArgsLength)
                } else {
                    Ok(Expr::Var(s.clone()))
                }
            }
            Token::Hash => {
                self.pos += 1;
                Err(CompileError {})
            }
            _ => Err(CompileError {}),
        }
    }

    fn current(&self) -> Token {
        self.tokens.get(self.pos).unwrap_or(&Token::Eof).clone()
    }
}

// --- Code Generator ---

fn codegen(stmts: &[Stmt]) -> String {
    let mut buf = String::from("int main(int argc, char* argv[]) {");
    for stmt in stmts {
        match stmt {
            Stmt::Let(name, value) => {
                buf.push_str(&format!(" int {} = {};", name, codegen_expr(value)));
            }
            Stmt::Expr(expr) => {
                buf.push_str(&format!(" return {};", codegen_expr(expr)));
            }
        }
    }
    buf.push('}');
    buf
}

fn codegen_expr(expr: &Expr) -> String {
    match expr {
        Expr::Num(n) => n.to_string(),
        Expr::Var(name) => name.clone(),
        Expr::ArgsLength => "argc".to_string(),
        Expr::BinOp(left, right) => {
            format!("{} + {}", codegen_expr(left), codegen_expr(right))
        }
    }
}

// --- Compiler Entry ---

#[derive(Debug)]
struct CompileError {}

impl std::fmt::Display for CompileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "compile error")
    }
}

fn compile_tuff_to_c(tuff_source: &str) -> Result<String, CompileError> {
    let trimmed = tuff_source.trim();
    let expr = trimmed
        .strip_prefix("in let args : &[&Str]")
        .map(|s| s.trim_start())
        .map(|s| s.strip_prefix(';').unwrap_or(s))
        .map(|s| s.trim())
        .unwrap_or(trimmed);

    if expr.is_empty() {
        return Ok("int main(int argc, char* argv[]) { return 0; }".to_string());
    }

    let mut parser = Parser::new(expr);
    let stmts = parser.parse()?;
    Ok(codegen(&stmts))
}

#[cfg(test)]
mod tests {
    use super::*;

    static mut FILE_COUNTER: u64 = 0;

    fn get_unique_id() -> u64 {
        unsafe {
            FILE_COUNTER += 1;
            FILE_COUNTER
        }
    }

    fn expect_valid(tuff_source: &str, args: Vec<String>, expected_exit_code: i32) {
        let mut tuff_source_with_prelude = String::from("in let args : &[&Str]; ");
        tuff_source_with_prelude.push_str(tuff_source);

        let generated_result = compile_tuff_to_c(tuff_source_with_prelude.as_str());
        if let Err(generation_error) = generated_result {
            panic!("Failed to compile: '{}'", generation_error)
        }
        let generated_c = generated_result.unwrap();

        // Write C to temp file, compile, and run
        let temp_dir = std::env::temp_dir();
        let id = get_unique_id();
        let c_path = temp_dir.join(format!("tuff_{}.c", id));
        let exe_path = temp_dir.join(format!("tuff_{}.exe", id));

        std::fs::write(&c_path, &generated_c).unwrap();

        let compile = std::process::Command::new("clang")
            .args(&[c_path.to_str().unwrap(), "-o", exe_path.to_str().unwrap()])
            .output()
            .expect("failed to execute clang");
        if !compile.status.success() {
            panic!(
                "C compilation failed: {}\nGenerated C: '{}'",
                String::from_utf8_lossy(&compile.stderr),
                generated_c
            )
        }

        let mut cmd = std::process::Command::new(exe_path);
        for arg in args {
            cmd.arg(arg);
        }
        let output = cmd.output().expect("failed to execute executable");
        let actual_exit_code = output.status.code().unwrap_or(-1);

        if expected_exit_code != actual_exit_code {
            panic!(
                "Expected exit code {} but was actually {}. Generated: '{}'",
                expected_exit_code, actual_exit_code, generated_c
            )
        }
    }

    fn expect_invalid(_tuff_source: &str) {
        let result = compile_tuff_to_c(_tuff_source);
        if let Ok(generated_c) = result {
            panic!(
                "Expected compiler to fail, but generated: '{}'",
                generated_c
            )
        }
    }

    #[test]
    fn test_empty_source() {
        expect_valid("", vec![], 0);
    }

    #[test]
    fn test_returns_one() {
        expect_valid("1", vec![], 1);
    }

    #[test]
    fn test_args_length() {
        expect_valid("args.length", vec![], 1);
    }

    #[test]
    fn test_args_length_with_arg() {
        expect_valid("args.length", vec!["foo".to_string()], 2);
    }

    #[test]
    fn test_args_length_plus_one() {
        expect_valid("args.length + 1", vec!["foo".to_string()], 3);
    }

    #[test]
    fn test_args_length_doubled() {
        expect_valid("args.length + args.length", vec!["foo".to_string()], 4);
    }

    #[test]
    fn test_hash_invalid() {
        expect_invalid("#");
    }

    #[test]
    fn test_let_variable() {
        expect_valid("let x = args.length; x", vec!["foo".to_string()], 2);
    }

    #[test]
    fn test_let_variable_doubled() {
        expect_valid("let x = args.length; x + x", vec!["foo".to_string()], 4);
    }
}
