use std::collections::HashMap;

/// Runtime value — integer, range (for `let r = 0..4`), or function body token span.
#[derive(Debug, Clone)]
pub enum Value {
    Int(i64),
    Range {
        start: i64,
        end: i64,
    },
    FunctionBody {
        begin: usize,
        params: Vec<String>,
        param_types: Vec<Option<u32>>,
        ret_type_width: Option<u32>,
    },
}

impl Value {
    /// Extract integer value (returns 0 on non-Int — callers guard with type).
    #[cfg_attr(coverage_nightly, coverage(off))] // defensive branch unreachable with current callers
    pub fn as_int(&self) -> i64 {
        match self {
            Value::Int(v) => *v,
            _ => 0, // unreachable when guarded
        }
    }

    /// Extract function return type width if this is a FunctionBody.
    #[allow(dead_code)]
    #[cfg_attr(coverage_nightly, coverage(off))] // defensive branch unreachable with current callers
    pub fn as_fn_ret_type_width(&self) -> Option<u32> {
        match self {
            Value::FunctionBody {
                ret_type_width: Some(w),
                ..
            } => Some(*w),
            _ => None,
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
pub struct Scope {
    frames: Vec<ScopeFrame>,
    /// When true, a `return` was triggered and the current function call should terminate immediately.
    returned: bool,
    /// The value that was returned (used when propagating return through nested blocks).
    return_value: i64,
}

impl Scope {
    pub fn new() -> Self {
        Scope {
            frames: vec![ScopeFrame::new()],
            returned: false,
            return_value: 0,
        }
    }

    /// Push a new local scope (for blocks).
    pub fn push(&mut self) {
        self.frames.push(ScopeFrame::new());
    }

    /// Pop the innermost scope.
    pub fn pop(&mut self) {
        if self.frames.len() > 1 {
            self.frames.pop();
        }
    }

    /// Look up a variable from innermost to outermost scope.
    pub fn get(&self, name: &str) -> Option<&(Value, bool, Option<VarTypeWidth>)> {
        self.frames.iter().rev().find_map(|frame| frame.get(name))
    }

    /// Look up range bounds if the variable holds a Range value.
    pub fn get_range(&self, name: &str) -> Option<(i64, i64)> {
        let entry = self.frames.iter().rev().find_map(|frame| frame.get(name))?;
        match entry.0 {
            Value::Range { start, end } => Some((start, end)),
            _ => None,
        }
    }

    /// Check if a variable exists in any scope level.
    pub fn contains_key(&self, name: &str) -> bool {
        self.frames.iter().any(|frame| frame.contains_key(name))
    }

    /// Mark that a return was triggered with the given value.
    pub fn mark_returned_with_value(&mut self, val: i64) {
        self.returned = true;
        self.return_value = val;
    }

    /// Check if a return was triggered.
    pub fn is_returned(&self) -> bool {
        self.returned
    }

    /// Get the return value (only meaningful when is_returned() is true).
    pub fn get_return_value(&self) -> i64 {
        self.return_value
    }

    /// Reset the returned flag and value (called after each function call completes).
    pub fn clear_returned(&mut self) {
        self.returned = false;
        self.return_value = 0;
    }

    /// Look up function body token span + param names + param types for `name` (innermost first).
    pub fn get_fn_body(&self, name: &str) -> Option<(usize, Vec<String>, Vec<Option<u32>>)> {
        let entry = self.frames.iter().rev().find_map(|frame| frame.get(name))?;
        match &entry.0 {
            Value::FunctionBody {
                begin,
                params,
                param_types,
                ..
            } => Some((*begin, params.clone(), param_types.clone())),
            _ => None,
        }
    }

    /// Get mutable access to the innermost (last) scope frame.
    pub fn last_frame_mut(&mut self) -> Option<&mut ScopeFrame> {
        self.frames.last_mut()
    }

    /// Find and return mutable reference to the innermost frame containing `name`.
    pub fn find_frame_mut(&mut self, name: &str) -> Option<&mut ScopeFrame> {
        self.frames.iter_mut().rev().find(|f| f.contains_key(name))
    }

    /// Insert a value into the outermost (global) scope frame.
    pub fn insert_global(&mut self, name: String, entry: (Value, bool, Option<VarTypeWidth>)) {
        if !self.frames.is_empty() {
            self.frames[0].insert(name, entry);
        }
    }

    /// Check if the global frame is non-empty.
    pub fn has_global_frame(&self) -> bool {
        !self.frames.is_empty()
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
        Some(u32::MAX)
    } else {
        digits.parse::<u32>().ok().or(Some(u32::MAX))
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
        // Boolean literals get the same width as "Bool" (u32::MAX)
        if tok == "true" || tok == "false" {
            return Some(u32::MAX);
        }
        if let Some(sfx) = extract_suffix(tok) {
            return type_width(sfx);
        }
    }
    None
}

/// Consume a trailing semicolon token (if present).
pub fn consume_semicolon(pos: &mut usize, tokens: &[String]) {
    if *pos < tokens.len() && tokens[*pos] == ";" {
        *pos += 1;
    }
}

/// Handle `is TYPE` type-check operator after evaluating a factor.
/// Returns Some(result) when "is" is found and consumed, None otherwise.
pub fn try_is_type_check(pos: &mut usize, tokens: &[String], val_tw: Option<u32>) -> Option<i64> {
    if *pos < tokens.len() && tokens[*pos] == "is" {
        *pos += 1; // skip "is"
        let target = type_width(&tokens[*pos]).unwrap_or(0);
        *pos += 1; // skip target type token
        Some(if val_tw.map(|w| w <= target).unwrap_or(true) {
            1
        } else {
            0
        })
    } else {
        None
    }
}
