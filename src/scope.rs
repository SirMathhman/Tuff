use std::collections::HashMap;

/// Runtime value — integer or range (for `let r = 0..4` semantics).
#[derive(Debug, Clone, Copy)]
pub enum Value {
    Int(i64),
    Range { start: i64, end: i64 },
}

impl Value {
    /// Extract integer value (returns 0 on Range — callers guard with type).
    #[cfg_attr(coverage_nightly, coverage(off))] // defensive branch unreachable with current callers
    pub fn as_int(&self) -> i64 {
        match self {
            Value::Int(v) => *v,
            _ => 0, // unreachable when guarded
        }
    }
}

#[derive(Debug)]
pub enum ParseError {
    UnexpectedEndOfInput,
    MissingVariableName,
    MissingEqualsSign,
    ImmutableReassignment(String),
    UnknownIdentifier(String),
    MaxIterationsExceeded,
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ParseError::UnexpectedEndOfInput => write!(f, "unexpected end of input"),
            ParseError::MissingVariableName => write!(f, "missing variable name after 'let'"),
            ParseError::MissingEqualsSign => write!(f, "expected '=' after variable name"),
            ParseError::ImmutableReassignment(name) => {
                write!(f, "cannot reassign immutable variable '{}'", name)
            }
            ParseError::UnknownIdentifier(name) => {
                write!(f, "unknown identifier '{}'", name)
            }
            ParseError::MaxIterationsExceeded => {
                write!(f, "max loop iterations (1024) exceeded")
            }
        }
    }
}

/// Type width for a variable: 0 means untyped/plain integer.
pub type VarTypeWidth = u32;

type ScopeFrame = HashMap<String, (Value, bool, Option<VarTypeWidth>)>;

/// Nested scope stack — innermost frame is last element.
pub struct Scope(Vec<ScopeFrame>);

impl Scope {
    pub fn new() -> Self {
        Scope(vec![ScopeFrame::new()])
    }

    /// Push a new local scope (for blocks).
    pub fn push(&mut self) {
        self.0.push(ScopeFrame::new());
    }

    /// Pop the innermost scope.
    pub fn pop(&mut self) {
        if self.0.len() > 1 {
            self.0.pop();
        }
    }

    /// Look up a variable from innermost to outermost scope.
    /// Look up a variable from innermost to outermost scope.
    pub fn get(&self, name: &str) -> Option<&(Value, bool, Option<VarTypeWidth>)> {
        self.0.iter().rev().find_map(|frame| frame.get(name))
    }

    /// Look up range bounds if the variable holds a Range value.
    pub fn get_range(&self, name: &str) -> Option<(i64, i64)> {
        let entry = self.0.iter().rev().find_map(|frame| frame.get(name))?;
        match entry.0 {
            Value::Range { start, end } => Some((start, end)),
            _ => None,
        }
    }

    /// Check if a variable exists in any scope level.
    pub fn contains_key(&self, name: &str) -> bool {
        self.0.iter().any(|frame| frame.contains_key(name))
    }

    /// Get mutable access to the innermost (last) scope frame.
    pub fn last_frame_mut(&mut self) -> Option<&mut ScopeFrame> {
        self.0.last_mut()
    }

    /// Find and return mutable reference to the innermost frame containing `name`.
    pub fn find_frame_mut(&mut self, name: &str) -> Option<&mut ScopeFrame> {
        self.0.iter_mut().rev().find(|f| f.contains_key(name))
    }
}

pub fn extract_int(s: &str) -> Option<i64> {
    let mut end = s.len();
    for (i, c) in s.char_indices() {
        if c.is_ascii_uppercase() {
            end = i;
            break;
        }
    }
    (&s[..end]).parse::<i64>().ok()
}

pub fn extract_suffix(s: &str) -> Option<&str> {
    for (i, c) in s.char_indices() {
        if c.is_ascii_uppercase() {
            return Some(&s[i..]);
        }
    }
    None
}

/// Type width for a type token: "U8" -> Some(8), "U16" -> Some(16), "U" -> Some(0).
pub fn type_width(t: &str) -> Option<u32> {
    let digits = t
        .chars()
        .skip_while(|c| c.is_ascii_uppercase())
        .collect::<String>();
    if digits.is_empty() {
        Some(0)
    } else {
        digits.parse::<u32>().ok()
    }
}

/// Check that the RHS type fits within the declared type width.
#[cfg_attr(coverage_nightly, coverage(off))] // llvm-cov attribution issues with closures in callers
pub fn check_type(
    dt: &str,
    rt: Option<&String>,
    rhs_var_width: Option<u32>,
) -> Result<(), ParseError> {
    let dw = type_width(dt).unwrap_or(0);

    if let Some(var_w) = rhs_var_width {
        return if var_w > dw {
            Err(ParseError::UnexpectedEndOfInput)
        } else {
            Ok(())
        };
    }

    match rt {
        Some(tok) => {
            if let Some(sfx) = extract_suffix(tok.as_str()) {
                if type_width(sfx).unwrap_or(0) > dw {
                    return Err(ParseError::UnexpectedEndOfInput);
                } else {
                    return Ok(());
                }
            }
            if extract_int(tok.as_str()).is_some() {
                return Err(ParseError::UnexpectedEndOfInput);
            }
        }
        None => {}
    }
    Ok(())
}

/// Infer the type width for a let-binding from declared type or RHS suffix.
#[cfg_attr(coverage_nightly, coverage(off))] // llvm-cov attribution issues with closures in callers
pub fn infer_type(declared: Option<&String>, rhs_tok: Option<&String>) -> Option<u32> {
    if let Some(dt) = declared {
        if let Some(w) = type_width(dt) {
            return Some(w);
        }
    }
    if let Some(tok) = rhs_tok {
        if let Some(sfx) = extract_suffix(tok) {
            return type_width(sfx);
        }
    }
    None
}
