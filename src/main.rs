use std::collections::HashMap;
#[cfg(not(test))]
use std::io::{self, BufRead, Write};

// --- Simple recursive-descent parser ---
// Program   -> Statement* Expr
// Block     -> '{' Statement* Expr '}'
// Statement -> 'let' ['mut'] IDENT '=' Expr ';'
//            | 'fn' IDENT '(' [IDENT (',' IDENT)*] ')' '=>' Expr ';'
//            | IDENT ('+'|'-'|'*'|'/')? '=' Expr ';'
//            | 'while' CONDITION body
//            | 'if' CONDITION body ['else' body]
// Expr   -> Term (('+' | '-') Term)*
// Term   -> Factor (('*' | '/') Factor)*
// Factor -> '(' Expr ')' | Block | StructLiteral '.' IDENT | ArrayLiteral ['[' Expr ']']
//         | IDENT ('.' IDENT | '[' Expr ']')* | Identifier | Number
// StructLiteral -> '{' IDENT ':' Expr (',' IDENT ':' Expr)* '}'
// ArrayLiteral  -> '[' [Expr (',' Expr)*] ']'
// Identifier -> letter+digit*
// Number -> digit+

/// Scoped environment: innermost scope is the last entry.
#[derive(Default)]
struct Env {
    /// Each entry stores (value, is_mutable, type_name_or_none).
    scopes: Vec<HashMap<String, (i64, bool, Option<&'static str>)>>,
    /// Parallel scopes for struct-typed variables: field_name -> value.
    structs: Vec<HashMap<String, HashMap<String, i64>>>,
    /// Parallel scopes for array-typed variables: index -> value.
    arrays: Vec<HashMap<String, Vec<i64>>>,
    /// Function name -> (parameter names, body expression bytes to re-parse on each call).
    functions: HashMap<String, (Vec<String>, Vec<u8>)>,
    /// Queue of zero-param function bodies deferred for execution after all fns are registered.
    deferred_bodies: Vec<Vec<u8>>,
    /// Temporary holder for a struct literal parsed in an expression context where we don't yet know the variable name.
    pending_struct: Option<HashMap<String, i64>>,
    /// Temporary holder for an array literal parsed in an expression context where we don't yet know the variable name.
    pending_array: Option<Vec<i64>>,
    /// Registry of anonymous (nested) structs by index. Negative field values reference these.
    anonymous_structs: Vec<HashMap<String, i64>>,
    /// Registry of anonymous (nested) arrays by index. Negative array element values reference these.
    anonymous_arrays: Vec<Vec<i64>>,
    /// Type suffix parsed on the most recent number literal (for `is` type checks).
    pending_type: Option<&'static str>,
}

impl Env {
    fn new() -> Self {
        Self {
            scopes: vec![HashMap::new()],
            structs: vec![HashMap::new()],
            arrays: vec![HashMap::new()],
            functions: HashMap::new(),
            deferred_bodies: Vec::new(),
            pending_struct: None,
            pending_array: None,
            anonymous_structs: Vec::new(),
            anonymous_arrays: Vec::new(),
            pending_type: None,
        }
    }

    /// Lookup a variable from innermost to outermost scope.
    fn get(&self, name: &str) -> Option<i64> {
        self.scopes
            .iter()
            .rev()
            .find_map(|scope| scope.get(name).map(|(v, _, _)| *v))
    }

    /// Lookup the type of a variable from innermost to outermost scope.
    fn get_type(&self, name: &str) -> Option<Option<&'static str>> {
        self.scopes
            .iter()
            .rev()
            .find_map(|scope| scope.get(name).map(|(_, _, t)| *t))
    }

    /// Update a variable in any scope (for assignment).
    fn update(&mut self, name: &str, val: i64) -> Result<(), String> {
        for scope in self.scopes.iter_mut().rev() {
            if let Some((v, mutable, type_name)) = scope.get_mut(name) {
                if !*mutable {
                    return Err(format!("cannot assign to immutable variable: {}", name));
                }
                *v = val;
                // Update type from pending_type if set
                if let Some(t) = self.pending_type.take() {
                    *type_name = Some(t);
                }
                return Ok(());
            }
        }
        Err(format!("undefined variable: {}", name))
    }

    /// Insert into the current (innermost) scope.
    fn insert(&mut self, name: String, val: i64, mutable: bool, type_name: Option<&'static str>) {
        if let Some(scope) = self.scopes.last_mut() {
            scope.insert(name, (val, mutable, type_name));
        }
    }

    /// Enter a new scope.
    fn enter_scope(&mut self) {
        self.scopes.push(HashMap::new());
        self.structs.push(HashMap::new());
        self.arrays.push(HashMap::new());
    }

    /// Exit the current scope.
    fn exit_scope(&mut self) {
        if self.scopes.len() > 1 {
            self.scopes.pop();
            self.structs.pop();
            self.arrays.pop();
        }
    }

    /// Insert a struct value into the innermost scope.
    fn insert_struct(&mut self, name: String, fields: HashMap<String, i64>, mutable: bool) {
        if let Some(scope) = self.scopes.last_mut() {
            // Store sentinel 0 for the plain value; real data lives in structs map.
            scope.insert(name.clone(), (0, mutable, None));
        }
        if let Some(sstructs_scope) = self.structs.last_mut() {
            sstructs_scope.insert(name, fields);
        }
    }

    /// Lookup a struct from innermost to outermost scope.
    fn get_struct(&self, name: &str) -> Option<&HashMap<String, i64>> {
        self.structs.iter().rev().find_map(|scope| scope.get(name))
    }

    /// Insert an array value into the innermost scope.
    fn insert_array(&mut self, name: String, elements: Vec<i64>, mutable: bool) {
        if let Some(scope) = self.scopes.last_mut() {
            // Store sentinel 0 for the plain value; real data lives in arrays map.
            scope.insert(name.clone(), (0, mutable, None));
        }
        if let Some(arrays_scope) = self.arrays.last_mut() {
            arrays_scope.insert(name, elements);
        }
    }

    /// Lookup an array from innermost to outermost scope.
    fn get_array(&self, name: &str) -> Option<&Vec<i64>> {
        self.arrays.iter().rev().find_map(|scope| scope.get(name))
    }

    /// Register an anonymous (nested) struct and return its negative ID.
    fn register_anonymous_struct(&mut self, fields: HashMap<String, i64>) -> i64 {
        let id = -(self.anonymous_structs.len() as i64 + 1);
        self.anonymous_structs.push(fields);
        id
    }

    /// Resolve a value that might be an anonymous struct ID into its fields map.
    fn resolve_anonymous(&self, val: i64) -> Option<&HashMap<String, i64>> {
        if val < 0 {
            let idx = (-val - 1) as usize;
            self.anonymous_structs.get(idx)
        } else {
            None
        }
    }

    /// Register an anonymous (nested) array and return its negative ID.
    fn register_anonymous_array(&mut self, elements: Vec<i64>) -> i64 {
        let id = -(self.anonymous_arrays.len() as i64 + 1);
        self.anonymous_arrays.push(elements);
        id
    }

    /// Update an element at a given index in an array variable.
    fn update_array_element(&mut self, name: &str, idx: i64, val: i64) -> Result<(), String> {
        let pos = (idx as usize).try_into().unwrap_or(usize::MAX);
        for scope in self.arrays.iter_mut().rev() {
            if let Some(elements) = scope.get_mut(name) {
                let len = elements.len();
                *elements
                    .get_mut(pos)
                    .ok_or_else(|| format!("array index out of bounds: {} (len={})", idx, len))? =
                    val;
                return Ok(());
            }
        }
        Err(format!("undefined array: {}", name))
    }

    /// Resolve a value that might be an anonymous array ID into its elements.
    fn resolve_anonymous_array(&self, val: i64) -> Option<&Vec<i64>> {
        if val < 0 {
            let idx = (-val - 1) as usize;
            self.anonymous_arrays.get(idx)
        } else {
            None
        }
    }
}

type ParseResult = Result<i64, String>;

/// Logical OR layer (lowest precedence): Expr ('||' Expr)*
fn parse_logical_or(input: &mut &[u8], env: &mut Env) -> ParseResult {
    let mut result = parse_logical_and(input, env)?;
    loop {
        skip_spaces(input);
        if input.starts_with(b"||") {
            *input = &input[2..]; // consume '||'
            skip_spaces(input);
            let rhs = parse_logical_and(input, env)?;
            result = if result != 0 || rhs != 0 { 1 } else { 0 };
        } else {
            break;
        }
    }
    Ok(result)
}

/// Logical AND layer: Comparison ('&&' Comparison)*
fn parse_logical_and(input: &mut &[u8], env: &mut Env) -> ParseResult {
    let mut result = parse_comparison(input, env)?;
    loop {
        skip_spaces(input);
        if input.starts_with(b"&&") {
            *input = &input[2..]; // consume '&&'
            skip_spaces(input);
            let rhs = parse_comparison(input, env)?;
            result = if result != 0 && rhs != 0 { 1 } else { 0 };
        } else {
            break;
        }
    }
    Ok(result)
}

/// Comparison layer: Expr (('<'|'>'|'<='|'>='|'=='|'!=') Expr)*
fn parse_comparison(input: &mut &[u8], env: &mut Env) -> ParseResult {
    let mut result = parse_expr(input, env)?;
    loop {
        skip_spaces(input);
        if input.starts_with(b"<=")
            || input.starts_with(b">=")
            || input.starts_with(b"==")
            || input.starts_with(b"!=")
        {
            let op = (input[0] as char, input[1] as char);
            *input = &input[2..]; // consume operator
            skip_spaces(input);
            let rhs = parse_comparison(input, env)?;
            result = match op {
                ('<', '=') => {
                    if result <= rhs {
                        1
                    } else {
                        0
                    }
                }
                ('>', '=') => {
                    if result >= rhs {
                        1
                    } else {
                        0
                    }
                }
                ('=', '=') => {
                    if result == rhs {
                        1
                    } else {
                        0
                    }
                }
                ('!', '=') => {
                    if result != rhs {
                        1
                    } else {
                        0
                    }
                }
                _ => unreachable!(),
            };
        } else if input.first().copied() == Some(b'<') || input.first().copied() == Some(b'>') {
            let op = input[0];
            *input = &input[1..]; // consume operator
            skip_spaces(input);
            let rhs = parse_comparison(input, env)?;
            result = match op {
                b'<' => {
                    if result < rhs {
                        1
                    } else {
                        0
                    }
                }
                b'>' => {
                    if result > rhs {
                        1
                    } else {
                        0
                    }
                }
                _ => unreachable!(),
            };
        } else if input.starts_with(b"is") && (input.len() < 3 || !input[2].is_ascii_alphanumeric())
        {
            // Type check: `expr is TYPE` where TYPE is U8, U16, U32, I8, I16, I32
            *input = &input[2..]; // consume "is"
            skip_spaces(input);

            let type_name: String = read_ident(input).to_ascii_uppercase();
            result = if env
                .pending_type
                .map(|t| t.to_ascii_uppercase() == type_name)
                == Some(true)
            {
                1
            } else {
                0
            };
        } else {
            break;
        }
    }
    Ok(result)
}

