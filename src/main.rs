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
    Dot,
    LBracket,
    RBracket,
    Semicolon,
    Hash,
    Eq,
    Invalid(char),
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
            '=' => {
                self.pos += 1;
                Token::Eq
            }
            ';' => {
                self.pos += 1;
                Token::Semicolon
            }
            '#' => {
                self.pos += 1;
                Token::Hash
            }
            '.' => {
                self.pos += 1;
                Token::Dot
            }
            '[' => {
                self.pos += 1;
                Token::LBracket
            }
            ']' => {
                self.pos += 1;
                Token::RBracket
            }
            c if c.is_ascii_digit() => self.parse_num(),
            c if c == '_' || c.is_ascii_alphabetic() => self.parse_ident(),
            c => {
                self.pos += 1;
                Token::Invalid(c)
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
            && (self.chars[self.pos].is_ascii_alphanumeric() || self.chars[self.pos] == '_')
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
    Args,
    BinOp(Box<Expr>, Box<Expr>),
    PropertyAccess(Box<Expr>, String),
    Index(Box<Expr>, Box<Expr>),
}

#[derive(Debug)]
enum Stmt {
    Let(String, bool, Expr),
    Expr(Expr),
    Assign(String, Expr),
}

// --- Parser ---

struct Parser {
    tokens: Vec<Token>,
    pos: usize,
    scope: std::collections::HashSet<String>,
    mutable_vars: std::collections::HashSet<String>,
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
        Self {
            tokens,
            pos: 0,
            scope: std::collections::HashSet::new(),
            mutable_vars: std::collections::HashSet::new(),
        }
    }

    fn parse(&mut self) -> Result<Vec<Stmt>, CompileError> {
        let mut stmts = Vec::new();
        while self.current() != Token::Eof {
            if self.current() == Token::Hash {
                self.pos += 1;
                return Err(CompileError { message: "invalid token '#'".to_string() });
            }
            if let Token::Invalid(c) = self.current() {
                self.pos += 1;
                return Err(CompileError { message: format!("invalid token '{}'", c) });
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
            // Check for assignment: identifier = expr
            if self.tokens.get(self.pos + 1) == Some(&Token::Eq) && self.scope.contains(s) {
                let name = s.clone();
                if !self.mutable_vars.contains(&name) {
                    return Err(CompileError { message: format!("cannot assign to immutable variable '{}'", name) });
                }
                self.pos += 1; // consume identifier
                self.pos += 1; // consume '='
                let value = self.parse_expr()?;
                if self.current() == Token::Semicolon {
                    self.pos += 1;
                }
                return Ok(Stmt::Assign(name, value));
            }
        }
        Ok(Stmt::Expr(self.parse_expr()?))
    }

    fn parse_let(&mut self) -> Result<Stmt, CompileError> {
        // consume "let"
        self.pos += 1;
        // Check for "mut" keyword
        let is_mut = if let Token::Ident(ref s) = self.current() {
            if s == "mut" {
                self.pos += 1;
                true
            } else {
                false
            }
        } else {
            false
        };
        let name = match self.current() {
            Token::Ident(ref s) => s.clone(),
            _ => return Err(CompileError { message: "expected identifier after 'let'".to_string() }),
        };
        self.pos += 1;
        // consume '='
        self.pos += 1;
        let value = self.parse_expr()?;
        // Add variable to scope after parsing its value
        self.scope.insert(name.clone());
        if is_mut {
            self.mutable_vars.insert(name.clone());
        }
        // consume ';'
        if self.current() == Token::Semicolon {
            self.pos += 1;
        }
        Ok(Stmt::Let(name, is_mut, value))
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
        let base = match self.current() {
            Token::Num(n) => {
                self.pos += 1;
                Expr::Num(n)
            }
            Token::Ident(ref s) => {
                self.pos += 1;
                if s == "args" {
                    // Check if next token is Dot followed by "length"
                    if self.current() == Token::Dot {
                        self.pos += 1; // consume dot
                        self.pos += 1; // consume "length"
                        return Ok(Expr::ArgsLength);
                    } else {
                        Expr::Args
                    }
                } else {
                    // Check if the variable is in scope
                    if !self.scope.contains(s) {
                        return Err(CompileError { message: format!("undefined identifier '{}'", s) });
                    }
                    // Check if this is followed by .length
                    let var_name = s.clone();
                    if self.current() == Token::Dot {
                        self.pos += 1; // consume dot
                        self.pos += 1; // consume "length"
                        return Ok(Expr::PropertyAccess(
                            Box::new(Expr::Var(var_name)),
                            "length".to_string(),
                        ));
                    } else {
                        Expr::Var(var_name)
                    }
                }
            }
            Token::Hash => {
                self.pos += 1;
                return Err(CompileError { message: "invalid token '#'".to_string() });
            }
            _ => return Err(CompileError { message: "unexpected token".to_string() }),
        };
        // Handle indexing: args[1]
        if self.current() == Token::LBracket {
            self.pos += 1; // consume [
            let index = self.parse_expr()?;
            if self.current() == Token::RBracket {
                self.pos += 1; // consume ]
                let indexed = Expr::Index(Box::new(base), Box::new(index));
                // Handle .length after index: args[1].length
                if self.current() == Token::Dot {
                    self.pos += 1; // consume dot
                    self.pos += 1; // consume "length"
                    return Ok(Expr::PropertyAccess(
                        Box::new(indexed),
                        "length".to_string(),
                    ));
                }
                return Ok(indexed);
            }
            return Err(CompileError { message: "expected ']'".to_string() });
        }
        Ok(base)
    }

    fn current(&self) -> Token {
        self.tokens.get(self.pos).unwrap_or(&Token::Eof).clone()
    }
}

