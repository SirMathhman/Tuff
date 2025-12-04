// Error Reporting System

use std::fmt;

#[derive(Debug, Clone)]
pub struct Span {
    pub filename: String,
    pub line: usize,
    pub column: usize,
    pub length: usize,
}

impl Span {
    pub fn new(filename: impl Into<String>, line: usize, column: usize, length: usize) -> Self {
        Span {
            filename: filename.into(),
            line,
            column,
            length,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum ErrorKind {
    // Syntax errors
    UnexpectedToken { expected: String, found: String },
    UnexpectedEndOfInput,
    InvalidLiteral(String),
    MalformedExpression(String),

    // Type errors
    TypeMismatch { expected: String, found: String },
    UndefinedType(String),
    GenericMismatch { expected: usize, found: usize },
    TraitNotImplemented { trait_name: String, type_name: String },

    // Borrow errors
    CannotBorrowMutableTwice(String),
    CannotBorrowWhileBorrowed(String),
    CannotMoveWhileBorrowed(String),
    InvalidBorrowScope(String),
    ReferenceOutlivesValue(String),

    // Name resolution errors
    UndefinedVariable(String),
    UndefinedFunction(String),
    DuplicateDefinition(String),
    NotInScope(String),

    // Other errors
    InvalidOperator(String),
    InvalidPattern(String),
    UnreachableCode(String),
}

#[derive(Debug, Clone)]
pub struct CompileError {
    pub kind: ErrorKind,
    pub span: Span,
    pub message: String,
    pub fix: Option<String>,
}

impl CompileError {
    pub fn new(kind: ErrorKind, span: Span, message: impl Into<String>) -> Self {
        CompileError {
            kind,
            span,
            message: message.into(),
            fix: None,
        }
    }

    pub fn with_fix(mut self, fix: impl Into<String>) -> Self {
        self.fix = Some(fix.into());
        self
    }

    pub fn error_code(&self) -> String {
        match &self.kind {
            ErrorKind::UnexpectedToken { .. } => "E0030".to_string(),
            ErrorKind::UnexpectedEndOfInput => "E0031".to_string(),
            ErrorKind::InvalidLiteral(_) => "E0032".to_string(),
            ErrorKind::MalformedExpression(_) => "E0033".to_string(),
            ErrorKind::TypeMismatch { .. } => "E0001".to_string(),
            ErrorKind::UndefinedType(_) => "E0002".to_string(),
            ErrorKind::GenericMismatch { .. } => "E0003".to_string(),
            ErrorKind::TraitNotImplemented { .. } => "E0004".to_string(),
            ErrorKind::CannotBorrowMutableTwice(_) => "E0020".to_string(),
            ErrorKind::CannotBorrowWhileBorrowed(_) => "E0021".to_string(),
            ErrorKind::CannotMoveWhileBorrowed(_) => "E0022".to_string(),
            ErrorKind::InvalidBorrowScope(_) => "E0023".to_string(),
            ErrorKind::ReferenceOutlivesValue(_) => "E0024".to_string(),
            ErrorKind::UndefinedVariable(_) => "E0010".to_string(),
            ErrorKind::UndefinedFunction(_) => "E0011".to_string(),
            ErrorKind::DuplicateDefinition(_) => "E0012".to_string(),
            ErrorKind::NotInScope(_) => "E0013".to_string(),
            ErrorKind::InvalidOperator(_) => "E0040".to_string(),
            ErrorKind::InvalidPattern(_) => "E0041".to_string(),
            ErrorKind::UnreachableCode(_) => "E0042".to_string(),
        }
    }
}

impl fmt::Display for CompileError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        let code = self.error_code();
        writeln!(f, "error[{}]: {}", code, self.message)?;
        writeln!(
            f,
            " --> {}:{}:{}",
            self.span.filename, self.span.line, self.span.column
        )?;
        if let Some(ref fix) = self.fix {
            writeln!(f, "note: {}", fix)?;
        }
        Ok(())
    }
}

pub struct ErrorCollector {
    pub errors: Vec<CompileError>,
}

impl ErrorCollector {
    pub fn new() -> Self {
        ErrorCollector {
            errors: Vec::new(),
        }
    }

    pub fn add_error(&mut self, error: CompileError) {
        self.errors.push(error);
    }

    pub fn report(&self) {
        for error in &self.errors {
            println!("{}", error);
        }
    }

    pub fn has_errors(&self) -> bool {
        !self.errors.is_empty()
    }

    pub fn error_count(&self) -> usize {
        self.errors.len()
    }
}

impl Default for ErrorCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_code_type_mismatch() {
        let error = CompileError::new(
            ErrorKind::TypeMismatch {
                expected: "i32".to_string(),
                found: "bool".to_string(),
            },
            Span::new("test.tuff", 5, 10, 4),
            "type mismatch",
        );
        assert_eq!(error.error_code(), "E0001");
    }

    #[test]
    fn test_error_code_undefined_variable() {
        let error = CompileError::new(
            ErrorKind::UndefinedVariable("x".to_string()),
            Span::new("test.tuff", 3, 5, 1),
            "variable not found",
        );
        assert_eq!(error.error_code(), "E0010");
    }

    #[test]
    fn test_error_with_fix() {
        let error = CompileError::new(
            ErrorKind::TypeMismatch {
                expected: "i32".to_string(),
                found: "bool".to_string(),
            },
            Span::new("test.tuff", 5, 10, 4),
            "type mismatch",
        )
        .with_fix("Try converting to i32");
        
        assert!(error.fix.is_some());
        assert_eq!(error.fix.unwrap(), "Try converting to i32");
    }

    #[test]
    fn test_error_collector() {
        let mut collector = ErrorCollector::new();
        assert_eq!(collector.error_count(), 0);
        assert!(!collector.has_errors());

        collector.add_error(CompileError::new(
            ErrorKind::UndefinedVariable("x".to_string()),
            Span::new("test.tuff", 1, 1, 1),
            "error",
        ));

        assert_eq!(collector.error_count(), 1);
        assert!(collector.has_errors());
    }
}