fn parse_expr(input: &mut &[u8], env: &mut Env) -> ParseResult {
    let mut result = parse_term(input, env)?;
    loop {
        skip_spaces(input);
        match input.first().copied() {
            Some(b'+') | Some(b'-') => {}
            _ => break,
        }
        let op = input[0];
        *input = &input[1..]; // consume operator
        skip_spaces(input);
        let rhs = parse_term(input, env)?;
        match op {
            b'+' => result += rhs,
            b'-' => result -= rhs,
            _ => unreachable!(),
        }
    }
    Ok(result)
}

fn parse_term(input: &mut &[u8], env: &mut Env) -> ParseResult {
    let mut result = parse_factor(input, env)?;
    loop {
        skip_spaces(input);
        match input.first().copied() {
            Some(b'*') | Some(b'/') => {}
            _ => break,
        }
        let op = input[0];
        *input = &input[1..]; // consume operator
        skip_spaces(input);
        let rhs = parse_factor(input, env)?;
        match op {
            b'*' => result *= rhs,
            b'/' => {
                if rhs == 0 {
                    return Err("division by zero".to_string());
                }
                result /= rhs;
            }
            _ => unreachable!(),
        }
    }
    Ok(result)
}

fn parse_factor(input: &mut &[u8], env: &mut Env) -> ParseResult {
    skip_spaces(input);
    if input.first().copied() == Some(b'(') {
        *input = &input[1..]; // consume '('
        let val = parse_comparison(input, env)?;
        skip_spaces(input);
        if input.first().copied() != Some(b')') {
            return Err("expected ')'".to_string());
        }
        *input = &input[1..]; // consume ')'
        Ok(val)
    } else if input.first().copied() == Some(b'{') {
        if looks_like_struct_literal(input) {
            let mut fields = parse_struct_literal(input, env)?;
            skip_spaces(input);
            // If followed by '.', do inline property access; otherwise store for later binding.
            if input.first().copied() == Some(b'.') {
                resolve_chained_fields(&mut fields, input, env)
            } else {
                env.pending_struct = Some(fields);
                Ok(0)
            }
        } else {
            parse_block(input, env)
        }
    } else if input.first().copied() == Some(b'[') {
        // Array literal: '[' [Expr (',' Expr)*] ']'
        let elements = parse_array_literal(input, env)?;
        skip_spaces(input);
        // If followed by '[', do inline index access; otherwise store for later binding.
        if input.first().copied() == Some(b'[') {
            resolve_chained_index(&elements, input, env)
        } else {
            env.pending_array = Some(elements);
            Ok(0)
        }
    } else if input.starts_with(b"if") && (input.len() < 3 || !input[2].is_ascii_alphanumeric()) {
        // Parse if/else expression: 'if' CONDITION CONSEQUENCE 'else' ALTERNATIVE
        *input = &input[2..]; // consume "if"
        skip_spaces(input);
        let cond = parse_logical_or(input, env)?;
        skip_spaces(input);
        let consequence = parse_logical_or(input, env)?;
        skip_spaces(input);
        if !input.starts_with(b"else") {
            return Err("expected 'else' in if expression".to_string());
        }
        *input = &input[4..]; // consume "else"
        skip_spaces(input);
        let alternative = parse_logical_or(input, env)?;
        Ok(if cond != 0 { consequence } else { alternative })
    } else if input.starts_with(b"match") && (input.len() < 5 || !input[5].is_ascii_alphanumeric())
    {
        // Parse match expression: 'match' '(' EXPR ')' '{' case VAL => RESULT; ... case _ => DEFAULT; '}'
        *input = &input[5..]; // consume "match"
        skip_spaces(input);

        expect_char(input, b'(')?;
        let scrutinee = parse_logical_or(input, env)?;
        skip_spaces(input);
        expect_char(input, b')')?;
        skip_spaces(input);

        if input.first().copied() != Some(b'{') {
            return Err("expected '{' in match expression".to_string());
        }
        *input = &input[1..]; // consume '{'

        let mut result: Option<i64> = None;
        let mut has_wildcard = false;
        loop {
            skip_spaces(input);
            if input.first().copied() == Some(b'}') {
                break;
            }
            if !input.starts_with(b"case") || (input.len() >= 4 && input[4].is_ascii_alphanumeric())
            {
                return Err("expected 'case' in match expression".to_string());
            }
            *input = &input[4..]; // consume "case"
            skip_spaces(input);

            let is_wildcard = input.first().copied() == Some(b'_');
            if !is_wildcard {
                let case_val = parse_logical_or(input, env)?;
                let case_result = parse_case_arrow_expr(input, env)?;
                if scrutinee == case_val && result.is_none() {
                    result = Some(case_result);
                }
            } else {
                *input = &input[1..]; // consume '_'
                has_wildcard = true;
                let case_result = parse_case_arrow_expr(input, env)?;
                if result.is_none() {
                    result = Some(case_result);
                }
            }
        }

        *input = &input[1..]; // consume '}'

        if result.is_none() && !has_wildcard {
            return Err(format!(
                "non-exhaustive match: no case matched value {}",
                scrutinee
            ));
        }
        Ok(result.unwrap_or(0))
    } else if input.first().map_or(false, |&c| c.is_ascii_alphabetic()) {
        let ident = read_ident(input);
        // Check for boolean literals first
        match ident.as_str() {
            "true" => Ok(1),
            "false" => Ok(0),
            _ if !input.is_empty() && input.first().copied() == Some(b'(') => {
                // Function call: IDENT ( [Expr (',' Expr)*] )
                *input = &input[1..]; // consume '('
                skip_spaces(input);

                // Evaluate comma-separated argument expressions
                let args: Vec<i64> =
                    parse_comma_separated(input, |inner| parse_logical_or(inner, env))?;

                if let Some((params, body_bytes)) = env.functions.get(&ident).cloned() {
                    if params.len() != args.len() {
                        return Err(format!(
                            "function {} expects {} arguments, got {}",
                            ident,
                            params.len(),
                            args.len()
                        ));
                    }

                    // Create new scope and bind parameters to argument values
                    env.enter_scope();
                    for (param_name, arg_val) in params.iter().zip(args.into_iter()) {
                        env.insert(param_name.clone(), arg_val, true, None);
                    }

                    let mut body_slice = body_bytes.as_slice();
                    let result = parse_fn_body(&mut body_slice, env);
                    env.exit_scope();
                    result
                } else {
                    Err(format!("undefined function: {}", ident))
                }
            }

            _ if !input.is_empty() && input.first().copied() == Some(b'.') => {
                // Property access on a struct-typed variable: IDENT.field (supports chained dots)
                let fields_opt = env.get_struct(&ident).cloned();
                match fields_opt {
                    None => Err(format!("variable '{}' is not a struct", ident)),
                    Some(mut fields) => resolve_chained_fields(&mut fields, input, env),
                }
            }

            _ if !input.is_empty() && input.first().copied() == Some(b'[') => {
                // Array index access: IDENT[Expr] (supports chained brackets)
                if let Some(elements) = env.get_array(&ident).cloned() {
                    resolve_chained_index(&elements, input, env)
                } else {
                    Err(format!("variable '{}' is not an array", ident))
                }
            }

            _ if starts_with_keyword(input, b"is") => {
                // Type check on a variable: `x is TYPE`
                skip_spaces(input);
                *input = &input[2..]; // consume "is"
                skip_spaces(input);

                let type_name: String = read_ident(input).to_ascii_uppercase();
                match env.get_type(&ident) {
                    Some(Some(stored)) if stored.to_ascii_uppercase() == type_name => Ok(1),
                    _ => Ok(0),
                }
            }

            _ => match env.get(&ident) {
                Some(val) => {
                    // Propagate stored type for 'is' checks and annotation mismatch detection
                    if let Some(Some(t)) = env.get_type(&ident) {
                        env.pending_type = Some(t);
                    } else {
                        env.pending_type = None;
                    }
                    Ok(val)
                }
                None => Err(format!("undefined variable: {}", ident)),
            },
        }
    } else {
        parse_number(input, env)
    }
}

/// Check whether a '{' begins a struct literal ('{' IDENT ':' ...) rather than a block.
fn looks_like_struct_literal(input: &[u8]) -> bool {
    let mut peek = &input[1..]; // look past '{'
    skip_spaces(&mut peek);
    if peek.first().map_or(false, |&c| c.is_ascii_alphabetic()) {
        let _ = read_ident(&mut peek);
        skip_spaces(&mut peek);
        peek.first().copied() == Some(b':')
    } else {
        false
    }
}

/// Parse a struct literal: '{' IDENT ':' Expr (',' IDENT ':' Expr)* '}'
fn parse_struct_literal(input: &mut &[u8], env: &mut Env) -> Result<HashMap<String, i64>, String> {
    *input = &input[1..]; // consume '{'
    let mut fields = HashMap::new();
    loop {
        skip_spaces(input);
        let name = read_ident(input);
        expect_char(input, b':')?;
        skip_spaces(input);
        let val = parse_logical_or(input, env)?;
        // If the RHS was a nested struct literal (pending_struct), register it anonymously.
        // Same for pending_array — capture array literals as anonymous array references.
        if let Some(nested_fields) = env.pending_struct.take() {
            fields.insert(name, env.register_anonymous_struct(nested_fields));
        } else if let Some(nested_array) = env.pending_array.take() {
            fields.insert(name, env.register_anonymous_array(nested_array));
        } else {
            fields.insert(name, val);
        }
        skip_spaces(input);
        if input.first().copied() == Some(b',') {
            *input = &input[1..]; // consume ','
        } else {
            break;
        }
    }
    expect_char(input, b'}')?;
    Ok(fields)
}