// --- Code Generator ---

fn codegen(stmts: &[Stmt]) -> String {
    let mut buf = String::from("#include <string.h>\nint main(int argc, char* argv[]) {");
    // Track which variables hold args (so .length on them resolves to the var itself)
    let mut args_vars: std::collections::HashSet<String> = std::collections::HashSet::new();
    // Track which variables hold args[index] (so .length generates strlen(argv[index]))
    let mut args_index_vars: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    // Track which variables have already been declared (for reassignment support)
    let mut declared_vars: std::collections::HashSet<String> = std::collections::HashSet::new();
    for stmt in stmts {
        match stmt {
            Stmt::Let(name, _is_mut, value) => {
                if is_args_expr(value) {
                    args_vars.insert(name.clone());
                }
                if is_args_index(value) {
                    let idx_str = get_index_str(value);
                    args_index_vars.insert(name.clone(), idx_str);
                    // Skip generating int declaration for args[index] vars (argv[i] is char*, not int)
                    continue;
                }
                let is_reassign = declared_vars.contains(name);
                declared_vars.insert(name.clone());
                if is_reassign {
                    buf.push_str(&format!(
                        " {} = {};",
                        name,
                        codegen_expr_with_args_vars(value, &args_vars, &args_index_vars)
                    ));
                } else {
                    buf.push_str(&format!(
                        " int {} = {};",
                        name,
                        codegen_expr_with_args_vars(value, &args_vars, &args_index_vars)
                    ));
                }
            }
            Stmt::Expr(expr) => {
                buf.push_str(&format!(
                    " return {};",
                    codegen_expr_with_args_vars(expr, &args_vars, &args_index_vars)
                ));
            }
            Stmt::Assign(name, value) => {
                buf.push_str(&format!(
                    " {} = {};",
                    name,
                    codegen_expr_with_args_vars(value, &args_vars, &args_index_vars)
                ));
            }
        }
    }
    buf.push('}');
    buf
}

fn is_args_expr(expr: &Expr) -> bool {
    match expr {
        Expr::Args | Expr::ArgsLength => true,
        _ => false,
    }
}

fn is_args_index(expr: &Expr) -> bool {
    match expr {
        Expr::Index(target, _) => matches!(target.as_ref(), Expr::Args),
        _ => false,
    }
}

fn get_index_str(expr: &Expr) -> String {
    if let Expr::Index(_, idx) = expr {
        codegen_expr(idx)
    } else {
        "0".to_string()
    }
}

fn codegen_expr(expr: &Expr) -> String {
    match expr {
        Expr::Num(n) => n.to_string(),
        Expr::Var(name) => name.clone(),
        _ => "0".to_string(),
    }
}