/// Parse an array literal: '[' [Expr (',' Expr)*] ']'
fn parse_array_literal(input: &mut &[u8], env: &mut Env) -> Result<Vec<i64>, String> {
    *input = &input[1..]; // consume '['
    skip_spaces(input);

    let mut elements = Vec::new();
    if input.first().copied() != Some(b']') {
        loop {
            let val = parse_logical_or(input, env)?;
            // If the element was a nested array literal or struct literal, register it anonymously.
            if let Some(nested) = env.pending_array.take() {
                elements.push(env.register_anonymous_array(nested));
            } else if let Some(nested_fields) = env.pending_struct.take() {
                elements.push(env.register_anonymous_struct(nested_fields));
            } else {
                elements.push(val);
            }
            skip_spaces(input);
            if input.first().copied() == Some(b',') {
                *input = &input[1..]; // consume ','
                skip_spaces(input);
            } else {
                break;
            }
        }
    }

    expect_char(input, b']')?;
    Ok(elements)
}

/// Expect and parse an index expression: '[' Expr ']'
fn expect_index(input: &mut &[u8], env: &mut Env) -> Result<i64, String> {
    if input.first().copied() != Some(b'[') {
        return Err("expected '['".to_string());
    }
    *input = &input[1..]; // consume '['
    skip_spaces(input);

    // Index must be a non-negative number.
    let idx = parse_number(input, env)?;
    if idx < 0 {
        return Err("negative array index".to_string());
    }

    skip_spaces(input);
    expect_char(input, b']')?;
    Ok(idx)
}

/// Index into an array, returning the element at the given position.
fn index_array(elements: &[i64], idx: i64) -> Result<i64, String> {
    let pos = idx as usize;
    elements.get(pos).copied().ok_or_else(|| {
        format!(
            "array index out of bounds: {} (len={})",
            idx,
            elements.len()
        )
    })
}

/// Consume chained `[idx]` accesses, resolving through anonymous nested arrays.
fn resolve_chained_index(
    elements: &[i64],
    input: &mut &[u8],
    env: &mut Env,
) -> Result<i64, String> {
    let mut current = index_array(elements, expect_index(input, env)?)?;

    // If the indexed value is an anonymous array ID and followed by '[', keep resolving.
    loop {
        skip_spaces(input);
        if input.first().copied() == Some(b'[') && current.is_negative() {
            let nested: Vec<i64> = env
                .resolve_anonymous_array(current)
                .cloned()
                .ok_or_else(|| format!("invalid anonymous array reference: {}", current))?;
            // Clone before mutable borrow of env in expect_index.
            let idx = expect_index(input, env)?;
            current = index_array(&nested, idx)?;
        } else if input.first().copied() == Some(b'.') && current.is_negative() {
            // Indexed value is an anonymous struct — resolve field access.
            let nested_fields = env
                .resolve_anonymous(current)
                .ok_or_else(|| format!("invalid anonymous struct reference: {}", current))?;
            return resolve_chained_fields(&mut nested_fields.clone(), input, env);
        } else {
            break;
        }
    }

    Ok(current)
}

/// Resolve a field value from a struct's fields map.
/// Returns (value, optional_nested_fields) so callers can chain dot notation through nested structs.
fn resolve_field(
    fields: &HashMap<String, i64>,
    env: &mut Env,
    field_name: &str,
) -> Result<(i64, Option<HashMap<String, i64>>), String> {
    let val = *fields
        .get(field_name)
        .ok_or_else(|| format!("undefined field: {}", field_name))?;
    // If the field value is a negative anonymous struct ID, resolve it for chained access.
    // Anonymous array IDs (negative) pass through as-is so bracket indexing can handle them.
    if val < 0 {
        if let Some(nested_fields) = env.resolve_anonymous(val) {
            return Ok((0, Some(nested_fields.clone())));
        }
        // Check anonymous arrays — if found, the raw negative ID is returned
        // so resolve_chained_index can handle it; otherwise fall through as a plain value.
        if env.resolve_anonymous_array(val).is_some() {
            return Ok((val, None));
        }
        Err(format!("undefined field: {}", field_name))
    } else {
        Ok((val, None))
    }
}

/// Consume chained `.field` accesses starting from current input (which must begin with '.').
fn resolve_chained_fields(
    fields: &mut HashMap<String, i64>,
    input: &mut &[u8],
    env: &mut Env,
) -> ParseResult {
    loop {
        *input = &input[1..]; // consume '.'
        let field_name = read_ident(input);
        match resolve_field(fields, env, &field_name)? {
            (val, nested) => {
                if let Some(nested_flds) = nested {
                    *fields = nested_flds;
                    skip_spaces(input);
                    if input.first().copied() == Some(b'.') {
                        continue;
                    } else {
                        env.pending_struct = Some(fields.clone());
                        return Ok(val);
                    }
                } else {
                    // If val is an anonymous array ID and followed by '[', resolve it inline.
                    if val < 0
                        && input.first().copied() == Some(b'[')
                        && env.resolve_anonymous_array(val).is_some()
                    {
                        let elements = env.resolve_anonymous_array(val).unwrap().clone();
                        return resolve_chained_index(&elements, input, env);
                    }
                    return Ok(val);
                }
            }
        }
    }
}

/// Parse a block: '{' Statement* Expr '}'
fn parse_block(input: &mut &[u8], env: &mut Env) -> ParseResult {
    *input = &input[1..]; // consume '{'
    env.enter_scope();
    let last_val = parse_statements_loop(input, env, true)?;
    env.exit_scope();
    *input = &input[1..]; // consume '}'
    Ok(last_val)
}

/// Check if the current input starts with a given keyword.
fn starts_with_keyword(input: &[u8], keyword: &[u8]) -> bool {
    let mut i = 0;
    while i < input.len() && (input[i] == b' ' || input[i] == b'\t') {
        i += 1;
    }
    if i + keyword.len() > input.len() {
        return false;
    }
    let kw = &input[i..i + keyword.len()];
    kw == keyword
        && (i + keyword.len() >= input.len() || !input[i + keyword.len()].is_ascii_alphanumeric())
}

fn is_let_statement(input: &[u8]) -> bool {
    starts_with_keyword(input, b"let")
}
fn is_if_statement(input: &[u8]) -> bool {
    starts_with_keyword(input, b"if")
}
fn is_while_statement(input: &[u8]) -> bool {
    starts_with_keyword(input, b"while")
}
fn is_for_statement(input: &[u8]) -> bool {
    starts_with_keyword(input, b"for")
}

/// Check if the current input starts with a function definition statement.
fn is_fn_statement(input: &[u8]) -> bool {
    starts_with_keyword(input, b"fn")
}

/// Skip over a block without executing it (for non-taken if/else branches).
fn skip_block(input: &mut &[u8]) -> Result<(), String> {
    *input = &input[1..]; // consume '{'
    let mut depth = 1;
    while !input.is_empty() && depth > 0 {
        match input.first().copied() {
            Some(b'{') => depth += 1,
            Some(b'}') => depth -= 1,
            _ => {}
        }
        *input = &input[1..];
    }
    if depth != 0 {
        return Err("unmatched '{' in block".to_string());
    }
    Ok(())
}

/// Parse an expression statement: evaluate expression, optionally consume trailing semicolon.
fn parse_expression_stmt(input: &mut &[u8], env: &mut Env) -> ParseResult {
    let val = parse_logical_or(input, env)?;
    skip_spaces(input);
    if input.first().copied() == Some(b';') {
        *input = &input[1..]; // consume ';'
    }
    Ok(val)
}

/// Parse a single body item (let/assignment/expression-stmt or block).
fn parse_body_item(input: &mut &[u8], env: &mut Env) -> ParseResult {
    if is_fn_statement(input) {
        parse_fn_statement(input, env)
    } else if is_let_statement(input) {
        parse_let_statement(input, env)
    } else if is_assignment_statement(input) {
        parse_assignment(input, env)
    } else if is_if_statement(input) {
        parse_if_statement(input, env)
    } else if is_for_statement(input) {
        parse_for_statement(input, env)
    } else {
        parse_expression_stmt(input, env)
    }
}

/// Skip a for-loop header (up to and including the closing ')').
fn skip_for_header(input: &mut &[u8]) -> Result<(), String> {
    // We are right after "for", find matching ')' then skip body.
    let mut depth = 1usize;
    while !input.is_empty() && depth > 0 {
        if input.first().copied() == Some(b'(') {
            depth += 1;
        } else if input.first().copied() == Some(b')') {
            depth -= 1;
        }
        *input = &input[1..];
    }
    skip_spaces(input);
    Ok(())
}

/// Skip a single body item without executing it.
fn skip_body_item(input: &mut &[u8]) -> Result<(), String> {
    if is_for_statement(input) {
        // Consume "for"
        *input = &input[3..];
        skip_spaces(input);
        skip_for_header(input)?;
        skip_body_item(input)?; // skip the body
    } else if input.first().copied() == Some(b'{') {
        skip_block(input)?;
    } else {
        // Consume until we hit ';' or 'else' at the top level
        let mut depth = 0usize;
        while !input.is_empty()
            && !(depth == 0 && input.first().copied() == Some(b';'))
            && !(depth == 0 && input.starts_with(b"else"))
        {
            if input.first().copied() == Some(b'{') {
                depth += 1;
            } else if input.first().copied() == Some(b'}') {
                depth -= 1;
            }
            *input = &input[1..];
        }
        // Consume the ';' if present (but not 'else')
        skip_spaces(input);
        if input.first().copied() == Some(b';') {
            *input = &input[1..];
        }
    }
    Ok(())
}

/// Parse a for loop: 'for' '(' IDENT 'in' Expr '..' Expr ')' body
fn parse_for_statement(input: &mut &[u8], env: &mut Env) -> ParseResult {
    skip_spaces(input);
    *input = &input[3..]; // consume "for"
    skip_spaces(input);

    expect_char(input, b'(')?;
    let ident = read_ident(input);
    skip_spaces(input);

    if !input.starts_with(b"in") {
        return Err("expected 'in' in for loop".to_string());
    }
    *input = &input[2..]; // consume "in"
    skip_spaces(input);

    let start_val = parse_logical_or(input, env)?;
    skip_spaces(input);

    if input.len() < 2 || input[0] != b'.' || input[1] != b'.' {
        return Err("expected '..' in for loop range".to_string());
    }
    *input = &input[2..]; // consume ".."
    skip_spaces(input);

    let end_val = parse_logical_or(input, env)?;
    skip_spaces(input);

    expect_char(input, b')')?;
    skip_spaces(input);

    // Save body bytes so we can re-parse them each iteration.
    // This captures the body + any trailing code (parse_body_item only consumes one item).
    let body_bytes: Box<[u8]> = input.to_vec().into_boxed_slice();

    if start_val < end_val {
        let mut consumed = 0;
        for i in start_val..end_val {
            let mut iter_input: &[u8] = &body_bytes;
            env.insert(ident.clone(), i, true, None);
            let _ = parse_body_item(&mut iter_input, env)?;
            consumed = body_bytes.len() - iter_input.len();
        }
        *input = &input[consumed..];
    } else {
        // No iterations: just skip past the body without executing it.
        skip_body_item(input)?;
    }

    Ok(0) // for loops don't produce a value themselves
}

/// Parse a match case result expression after '=>'.
fn parse_case_arrow_expr(input: &mut &[u8], env: &mut Env) -> ParseResult {
    skip_spaces(input);
    expect_arrow(input)?; // consume '=>'
    let val = parse_logical_or(input, env)?;
    skip_spaces(input);
    if input.first().copied() == Some(b';') {
        *input = &input[1..]; // consume ';'
    }
    Ok(val)
}

/// Expect and consume a specific character.
fn expect_char(input: &mut &[u8], expected: u8) -> Result<(), String> {
    skip_spaces(input);
    if input.first().copied() != Some(expected) {
        return Err(format!("expected '{}'", expected as char));
    }
    *input = &input[1..]; // consume character
    Ok(())
}

/// Expect and consume the '=>' arrow token.
fn expect_arrow(input: &mut &[u8]) -> Result<(), String> {
    skip_spaces(input);
    if input.len() < 2 || input[0] != b'=' || input[1] != b'>' {
        return Err("expected '=> in match case".to_string());
    }
    *input = &input[2..]; // consume "=>"
    Ok(())
}

/// Parse an if/else statement: 'if' CONDITION body ['else' body]
fn parse_if_statement(input: &mut &[u8], env: &mut Env) -> ParseResult {
    skip_spaces(input);
    *input = &input[2..]; // consume "if"
    skip_spaces(input);
    let cond = parse_logical_or(input, env)?;
    skip_spaces(input);

    if cond != 0 {
        let val = parse_body_item(input, env)?;
        skip_spaces(input);
        if input.starts_with(b"else") {
            *input = &input[4..]; // consume "else"
            skip_spaces(input);
            skip_body_item(input)?; // discard non-taken branch
        }
        Ok(val)
    } else {
        let _ = parse_body_item(input, env);
        skip_spaces(input);
        if input.starts_with(b"else") {
            *input = &input[4..]; // consume "else"
            skip_spaces(input);
            parse_body_item(input, env)
        } else {
            Ok(0)
        }
    }
}

/// Check if the current input starts with an assignment statement: IDENT ('+'|'-'|'*'|'/')? '=' Expr ';'
fn is_assignment_statement(input: &[u8]) -> bool {
    let mut i = 0;
    while i < input.len() && (input[i] == b' ' || input[i] == b'\t') {
        i += 1;
    }
    if i >= input.len() || !input[i].is_ascii_alphabetic() {
        return false;
    }
    let mut j = i;
    while j < input.len() && (input[j].is_ascii_alphanumeric() || input[j] == b'_') {
        j += 1;
    }
    // Skip optional bracket index: [ Expr ]
    if j < input.len() && input[j] == b'[' {
        let mut depth = 1usize;
        j += 1; // consume '['
        while j < input.len() && depth > 0 {
            match input[j] {
                b'[' => depth += 1,
                b']' => depth -= 1,
                _ => {}
            }
            j += 1;
        }
    }
    while j < input.len() && (input[j] == b' ' || input[j] == b'\t') {
        j += 1;
    }
    if j >= input.len() {
        return false;
    }
    // '=' or '+=' / '-=' / '*=' / '/='
    if input[j] == b'=' {
        return true;
    }
    if j + 1 < input.len() && input[j + 1] == b'=' {
        matches!(input[j], b'+' | b'-' | b'*' | b'/')
    } else {
        false
    }
}

/// Parse a `let` statement: 'let' ['mut'] IDENT '=' Expr ';'
fn parse_let_statement(input: &mut &[u8], env: &mut Env) -> ParseResult {
    skip_spaces(input);
    *input = &input[3..]; // consume "let"
    skip_spaces(input);
    let mutable = if input.starts_with(b"mut ") || (input.len() >= 3 && &input[..3] == b"mut") {
        *input = &input[3..];
        skip_spaces(input);
        true
    } else {
        false
    };
    let name = read_ident(input);
    // Optional explicit type annotation: `let x : I32 = ...`
    skip_spaces(input);
    // Optional explicit type annotation: `let x : I32 = ...`
    skip_spaces(input);
    let mut explicit_type: Option<&'static str> = None;
    if input.first().copied() == Some(b':') {
        *input = &input[1..]; // consume ':'
        skip_spaces(input);

        match read_type_name(input) {
            Some(tn) => explicit_type = Some(tn),
            None => {
                let bad_name = read_ident(input);
                return Err(format!("unknown type: {}", bad_name));
            }
        }
    }

    expect_equals(input)?;
    let val = parse_comparison(input, env)?;
    // If the RHS was a struct literal without inline field access, capture it.
    if let Some(fields) = env.pending_struct.take() {
        expect_semicolon(input)?;
        env.insert_struct(name, fields, mutable);
        Ok(0)
    } else if let Some(elements) = env.pending_array.take() {
        // If the RHS was an array literal without inline index access, capture it.
        expect_semicolon(input)?;
        env.insert_array(name, elements, mutable);
        Ok(0)
    } else {
        expect_semicolon(input)?;
        // Capture whether the literal had an EXPLICIT suffix (not just I32 default).
        // We check if pending_type differs from "I32" — plain numbers always get I32 as default,
        // so a non-I32 type means there was an explicit suffix.
        let has_explicit_suffix = env.pending_type.map_or(false, |t| t != "I32");
        let literal_type = if has_explicit_suffix {
            env.pending_type.take()
        } else {
            // Plain number with no annotation — keep I32 default for 'is' checks.
            None
        };

        // If both annotation and explicit suffix present, they must agree.
        if let (Some(annot), Some(lit)) = (explicit_type, literal_type) {
            if annot.to_ascii_uppercase() != lit.to_ascii_uppercase() {
                return Err(format!("type mismatch: expected {}, got {}", annot, lit));
            }
        }

        let type_name = explicit_type.or(literal_type).or(env.pending_type.take());
        env.insert(name, val, mutable, type_name);
        Ok(val)
    }
}

/// Expect and consume a semicolon.
fn expect_semicolon(input: &mut &[u8]) -> Result<(), String> {
    skip_spaces(input);
    if input.first().copied() != Some(b';') {
        return Err("expected ';'".to_string());
    }
    *input = &input[1..]; // consume ';'
    Ok(())
}

/// Expect and consume an '=' character.
fn expect_equals(input: &mut &[u8]) -> Result<(), String> {
    skip_spaces(input);
    if input.first().copied() != Some(b'=') {
        return Err("expected '='".to_string());
    }
    *input = &input[1..]; // consume '='
    Ok(())
}

/// Find the position of a semicolon at depth 0 (accounting for nested parens/braces).
fn find_semicolon(input: &[u8]) -> Option<usize> {
    let mut i = 0;
    let mut paren_depth = 0usize;
    let mut brace_depth = 0usize;
    while i < input.len() {
        match input[i] {
            b'(' => paren_depth += 1,
            b')' => paren_depth -= 1,
            b'{' => brace_depth += 1,
            b'}' => brace_depth -= 1,
            b';' if paren_depth == 0 && brace_depth == 0 => return Some(i),
            _ => {}
        }
        i += 1;
    }
    None
}

/// Parse comma-separated items until `end_char`, calling `parse_item` for each.
fn parse_comma_separated_bracketed<T, F>(
    input: &mut &[u8],
    end_char: u8,
    mut parse_item: F,
) -> Result<Vec<T>, String>
where
    F: FnMut(&mut &[u8]) -> Result<T, String>,
{
    let mut items = Vec::new();
    if input.first().copied() != Some(end_char) {
        loop {
            let item = parse_item(input)?;
            items.push(item);
            skip_spaces(input);
            if input.first().copied() == Some(b',') {
                *input = &input[1..]; // consume ','
                skip_spaces(input);
            } else {
                break;
            }
        }
    }
    Ok(items)
}

/// Parse comma-separated items inside parentheses, calling `parse_item` for each.
fn parse_comma_separated<T, F>(input: &mut &[u8], parse_item: F) -> Result<Vec<T>, String>
where
    F: FnMut(&mut &[u8]) -> Result<T, String>,
{
    let items = parse_comma_separated_bracketed(input, b')', parse_item)?;
    expect_char(input, b')')?;
    Ok(items)
}