fn codegen_expr_with_args_vars(
    expr: &Expr,
    args_vars: &std::collections::HashSet<String>,
    args_index_vars: &std::collections::HashMap<String, String>,
) -> String {
    match expr {
        Expr::Num(n) => n.to_string(),
        Expr::Var(name) => name.clone(),
        Expr::ArgsLength => "argc".to_string(),
        Expr::Args => "argc".to_string(),
        Expr::BinOp(left, right) => {
            format!(
                "{} + {}",
                codegen_expr_with_args_vars(left, args_vars, args_index_vars),
                codegen_expr_with_args_vars(right, args_vars, args_index_vars)
            )
        }
        Expr::PropertyAccess(target, prop) => {
            if prop == "length" {
                // If target is a var that holds args, just return the var (argc)
                if let Expr::Var(name) = target.as_ref() {
                    if args_vars.contains(name) {
                        return name.clone();
                    }
                    // If target is a var that holds args[index], generate strlen(argv[index])
                    if let Some(idx_str) = args_index_vars.get(name) {
                        return format!("strlen(argv[{}])", idx_str);
                    }
                }
                // If target is args[index], generate strlen(argv[index])
                if is_args_index(target) {
                    if let Expr::Index(_, idx) = target.as_ref() {
                        let idx_str = codegen_expr_with_args_vars(idx, args_vars, args_index_vars);
                        return format!("strlen(argv[{}])", idx_str);
                    }
                }
                codegen_expr_with_args_vars(target, args_vars, args_index_vars)
            } else {
                format!(
                    "{}.{}",
                    codegen_expr_with_args_vars(target, args_vars, args_index_vars),
                    prop
                )
            }
        }
        Expr::Index(target, index) => {
            // args[n] -> argv[n]
            if matches!(target.as_ref(), Expr::Args) {
                return format!("argv[{}]", codegen_expr_with_args_vars(index, args_vars, args_index_vars));
            }
            // If target is a var that holds args[index], generate argv[index][sub_index]
            if let Expr::Var(name) = target.as_ref() {
                if let Some(idx_str) = args_index_vars.get(name) {
                    let sub_idx = codegen_expr_with_args_vars(index, args_vars, args_index_vars);
                    return format!("argv[{}][{}]", idx_str, sub_idx);
                }
            }
            format!(
                "{}[{}]",
                codegen_expr_with_args_vars(target, args_vars, args_index_vars),
                codegen_expr_with_args_vars(index, args_vars, args_index_vars)
            )
        }
    }
}

// --- Compiler Entry ---

#[derive(Debug)]
struct CompileError {
    message: String,
}

impl std::fmt::Display for CompileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "compile error: {}", self.message)
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

    #[test]
    fn test_let_args_index_length() {
        expect_valid("let x = args; let arg = args[1]; arg.length", vec!["foo".to_string()], 3);
    }

    #[test]
    fn test_let_args_length_property() {
        expect_valid("let x = args; x.length", vec![], 1);
    }

    #[test]
    fn test_args_index_length() {
        expect_valid("let x = args; args[1].length", vec!["foo".to_string()], 3);
    }

    #[test]
    fn test_let_args_index_nested() {
        expect_valid("let x = args; let arg = args[1]; arg[0]", vec!["apple".to_string()], 97);
    }

    #[test]
    fn test_let_args_index_chained() {
        expect_valid("let x = args; let arg = args[1]; let c = arg[0]; c", vec!["apple".to_string()], 97);
    }

    #[test]
    fn test_variable_reassignment() {
        expect_valid("let x = 0; let x = 1; x", vec![], 1);
    }

    #[test]
    fn test_undefined_identifier() {
        expect_invalid("undefinedIdentifier");
    }

    #[test]
    fn test_at_sign_invalid() {
        expect_invalid("@");
    }

    #[test]
    fn test_comma_invalid() {
        expect_invalid(",");
    }

    #[test]
    fn test_multiple_invalid_chars() {
        expect_invalid("@#%@#$!@");
    }

    #[test]
    fn test_let_mut_with_assignment() {
        expect_valid("let mut x = 0; x = 1; x", vec![], 1);
    }

    #[test]
    fn test_non_mut_assignment_error() {
        expect_invalid("let x = 0; x = 1; x");
    }
}