/// Parse a function definition: 'fn' IDENT '(' [IDENT (',' IDENT)*] ')' '=>' Expr ';'
fn parse_fn_statement(input: &mut &[u8], env: &mut Env) -> ParseResult {
    skip_spaces(input);
    *input = &input[2..]; // consume "fn"
    skip_spaces(input);

    let name = read_ident(input);
    skip_spaces(input);

    expect_char(input, b'(')?;
    skip_spaces(input);

    // Parse comma-separated parameter names (or empty)
    let params: Vec<String> = parse_comma_separated(input, |input| Ok(read_ident(input)))?;
    skip_spaces(input);

    if input.len() < 2 || input[0] != b'=' || input[1] != b'>' {
        return Err("expected '=>' in function definition".to_string());
    }
    *input = &input[2..]; // consume "=>"
    skip_spaces(input);

    // Find the semicolon that ends this expression to extract body bytes.
    if let Some(semi_pos) = find_semicolon(input) {
        let body_bytes = input[..semi_pos].to_vec();

        env.functions.insert(name, (params.clone(), body_bytes));

        *input = &input[semi_pos + 1..]; // consume past ';'
        Ok(0)
    } else {
        Err("expected ';' after function body".to_string())
    }
}

/// Parse a while loop: 'while' CONDITION body
fn parse_while_statement(input: &mut &[u8], env: &mut Env) -> ParseResult {
    skip_spaces(input);
    *input = &input[5..]; // consume "while"
    skip_spaces(input);

    // Save the condition bytes so we can re-parse them each iteration.
    let cond_bytes: Box<[u8]> = input.to_vec().into_boxed_slice();

    loop {
        // Restore condition for re-parsing (environment state carries mutations)
        let mut iter_input: &[u8] = &cond_bytes;

        let cond = parse_logical_or(&mut iter_input, env)?;
        skip_spaces(&mut iter_input);

        if cond != 0 {
            // Execute body
            let _ = parse_body_item(&mut iter_input, env)?;
        } else {
            // Condition is false — skip past the body without executing it,
            // so that outer statement parsing doesn't re-execute those bytes.
            skip_body_item(&mut iter_input)?;
            let consumed = cond_bytes.len() - iter_input.len();
            *input = &input[consumed..];
            break;
        }
    }

    Ok(0) // while loops don't produce a value themselves
}

/// Parse an assignment: IDENT ('+'|'-'|'*'|'/')? '=' Expr ';' or IDENT[Idx] = Expr ';'
fn parse_assignment(input: &mut &[u8], env: &mut Env) -> ParseResult {
    let name = read_ident(input);
    skip_spaces(input);

    // Check for array index target: IDENT[...]
    if input.first().copied() == Some(b'[') {
        let idx = expect_index(input, env)?;
        skip_spaces(input);

        // Expect '=' (array element assignment doesn't support compound ops yet)
        if input.first().copied() != Some(b'=') {
            return Err("expected '='".to_string());
        }
        *input = &input[1..]; // consume '='
        skip_spaces(input);

        let val = parse_logical_or(input, env)?;
        skip_spaces(input);
        if input.first().copied() == Some(b';') {
            *input = &input[1..];
        }

        env.update_array_element(&name, idx, val)?;
        Ok(val)
    } else {
        // Plain variable assignment (existing logic)
        let op = if input.starts_with(b"+=")
            || input.starts_with(b"-=")
            || input.starts_with(b"*=")
            || input.starts_with(b"/=")
        {
            let char_op = input[0] as char; // capture the arithmetic op before consuming
            *input = &input[2..]; // consume operator
            Some(char_op)
        } else if input.first().copied() == Some(b'=') {
            *input = &input[1..]; // consume '='
            None
        } else {
            return Err("expected '='".to_string());
        };

        skip_spaces(input);
        let val = parse_logical_or(input, env)?;
        // Semicolon is optional (fn body bytes may not include trailing ';')
        skip_spaces(input);
        if input.first().copied() == Some(b';') {
            *input = &input[1..];
        }

        if let Some(op) = op {
            // Compound assignment: read current value, apply op, write back
            let current = env
                .get(&name)
                .ok_or_else(|| format!("undefined variable: {}", name))?;
            let new_val = match op {
                '+' => current + val,
                '-' => current - val,
                '*' => current * val,
                '/' => {
                    if val == 0 {
                        return Err("division by zero".to_string());
                    }
                    current / val
                }
                _ => unreachable!(),
            };
            env.update(&name, new_val)?;
            Ok(new_val)
        } else {
            env.update(&name, val)?;
            Ok(val)
        }
    }
}

/// Execute function body bytes using statement-level parsing.
fn parse_fn_body(input: &mut &[u8], env: &mut Env) -> ParseResult {
    skip_spaces(input);
    // Try to parse as a statement first (handles compound assignments, let, etc.)
    if is_assignment_statement(input)
        || is_let_statement(input)
        || is_if_statement(input)
        || is_while_statement(input)
        || is_for_statement(input)
    {
        parse_body_item(input, env)
    } else {
        // Fall back to expression parsing
        parse_expression_stmt(input, env)
    }
}

/// Execute all deferred zero-param function bodies.
fn drain_deferred_bodies(env: &mut Env) -> Result<i64, String> {
    let mut last_val = 0i64;
    while let Some(body_bytes) = env.deferred_bodies.pop() {
        let mut body_slice = body_bytes.as_slice();
        last_val = parse_fn_body(&mut body_slice, env)?;
    }
    Ok(last_val)
}

/// Check if the input looks like a statement rather than a bare expression.
/// In non-block mode we need to distinguish:
/// - `add();` -> expression STATEMENT (consume in loop)
/// - `x` at EOF -> final EXPRESSION (leave for caller)
fn looks_like_statement(input: &[u8]) -> bool {
    // Recognized statement keywords are always statements
    if is_let_statement(input)
        || is_fn_statement(input)
        || is_if_statement(input)
        || is_while_statement(input)
        || is_for_statement(input)
        || is_assignment_statement(input)
    {
        return true;
    }

    // In block mode, anything goes (expressions are valid statements inside blocks).
    // In non-block mode, only consume if there's a semicolon somewhere ahead.
    // This lets us handle `add();` as a statement while leaving bare `x` for the caller.
    find_semicolon(input).is_some()
}

/// Parse statements until we hit a terminator ('}' or EOF) and return the last value.
fn parse_statements_loop(input: &mut &[u8], env: &mut Env, block_mode: bool) -> ParseResult {
    let mut last_val = 0i64;
    loop {
        skip_spaces(input);
        if block_mode && input.first().copied() == Some(b'}') {
            break;
        }
        if !block_mode && input.is_empty() {
            // Drain deferred zero-param function bodies before returning.
            last_val = drain_deferred_bodies(env)?;
            break;
        }

        // In non-block mode, only consume items that look like statements.
        // Bare expressions at EOF should be left for the caller (parse_program).
        if !block_mode && !looks_like_statement(input) {
            last_val = drain_deferred_bodies(env)?;
            break;
        }

        if is_fn_statement(input) {
            last_val = parse_fn_statement(input, env)?;
        } else if is_let_statement(input) {
            last_val = parse_let_statement(input, env)?;
        } else if is_if_statement(input) {
            last_val = parse_if_statement(input, env)?;
        } else if is_while_statement(input) {
            last_val = parse_while_statement(input, env)?;
        } else if is_for_statement(input) {
            last_val = parse_for_statement(input, env)?;
        } else if is_assignment_statement(input) {
            last_val = parse_assignment(input, env)?;
        } else {
            // Expression statement (includes function calls like `add();`)
            last_val = parse_expression_stmt(input, env)?;
        }
    }
    Ok(last_val)
}

/// Read an identifier (letter followed by alphanumeric chars).
fn read_ident(input: &mut &[u8]) -> String {
    let mut bytes = Vec::new();
    while input
        .first()
        .map_or(false, |&c| c.is_ascii_alphanumeric() || c == b'_')
    {
        bytes.push(input[0]);
        *input = &input[1..];
    }
    String::from_utf8(bytes).unwrap_or_default()
}

fn parse_number(input: &mut &[u8], env: &mut Env) -> ParseResult {
    let mut chars = Vec::new();
    while input.first().map_or(false, |&c| c.is_ascii_digit()) {
        chars.push(input[0]);
        *input = &input[1..];
    }
    if chars.is_empty() {
        return Err("expected number".to_string());
    }
    let s: String = chars.into_iter().map(|b| b as char).collect();
    let n = match s.parse::<i64>() {
        Ok(val) => val,
        Err(_) => return Err(format!("invalid integer: {}", s)),
    };

    // Check for type suffix: U8, U16, U32, I8, I16, I32 (case-insensitive)
    skip_spaces(input);

    if let Some(type_name) = read_type_name(input) {
        match type_name {
            "U8" => {
                if n < 0 || n > u8::MAX as i64 {
                    return Err(format!("value {} out of range for u8 (0..={})", n, u8::MAX));
                }
            }
            "U16" => {
                if n < 0 || n > u16::MAX as i64 {
                    return Err(format!(
                        "value {} out of range for u16 (0..={})",
                        n,
                        u16::MAX
                    ));
                }
            }
            "U32" => {
                if n < 0 || n > u32::MAX as i64 {
                    return Err(format!(
                        "value {} out of range for u32 (0..={})",
                        n,
                        u32::MAX
                    ));
                }
            }
            "I8" => {
                if n < i8::MIN as i64 || n > i8::MAX as i64 {
                    return Err(format!(
                        "value {} out of range for i8 ({}..={})",
                        n,
                        i8::MIN,
                        i8::MAX
                    ));
                }
            }
            "I16" => {
                if n < i16::MIN as i64 || n > i16::MAX as i64 {
                    return Err(format!(
                        "value {} out of range for i16 ({}..={})",
                        n,
                        i16::MIN,
                        i16::MAX
                    ));
                }
            }
            "I32" | _ => {
                if n < i32::MIN as i64 || n > i32::MAX as i64 {
                    return Err(format!(
                        "value {} out of range for i32 ({}..={})",
                        n,
                        i32::MIN,
                        i32::MAX
                    ));
                }
            }
        }
        env.pending_type = Some(type_name);
    } else {
        // No suffix — defaults to i32.
        env.pending_type = Some("I32");
    }

    Ok(n)
}

fn skip_spaces(input: &mut &[u8]) {
    while input.first().copied() == Some(b' ') || input.first().copied() == Some(b'\t') {
        *input = &input[1..];
    }
}

/// Read a type name (U8, U16, U32, I8, I16, I32) from the current position.
/// Returns `Some(&'static str)` and advances input past the type keyword on success.
/// Returns `None` if no recognized type is found at this position.
fn read_type_name(input: &mut &[u8]) -> Option<&'static str> {
    let is_u8 = input.starts_with(b"U8") || input.starts_with(b"u8");
    let is_u16 = input.starts_with(b"U16") || input.starts_with(b"u16");
    let is_u32 = input.starts_with(b"U32") || input.starts_with(b"u32");
    let is_i8 = input.starts_with(b"I8") || input.starts_with(b"i8");
    let is_i16 = input.starts_with(b"I16") || input.starts_with(b"i16");
    let is_i32 = input.starts_with(b"I32") || input.starts_with(b"i32");

    if is_u8 {
        *input = &input[2..];
        Some("U8")
    } else if is_u16 {
        *input = &input[3..];
        Some("U16")
    } else if is_u32 {
        *input = &input[3..];
        Some("U32")
    } else if is_i8 {
        *input = &input[2..];
        Some("I8")
    } else if is_i16 {
        *input = &input[3..];
        Some("I16")
    } else if is_i32 {
        *input = &input[3..];
        Some("I32")
    } else {
        None
    }
}

/// Parse a program: zero or more statements followed by a final expression.
fn parse_program(input: &mut &[u8], env: &mut Env) -> ParseResult {
    let last_val = parse_statements_loop(input, env, false)?;
    skip_spaces(input);
    if input.is_empty() {
        return Ok(last_val);
    }
    // Drain deferred zero-param function bodies before evaluating final expression.
    drain_deferred_bodies(env)?;
    let val = parse_logical_or(input, env)?;
    Ok(val)
}

fn execute_tuff(source: &str) -> Result<i64, String> {
    let trimmed = source.trim();
    if trimmed.is_empty() {
        return Ok(0);
    }
    let mut input: &[u8] = trimmed.as_bytes();
    let mut env = Env::new();
    parse_program(&mut input, &mut env)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_string_returns_zero() {
        assert_eq!(execute_tuff(""), Ok(0));
    }

    #[test]
    fn test_whitespace_returns_zero() {
        assert_eq!(execute_tuff("   "), Ok(0));
        assert_eq!(execute_tuff("\t\n"), Ok(0));
    }

    #[test]
    fn test_numeric_literal() {
        assert_eq!(execute_tuff("100"), Ok(100));
    }

    #[test]
    fn test_u8_suffixed_literal() {
        // `100U8` => 100 (suffix parsed and accepted, value unchanged for now)
        assert_eq!(execute_tuff("100U8"), Ok(100));
    }

    #[test]
    fn test_is_type_check_u8() {
        // `0U8 is U8` => 1 (true), plain numbers default to i32 so `0 is I32` => 1, `0 is U8` => 0
        assert_eq!(execute_tuff("0U8 is U8"), Ok(1));
        assert_eq!(execute_tuff("0 is I32"), Ok(1));
        assert_eq!(execute_tuff("0 is U8"), Ok(0));
    }

    #[test]
    fn test_is_type_check_variable() {
        // Variable type tracking: `let x = 0; x is I32` => 1, `x is U8` => 0
        assert_eq!(execute_tuff("let x = 0; x is I32"), Ok(1));
        assert_eq!(execute_tuff("let y = 5U8; y is U8"), Ok(1));
    }

    #[test]
    fn test_let_type_annotation() {
        // Explicit type annotation: `let x : I32 = 0; x is I32` => 1
        assert_eq!(execute_tuff("let x : I32 = 0; x is I32"), Ok(1));
        assert_eq!(execute_tuff("let z : U8 = 5U8; z is U8"), Ok(1));
        // Annotation overrides literal type: `let a : U8 = 0; a is U8` => 1 (not I32)
        assert_eq!(execute_tuff("let a : U8 = 0; a is U8"), Ok(1));
    }

    #[test]
    fn test_let_type_mismatch_error() {
        // Annotation and literal suffix disagree: `let x : U8 = 100U16` => Err
        assert!(execute_tuff("let x : U8 = 100U16;").is_err());
        // Typed variable assigned to differently-annotated target
        assert!(execute_tuff("let x = 100U16; let y : U8 = x;").is_err());
    }

    #[test]
    fn test_negative_u8_literal_error() {
        // `-100U8` => Err (negative typed literals not supported yet)
        assert!(execute_tuff("-100U8").is_err());
    }

    #[test]
    fn test_u8_overflow_error() {
        // `256U8` => Err (exceeds u8 range 0..=255)
        assert!(execute_tuff("256U8").is_err());
    }

    #[test]
    fn test_u16_literal() {
        assert_eq!(execute_tuff("65535U16"), Ok(65535));
    }

    #[test]
    fn test_u16_overflow_error() {
        // 65536 exceeds u16 max (0..=65535)
        assert!(execute_tuff("65536U16").is_err());
    }

    #[test]
    fn test_u32_literal() {
        assert_eq!(execute_tuff("4294967295U32"), Ok(4294967295));
    }

    #[test]
    fn test_u32_overflow_error() {
        // exceeds u32 max (0..=4294967295)
        assert!(execute_tuff("4294967296U32").is_err());
    }

    #[test]
    fn test_i8_literal() {
        assert_eq!(execute_tuff("127I8"), Ok(127));
    }

    #[test]
    fn test_i8_overflow_error() {
        // 128 exceeds i8 max (-128..=127)
        assert!(execute_tuff("128I8").is_err());
    }

    #[test]
    fn test_i16_literal() {
        assert_eq!(execute_tuff("32767I16"), Ok(32767));
    }

    #[test]
    fn test_i16_overflow_error() {
        // 32768 exceeds i16 max (-32768..=32767)
        assert!(execute_tuff("32768I16").is_err());
    }

    #[test]
    fn test_i32_literal() {
        assert_eq!(execute_tuff("2147483647I32"), Ok(2147483647));
    }

    #[test]
    fn test_i32_overflow_error() {
        // exceeds i32 max (-2147483648..=2147483647)
        assert!(execute_tuff("2147483648I32").is_err());
    }

    #[test]
    fn test_addition_expression() {
        assert_eq!(execute_tuff("1 + 2"), Ok(3));
    }

    #[test]
    fn test_chained_addition() {
        assert_eq!(execute_tuff("1 + 2 + 3"), Ok(6));
    }

    #[test]
    fn test_mixed_add_subtract() {
        assert_eq!(execute_tuff("2 + 3 - 4"), Ok(1));
    }

    #[test]
    fn test_multiplication_precedence() {
        assert_eq!(execute_tuff("2 * 3 - 4"), Ok(2));
    }

    #[test]
    fn test_addition_with_higher_precedence_multiply() {
        assert_eq!(execute_tuff("2 + 3 * 4"), Ok(14));
    }

    #[test]
    fn test_parenthesized_expression() {
        assert_eq!(execute_tuff("(2 + 3) * 4"), Ok(20));
    }

    #[test]
    fn test_division_by_zero_error() {
        assert!(execute_tuff("1 / (1 - 1)").is_err());
    }

    #[test]
    fn test_curly_brace_block() {
        assert_eq!(execute_tuff("{ 2 + 3 } * 4"), Ok(20));
    }

    #[test]
    fn test_let_in_block() {
        assert_eq!(execute_tuff("{ let x = 2 + 3; x } * 4"), Ok(20));
    }

    #[test]
    fn test_top_level_let_with_nested_block() {
        assert_eq!(execute_tuff("let y = { let x = 2 + 3; x } * 4; y"), Ok(20));
    }

    #[test]
    fn test_scoped_variables_no_shadow_leak() {
        // Inner `x` should not overwrite outer `x` after block exits.
        assert_eq!(
            execute_tuff("let x = 100; let y = { let x = 0; x }; x"),
            Ok(100)
        );
    }

    #[test]
    fn test_same_scope_reassignment() {
        // Redeclaring in the same scope should update the value.
        assert_eq!(execute_tuff("let x = 0; let x = 100; x"), Ok(100));
    }

    #[test]
    fn test_mutable_variable_assignment() {
        // `let mut` allows bare assignment (`x = ...`) to change the value.
        assert_eq!(execute_tuff("let mut x = 0; x = 1; x"), Ok(1));
    }

    #[test]
    fn test_immutable_variable_assignment_error() {
        // Assigning to a non-mutable variable should fail.
        assert!(execute_tuff("let x = 0; x = 1; x").is_err());
    }

    #[test]
    fn test_mutable_outer_scope_from_inner_block() {
        // Assignment inside inner block updates outer-scope mutable variable.
        assert_eq!(
            execute_tuff("let mut x = 0; let y = { x = 1; 0 }; x"),
            Ok(1)
        );
    }

    #[test]
    fn test_boolean_literal_true() {
        // `true` literal should evaluate to 1.
        assert_eq!(execute_tuff("let x = true; x"), Ok(1));
    }

    #[test]
    fn test_logical_or_expression() {
        // || operator with boolean variables.
        assert_eq!(execute_tuff("let x = true; let y = false; x || y"), Ok(1));
    }

    #[test]
    fn test_logical_and_expression() {
        // && operator: true && false => 0.
        assert_eq!(execute_tuff("let x = true; let y = false; x && y"), Ok(0));
    }

    #[test]
    fn test_comparison_less_than() {
        // < comparison: 0 < 1 => 1 (true).
        assert_eq!(execute_tuff("let x = 0; let y = 1; x < y"), Ok(1));
    }

    #[test]
    fn test_if_else_expression() {
        // if/else expression: conditionally assigns a value.
        assert_eq!(execute_tuff("let x = if (3 < 4) 2 else 5; x"), Ok(2));
    }

    #[test]
    fn test_if_with_variable_condition() {
        // Condition can be a variable holding the result of a comparison.
        assert_eq!(
            execute_tuff("let y = 3 < 4; let x = if (y) 2 else 5; x"),
            Ok(2)
        );
    }

    #[test]
    fn test_mutable_assignment_in_block_persists() {
        // Assignment to outer-scope mutable variable inside a block persists.
        assert_eq!(execute_tuff("let mut x = 0; { x = 2; } x"), Ok(2));
    }

    #[test]
    fn test_if_else_statement_with_blocks() {
        // if/else as statement with block bodies, conditionally assigning to mutable var.
        assert_eq!(
            execute_tuff("let mut x = 0; if (true) { x = 2; } else { x = 3; } x"),
            Ok(2)
        );
    }

    #[test]
    fn test_if_else_statement_bare_assignments() {
        // if/else as statement with bare assignment bodies (no blocks).
        assert_eq!(
            execute_tuff("let mut x = 0; if (true) x = 2; else x = 3; x"),
            Ok(2)
        );
    }

    #[test]
    fn test_compound_add_assignment() {
        // += operator: let mut x = 0; x += 1; => 1
        assert_eq!(execute_tuff("let mut x = 0; x += 1; x"), Ok(1));
    }

    #[test]
    fn test_compound_sub_assignment() {
        // -= operator: let mut x = 5; x -= 3; => 2
        assert_eq!(execute_tuff("let mut x = 5; x -= 3; x"), Ok(2));
    }

    #[test]
    fn test_compound_mul_assignment() {
        // *= operator: let mut x = 4; x *= 3; => 12
        assert_eq!(execute_tuff("let mut x = 4; x *= 3; x"), Ok(12));
    }

    #[test]
    fn test_compound_div_assignment() {
        // /= operator: let mut x = 10; x /= 2; => 5
        assert_eq!(execute_tuff("let mut x = 10; x /= 2; x"), Ok(5));
    }

    #[test]
    fn test_compound_assignment_with_expression() {
        // += with expression on RHS: let mut x = 1; x += 2 * 3; => 7
        assert_eq!(execute_tuff("let mut x = 1; x += 2 * 3; x"), Ok(7));
    }

    #[test]
    fn test_compound_assignment_immutable_error() {
        // Compound assignment on immutable variable should fail.
        assert!(execute_tuff("let x = 0; x += 1; x").is_err());
    }

    #[test]
    fn test_while_loop_basic() {
        // while loop: let mut x = 0; while (x < 4) x += 1; x => 4
        assert_eq!(
            execute_tuff("let mut x = 0; while (x < 4) x += 1; x"),
            Ok(4)
        );
    }

    #[test]
    fn test_while_loop_block_body() {
        // while loop with block body
        assert_eq!(
            execute_tuff("let mut x = 0; let mut y = 0; while (x < 3) { x += 1; y += 2; } y"),
            Ok(6)
        );
    }

    #[test]
    fn test_while_loop_false_condition() {
        // while loop that never executes because condition is false
        assert_eq!(
            execute_tuff("let mut x = 0; while (x > 5) x += 1; x"),
            Ok(0)
        );
    }

    #[test]
    fn test_nested_while_loop() {
        // nested while loops
        assert_eq!(
            execute_tuff(
                "let mut i = 0; let mut sum = 0; while (i < 3) { sum += i + 1; i += 1; } sum"
            ),
            Ok(6)
        );
    }

    #[test]
    fn test_for_loop_basic() {
        // for loop with range: let mut x = 0; for (i in 0..4) x += i; x => 0+1+2+3 = 6
        assert_eq!(
            execute_tuff("let mut x = 0; for (i in 0..4) x += i; x"),
            Ok(6)
        );
    }

    #[test]
    fn test_for_loop_block_body() {
        // for loop with block body
        assert_eq!(
            execute_tuff("let mut sum = 0; for (i in 1..4) { sum += i * 2; } sum"),
            Ok(12) // (1*2)+(2*2)+(3*2) = 2+4+6 = 12
        );
    }

    #[test]
    fn test_match_expression_basic() {
        // match expression: let x = match (100) { case 100 => 2; case _ => 3; }; x => 2
        assert_eq!(
            execute_tuff("let x = match (100) { case 100 => 2; case _ => 3; }; x"),
            Ok(2)
        );
    }

    #[test]
    fn test_match_expression_wildcard() {
        // match expression with wildcard fallback: let x = match (5) { case 1 => 99; case _ => 42; }; x => 42
        assert_eq!(
            execute_tuff("let x = match (5) { case 1 => 99; case _ => 42; }; x"),
            Ok(42)
        );
    }

    #[test]
    fn test_match_expression_multiple_cases() {
        // match with multiple cases: let x = match (3) { case 1 => 10; case 2 => 20; case 3 => 30; }; x => 30
        assert_eq!(
            execute_tuff("let x = match (3) { case 1 => 10; case 2 => 20; case 3 => 30; }; x"),
            Ok(30)
        );
    }

    #[test]
    fn test_match_expression_non_exhaustive_error() {
        // match without wildcard and no matching case should error
        assert!(execute_tuff("let x = match (5) { case 1 => 99; case 2 => 42; }; x").is_err());
    }

    #[test]
    fn test_function_definition_and_call() {
        // Define a function with `fn` and call it: `fn get() => 100; get()` => 100
        assert_eq!(execute_tuff("fn get() => 100; get()"), Ok(100));
    }

    #[test]
    fn test_function_with_parameters() {
        // Function with parameters: `fn add(first, second) => first + second; add(3, 4)` => 7
        assert_eq!(
            execute_tuff("fn add(first, second) => first + second; add(3, 4)"),
            Ok(7)
        );
    }

    #[test]
    fn test_forward_function_call() {
        // Function a calls b which is defined after a: `fn a() => b(); fn b() => 7; a()` => 7
        assert_eq!(execute_tuff("fn a() => b(); fn b() => 7; a()"), Ok(7));
    }

    #[test]
    fn test_function_mutates_outer_scope() {
        // Function body can mutate outer-scope mutable variable: `let mut x = 0; fn add() => x += 1; add(); x` => 1
        assert_eq!(
            execute_tuff("let mut x = 0; fn add() => x += 1; add(); x"),
            Ok(1)
        );
    }

    #[test]
    fn test_function_multiple_calls_mutate_outer_scope() {
        // Multiple calls accumulate mutations: `let mut x = 0; fn add() => x += 1; add(); add(); x` => 2
        assert_eq!(
            execute_tuff("let mut x = 0; fn add() => x += 1; add(); add(); x"),
            Ok(2)
        );
    }

    #[test]
    fn test_recursive_factorial() {
        // Recursive factorial: fn fact(n) => if (n <= 1) 1 else n * fact(n - 1); fact(5) => 120
        assert_eq!(
            execute_tuff("fn fact(n) => if (n <= 1) 1 else n * fact(n - 1); fact(5)"),
            Ok(120)
        );
    }

    #[test]
    fn test_array_literal_index_access() {
        // Array literal with bracket indexing: `let array = [1, 2, 3]; array[0]` => 1
        assert_eq!(execute_tuff("let array = [1, 2, 3]; array[0]"), Ok(1));
    }

    #[test]
    fn test_nested_array_index_access() {
        // Array containing an array: `let arr = [[1, 2], [3, 4]]; arr[0][1]` => 2
        assert_eq!(execute_tuff("let arr = [[1, 2], [3, 4]]; arr[0][1]"), Ok(2));
    }

    #[test]
    fn test_array_element_assignment() {
        // Mutable array element assignment: `let mut array = [1, 2, 3]; array[0] = 4; array[0]` => 4
        assert_eq!(
            execute_tuff("let mut array = [1, 2, 3]; array[0] = 4; array[0]"),
            Ok(4)
        );
    }

    #[test]
    fn test_struct_literal_property_access() {
        // `{ x : 3 }.x` => 3
        assert_eq!(execute_tuff("{ x: 3 }.x"), Ok(3));
    }

    #[test]
    fn test_struct_literal_multiple_fields() {
        // `{ x: 1, y: 2 }.y` => 2
        assert_eq!(execute_tuff("{ x: 1, y: 2 }.y"), Ok(2));
    }

    #[test]
    fn test_struct_literal_undefined_field_error() {
        // Accessing a field that wasn't declared in the struct literal is an error.
        assert!(execute_tuff("{ x: 1 }.y").is_err());
    }

    #[test]
    fn test_struct_variable_property_access() {
        // `let y = { x : 3 }; y.x` => 3
        assert_eq!(execute_tuff("let y = { x: 3 }; y.x"), Ok(3));
    }

    #[test]
    fn test_struct_with_array_field() {
        // Struct with array field: `let s = { items: [10, 20] }; s.items[0]` => 10
        assert_eq!(
            execute_tuff("let s = { items: [10, 20] }; s.items[0]"),
            Ok(10)
        );
    }

    #[test]
    fn test_array_containing_struct() {
        // Array containing a struct: `let arr = [{ x: 42 }]; arr[0].x` => 42
        assert_eq!(execute_tuff("let arr = [{ x: 42 }]; arr[0].x"), Ok(42));
    }

    #[test]
    fn test_struct_variable_undefined_field_error() {
        // Accessing a field not in the struct via variable is an error.
        assert!(execute_tuff("let s = { x: 1; }; s.y").is_err());
    }

    #[test]
    fn test_struct_property_on_non_struct_variable_error() {
        // Accessing a property on a plain (non-struct) variable is an error.
        assert!(execute_tuff("let x = 5; x.foo").is_err());
    }

    #[test]
    fn test_nested_struct_field_access() {
        // Struct containing another struct: access nested field via chained dot notation.
        assert_eq!(
            execute_tuff("let outer = { inner: { x: 42 } }; outer.inner.x"),
            Ok(42)
        );
    }

    #[test]
    fn test_comparison_less_equal_true() {
        assert_eq!(execute_tuff("1 <= 2"), Ok(1));
    }

    #[test]
    fn test_comparison_less_equal_false() {
        assert_eq!(execute_tuff("3 <= 2"), Ok(0));
    }

    #[test]
    fn test_comparison_greater_than_true() {
        assert_eq!(execute_tuff("5 > 3"), Ok(1));
    }

    #[test]
    fn test_comparison_greater_than_false() {
        assert_eq!(execute_tuff("2 > 3"), Ok(0));
    }

    #[test]
    fn test_comparison_greater_equal_true() {
        assert_eq!(execute_tuff("5 >= 5"), Ok(1));
    }

    #[test]
    fn test_comparison_greater_equal_false() {
        assert_eq!(execute_tuff("3 >= 5"), Ok(0));
    }

    #[test]
    fn test_comparison_equal_true() {
        assert_eq!(execute_tuff("42 == 42"), Ok(1));
    }

    #[test]
    fn test_comparison_equal_false() {
        assert_eq!(execute_tuff("1 == 2"), Ok(0));
    }

    #[test]
    fn test_comparison_not_equal_true() {
        assert_eq!(execute_tuff("1 != 2"), Ok(1));
    }

    #[test]
    fn test_comparison_not_equal_false() {
        assert_eq!(execute_tuff("3 != 3"), Ok(0));
    }

    #[test]
    fn test_function_wrong_arg_count_error() {
        // Calling a function with wrong number of arguments is an error.
        assert!(execute_tuff("fn f(a) => a; f(1, 2)").is_err());
    }

    #[test]
    fn test_undefined_function_call_error() {
        // Calling a non-existent function is an error.
        assert!(execute_tuff("nope()").is_err());
    }

    #[test]
    fn test_assignment_to_undefined_variable_error() {
        // Assigning to a variable that doesn't exist is an error.
        assert!(execute_tuff("x = 1; ").is_err());
    }

    #[test]
    fn test_compound_division_by_zero_in_assignment() {
        // Compound division by zero should fail.
        assert!(execute_tuff("let mut x = 5; x /= 0; ").is_err());
    }

    #[test]
    fn test_match_missing_brace_error() {
        // Match without opening brace is an error.
        assert!(execute_tuff("match (1) case _ => 0;").is_err());
    }

    #[test]
    fn test_for_loop_missing_in_keyword_error() {
        // For loop missing 'in' keyword should fail.
        assert!(execute_tuff("for (x .. 5) { 1 } ").is_err());
    }

    #[test]
    fn test_if_else_false_branch_executes_else() {
        // When condition is false, else branch should execute.
        assert_eq!(
            execute_tuff("let mut x = 0; if (false) { x = 1; } else { x = 99; } x"),
            Ok(99)
        );
    }

    #[test]
    fn test_if_true_branch_skips_else() {
        // When condition is true, else branch should be skipped.
        assert_eq!(
            execute_tuff("let mut x = 0; if (true) { x = 42; } else { x = 99; } x"),
            Ok(42)
        );
    }

    #[test]
    fn test_while_skips_body_when_false() {
        // While loop should skip body when condition is false from start.
        assert_eq!(
            execute_tuff("let mut x = 0; while (false) { x = 1; } x"),
            Ok(0)
        );
    }

    #[test]
    fn test_nested_block_scopes() {
        // Nested blocks should create and exit scopes properly.
        assert_eq!(execute_tuff("{ let x = 1; { let y = x + 2; y } }"), Ok(3));
    }

    #[test]
    fn test_expression_statement_with_semicolon() {
        // Expression followed by semicolon should work as statement.
        assert_eq!(execute_tuff("42; 99"), Ok(99));
    }

    #[test]
    fn test_unclosed_paren_error() {
        // Missing closing ')' should be an error.
        assert!(execute_tuff("(1 + 2").is_err());
    }

    #[test]
    fn test_if_expression_missing_else_error() {
        // 'if' expression without 'else' should be an error.
        assert!(execute_tuff("let x = if 1 2; x").is_err());
    }

    #[test]
    fn test_match_expression_missing_case_keyword_error() {
        // Match arm missing the 'case' keyword should be an error.
        assert!(execute_tuff("match (1) { 1 => 1 }").is_err());
    }

    #[test]
    fn test_undefined_variable_read_error() {
        // Reading an undefined variable should be an error.
        assert!(execute_tuff("undefinedVar").is_err());
    }

    #[test]
    fn test_for_loop_missing_range_dots_error() {
        // For loop range missing '..' should be an error.
        assert!(execute_tuff("for (i in 0 5) { 1 }").is_err());
    }

    #[test]
    fn test_match_case_missing_arrow_error() {
        // Match case missing '=>' should be an error.
        assert!(execute_tuff("match (1) { case 1 1 }").is_err());
    }

    #[test]
    fn test_let_statement_missing_equals_error() {
        // Let statement missing '=' should be an error.
        assert!(execute_tuff("let x 5;").is_err());
    }

    #[test]
    fn test_let_statement_missing_semicolon_error() {
        // Let statement missing trailing ';' should be an error.
        assert!(execute_tuff("let x = 5").is_err());
    }

    #[test]
    fn test_fn_statement_missing_arrow_error() {
        // Function definition missing '=>' should be an error.
        assert!(execute_tuff("fn foo() 1;").is_err());
    }

    #[test]
    fn test_fn_statement_missing_semicolon_error() {
        // Function definition body without a terminating ';' should be an error.
        assert!(execute_tuff("fn foo() => 1").is_err());
    }

    #[test]
    fn test_expression_starting_with_invalid_character_error() {
        // An expression that can't start a number/identifier/paren/block is an error.
        assert!(execute_tuff("+5").is_err());
    }

    #[test]
    fn test_integer_overflow_error() {
        // A numeric literal too large for i64 should be an error.
        assert!(execute_tuff("99999999999999999999").is_err());
    }

    #[test]
    fn test_let_statement_alone_returns_zero() {
        // A program consisting solely of a `let` statement with no trailing
        // expression drains deferred bodies and returns 0.
        assert_eq!(execute_tuff("let x = 5;"), Ok(0));
    }

    #[test]
    fn test_starts_with_keyword_skips_leading_whitespace() {
        // starts_with_keyword should skip leading spaces/tabs before matching.
        assert!(starts_with_keyword(b"  let x = 1", b"let"));
        assert!(starts_with_keyword(b"\tif (x)", b"if"));
        assert!(!starts_with_keyword(b"  letx", b"let"));
    }

    #[test]
    fn test_is_assignment_statement_skips_leading_whitespace() {
        // is_assignment_statement should skip leading spaces/tabs before the identifier.
        assert!(is_assignment_statement(b"  x = 5;"));
        assert!(is_assignment_statement(b"\tx += 1;"));
    }

    #[test]
    fn test_parse_assignment_missing_equals_error() {
        // Direct call to parse_assignment without an '=' should error.
        let mut env = Env::new();
        let mut input: &[u8] = b"x 5;";
        assert!(parse_assignment(&mut input, &mut env).is_err());
    }

    #[test]
    fn test_skip_block_with_nested_braces() {
        // skip_block should correctly track nested '{' / '}' depth.
        let mut input: &[u8] = b"{ { 1 } 2 }rest";
        assert!(skip_block(&mut input).is_ok());
        assert_eq!(input, b"rest");
    }

    #[test]
    fn test_skip_block_unmatched_brace_error() {
        // skip_block should error if the input ends before the block closes.
        let mut input: &[u8] = b"{ 1 ";
        assert!(skip_block(&mut input).is_err());
    }

    #[test]
    fn test_parse_body_item_fn_statement() {
        // parse_body_item should dispatch to parse_fn_statement.
        let mut env = Env::new();
        let mut input: &[u8] = b"fn f() => 1; rest";
        assert_eq!(parse_body_item(&mut input, &mut env), Ok(0));
        assert!(env.functions.contains_key("f"));
    }

    #[test]
    fn test_parse_body_item_let_statement() {
        // parse_body_item should dispatch to parse_let_statement.
        let mut env = Env::new();
        let mut input: &[u8] = b"let x = 5; rest";
        assert_eq!(parse_body_item(&mut input, &mut env), Ok(5));
    }

    #[test]
    fn test_parse_body_item_if_statement() {
        // parse_body_item should dispatch to parse_if_statement.
        let mut env = Env::new();
        let mut input: &[u8] = b"if (true) 1 else 2";
        assert_eq!(parse_body_item(&mut input, &mut env), Ok(1));
    }

    #[test]
    fn test_parse_body_item_for_statement() {
        // parse_body_item should dispatch to parse_for_statement.
        let mut env = Env::new();
        let mut input: &[u8] = b"for (i in 0..3) {}";
        assert_eq!(parse_body_item(&mut input, &mut env), Ok(0));
    }

    #[test]
    fn test_parse_if_statement_true_with_else_skips_else_block() {
        // When the condition is true, the else branch should be skipped (not executed).
        let mut env = Env::new();
        let mut input: &[u8] = b"if (true) 1 else { 2 } rest";
        assert_eq!(parse_if_statement(&mut input, &mut env), Ok(1));
        assert_eq!(input, b" rest");
    }

    #[test]
    fn test_parse_if_statement_false_without_else_returns_zero() {
        // When the condition is false and there's no else branch, the result is 0.
        let mut env = Env::new();
        let mut input: &[u8] = b"if (false) 1";
        assert_eq!(parse_if_statement(&mut input, &mut env), Ok(0));
    }

    #[test]
    fn test_skip_body_item_for_statement() {
        // skip_body_item should skip over an entire 'for' loop body item.
        let mut input: &[u8] = b"for (i in 0..5) { x = x + i; } rest";
        assert!(skip_body_item(&mut input).is_ok());
    }

    #[test]
    fn test_skip_body_item_tracks_nested_braces() {
        // skip_body_item should track nested '{'/'}' depth for non-block items.
        let mut input: &[u8] = b"if (a) { b } else { c }; rest";
        assert!(skip_body_item(&mut input).is_ok());
    }

    #[test]
    fn test_division_expression() {
        // Plain division (non-zero divisor) should compute the result.
        assert_eq!(execute_tuff("10 / 2"), Ok(5));
    }

    #[test]
    fn test_if_statement_true_without_trailing_else() {
        // 'if' statement with a true condition and no 'else' branch at all.
        assert_eq!(execute_tuff("if (true) { 1 }"), Ok(0));
    }
}

#[cfg(not(test))]
fn main() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out = stdout.lock();

    println!("Tuff REPL (type 'quit' to exit)");

    loop {
        write!(out, "> ").unwrap();
        out.flush().unwrap();

        let line = stdin.lock().lines().next().unwrap().unwrap();

        if line.trim() == "quit" {
            break;
        }

        if line.trim().is_empty() {
            continue;
        }

        match execute_tuff(&line) {
            Ok(result) => println!("= {}", result),
            Err(e) => println!("error: {}", e),
        }
    }
}
