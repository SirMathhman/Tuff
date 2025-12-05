use std::collections::HashMap;
use std::fmt;
use crate::ast::Type;

#[derive(Debug, Clone)]
pub struct FunctionSignature {
    pub params: Vec<Type>,
    pub return_type: Type,
}

#[derive(Debug, Clone)]
pub enum Value {
    Number(f64),
    String(String),
    Boolean(bool),
    Null,
    Array(Vec<Value>),
    Function {
        params: Vec<String>,
        body: Vec<crate::ast::Stmt>,
        closure: Environment,
    },
}

impl fmt::Display for Value {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Value::Number(n) => {
                if n.fract() == 0.0 {
                    write!(f, "{}", *n as i64)
                } else {
                    write!(f, "{}", n)
                }
            }
            Value::String(s) => write!(f, "{}", s),
            Value::Boolean(b) => write!(f, "{}", b),
            Value::Null => write!(f, "null"),
            Value::Array(arr) => {
                let items: Vec<String> = arr.iter().map(|v| v.to_string()).collect();
                write!(f, "[{}]", items.join(", "))
            }
            Value::Function { .. } => write!(f, "<function>"),
        }
    }
}

impl Value {
    pub fn is_truthy(&self) -> bool {
        match self {
            Value::Boolean(b) => *b,
            Value::Null => false,
            Value::Number(n) => *n != 0.0,
            Value::String(s) => !s.is_empty(),
            _ => true,
        }
    }

    pub fn to_number(&self) -> Result<f64, String> {
        match self {
            Value::Number(n) => Ok(*n),
            Value::Boolean(b) => Ok(if *b { 1.0 } else { 0.0 }),
            Value::String(s) => s
                .parse::<f64>()
                .map_err(|_| "Cannot convert string to number".to_string()),
            Value::Null => Ok(0.0),
            _ => Err("Cannot convert to number".to_string()),
        }
    }

    pub fn to_string_value(&self) -> String {
        match self {
            Value::String(s) => s.clone(),
            _ => self.to_string(),
        }
    }

    /// Infer the Type of a Value
    pub fn infer_type(&self) -> Type {
        match self {
            Value::Number(n) => {
                // If it's a whole number, infer I32; otherwise F64
                if n.fract() == 0.0 && *n >= i32::MIN as f64 && *n <= i32::MAX as f64 {
                    Type::I32
                } else {
                    Type::F64
                }
            }
            Value::String(_) => Type::String,
            Value::Boolean(_) => Type::Bool,
            Value::Null => Type::Void,
            Value::Array(_) => Type::Generic("Array".to_string(), vec![Type::Void]),
            Value::Function { .. } => Type::Void, // Functions have explicit types
        }
    }

    /// Check if this value's type is compatible with the expected type
    pub fn is_compatible_with(&self, expected: &Type) -> bool {
        let actual = self.infer_type();
        type_compatibility(&actual, expected)
    }
}

/// Check if an actual type is compatible with (can be used as) an expected type
fn type_compatibility(actual: &Type, expected: &Type) -> bool {
    // Same types are compatible
    if actual == expected {
        return true;
    }

    // TypeParameter("I32") should match Type::I32 (and others by name)
    match expected {
        Type::TypeParameter(param_name) => {
            // Compare by stringified actual type against the parameter name
            match actual {
                Type::I8 if param_name == "I8" => return true,
                Type::I16 if param_name == "I16" => return true,
                Type::I32 if param_name == "I32" => return true,
                Type::I64 if param_name == "I64" => return true,
                Type::U8 if param_name == "U8" => return true,
                Type::U16 if param_name == "U16" => return true,
                Type::U32 if param_name == "U32" => return true,
                Type::U64 if param_name == "U64" => return true,
                Type::F32 if param_name == "F32" => return true,
                Type::F64 if param_name == "F64" => return true,
                Type::Bool if param_name == "Bool" => return true,
                Type::String if param_name == "String" => return true,
                Type::Void if param_name == "Void" => return true,
                _ => {}
            }
            return false;
        }
        _ => {}
    }

    // Allow numeric coercion: smaller ints can be used as larger ints, etc.
    match (actual, expected) {
        // Int to Int coercion (allow "promotion" to larger types)
        (Type::I8, Type::I16 | Type::I32 | Type::I64) => true,
        (Type::I16, Type::I32 | Type::I64) => true,
        (Type::I32, Type::I64) => true,
        (Type::U8, Type::U16 | Type::U32 | Type::U64) => true,
        (Type::U16, Type::U32 | Type::U64) => true,
        (Type::U32, Type::U64) => true,
        // Float compatibility
        (Type::F32, Type::F64) => true,
        // Int to Float
        (Type::I32 | Type::I64 | Type::F32, Type::F64) => true,
        // All else is incompatible
        _ => false,
    }
}

#[derive(Debug, Clone)]
pub struct Environment {
    scopes: Vec<HashMap<String, Value>>,
    type_scopes: Vec<HashMap<String, Type>>, // Track declared types
    function_sigs: HashMap<String, FunctionSignature>, // Track function signatures
}

impl Environment {
    pub fn new() -> Self {
        Environment {
            scopes: vec![HashMap::new()],
            type_scopes: vec![HashMap::new()],
            function_sigs: HashMap::new(),
        }
    }

    pub fn push_scope(&mut self) {
        self.scopes.push(HashMap::new());
        self.type_scopes.push(HashMap::new());
    }

    pub fn pop_scope(&mut self) {
        if self.scopes.len() > 1 {
            self.scopes.pop();
            self.type_scopes.pop();
        }
    }

    pub fn define(&mut self, name: String, value: Value) {
        if let Some(scope) = self.scopes.last_mut() {
            scope.insert(name, value);
        }
    }

    /// Define a function with its signature
    pub fn define_function(
        &mut self,
        name: String,
        value: Value,
        sig: FunctionSignature,
    ) {
        self.define(name.clone(), value);
        self.function_sigs.insert(name, sig);
    }

    /// Get function signature if it exists
    pub fn get_function_sig(&self, name: &str) -> Option<FunctionSignature> {
        self.function_sigs.get(name).cloned()
    }

    /// Define a variable with an explicit type
    pub fn define_typed(&mut self, name: String, value: Value, ty: Type) -> Result<(), String> {
        // Check type compatibility
        if !value.is_compatible_with(&ty) {
            return Err(format!(
                "Type mismatch: expected {:?}, got {:?}",
                ty,
                value.infer_type()
            ));
        }

        if let Some(scope) = self.scopes.last_mut() {
            scope.insert(name.clone(), value);
        }
        if let Some(type_scope) = self.type_scopes.last_mut() {
            type_scope.insert(name, ty);
        }
        Ok(())
    }

    pub fn get(&self, name: &str) -> Option<Value> {
        for scope in self.scopes.iter().rev() {
            if let Some(value) = scope.get(name) {
                return Some(value.clone());
            }
        }
        None
    }

    /// Get the declared type of a variable (if explicitly typed)
    pub fn get_type(&self, name: &str) -> Option<Type> {
        for type_scope in self.type_scopes.iter().rev() {
            if let Some(ty) = type_scope.get(name) {
                return Some(ty.clone());
            }
        }
        None
    }

    pub fn set(&mut self, name: &str, value: Value) -> Result<(), String> {
        for scope in self.scopes.iter_mut().rev() {
            if scope.contains_key(name) {
                scope.insert(name.to_string(), value);
                return Ok(());
            }
        }
        // If not found, define in current scope
        self.define(name.to_string(), value);
        Ok(())
    }

    /// Set with type checking against declared type
    pub fn set_typed(&mut self, name: &str, value: Value) -> Result<(), String> {
        // Check if variable has a declared type
        if let Some(expected_type) = self.get_type(name) {
            if !value.is_compatible_with(&expected_type) {
                return Err(format!(
                    "Type mismatch for variable '{}': expected {:?}, got {:?}",
                    name,
                    expected_type,
                    value.infer_type()
                ));
            }
        }
        self.set(name, value)
    }
}

pub enum EvalResult {
    Value(Value),
    Return(Value),
    Break,
    Continue,
}

pub struct Evaluator {
    env: Environment,
    expected_return_type: Option<Type>, // Track expected return type in functions
}

impl Evaluator {
    pub fn new() -> Self {
        Evaluator {
            env: Environment::new(),
            expected_return_type: None,
        }
    }

    pub fn eval_program(&mut self, program: &crate::ast::Program) -> Result<Value, String> {
        let mut last_value = Value::Null;
        for stmt in &program.statements {
            match self.eval_statement(stmt)? {
                EvalResult::Value(val) => last_value = val,
                EvalResult::Return(val) => return Ok(val),
                EvalResult::Break | EvalResult::Continue => {
                    return Err("break/continue outside loop".to_string())
                }
            }
        }
        Ok(last_value)
    }

    fn eval_statement(&mut self, stmt: &crate::ast::Stmt) -> Result<EvalResult, String> {
        use crate::ast::Stmt;
        match stmt {
            Stmt::Expression(expr) => {
                let val = self.eval_expression(expr)?;
                Ok(EvalResult::Value(val))
            }
            Stmt::Assign { name, value } => {
                let val = self.eval_expression(value)?;
                self.env.set(name, val.clone())?;
                Ok(EvalResult::Value(val))
            }
            Stmt::Let { name, ty, value } => {
                let val = match value {
                    Some(expr) => self.eval_expression(expr)?,
                    None => Value::Null,
                };

                // If type is explicitly declared, check compatibility
                if let Some(declared_type) = ty {
                    self.env.define_typed(name.clone(), val, declared_type.clone())?;
                } else {
                    // No explicit type - just define the value
                    self.env.define(name.clone(), val);
                }
                Ok(EvalResult::Value(Value::Null))
            }
            Stmt::Function {
                name,
                type_params: _,
                params,
                return_type,
                body,
            } => {
                let param_names: Vec<String> = params.iter().map(|(n, _)| n.clone()).collect();
                let param_types: Vec<Type> = params.iter().map(|(_, t)| t.clone()).collect();
                
                let func = Value::Function {
                    params: param_names,
                    body: body.clone(),
                    closure: self.env.clone(),
                };

                let sig = FunctionSignature {
                    params: param_types,
                    return_type: return_type.clone(),
                };

                self.env.define_function(name.clone(), func, sig);
                Ok(EvalResult::Value(Value::Null))
            }
            Stmt::If {
                condition,
                then_body,
                else_body,
            } => {
                let cond_val = self.eval_expression(condition)?;
                // Type check: condition must be boolean or truthy
                match &cond_val {
                    Value::Boolean(_) => {
                        // Ideal case - condition is explicitly boolean
                    }
                    Value::Number(n) if *n == 0.0 => {
                        // Numeric 0 is falsy - allow but should be bool
                    }
                    Value::Number(n) if *n != 0.0 => {
                        // Numeric non-zero is truthy - allow but should be bool
                    }
                    Value::String(_) | Value::Null => {
                        // String/Null are truthy/falsy - allow but should be bool
                    }
                    _ => {
                        return Err(format!(
                            "If condition must be boolean, got {:?}",
                            cond_val.infer_type()
                        ))
                    }
                }

                if cond_val.is_truthy() {
                    self.eval_block(then_body)
                } else if let Some(else_stmts) = else_body {
                    self.eval_block(else_stmts)
                } else {
                    Ok(EvalResult::Value(Value::Null))
                }
            }
            Stmt::While { condition, body } => {
                let mut last_val = Value::Null;
                loop {
                    let cond_val = self.eval_expression(condition)?;
                    // Type check: condition must be boolean or truthy
                    match &cond_val {
                        Value::Boolean(_) => {
                            // Ideal case - condition is explicitly boolean
                        }
                        Value::Number(n) if *n == 0.0 => {
                            // Numeric 0 is falsy - allow but should be bool
                        }
                        Value::Number(n) if *n != 0.0 => {
                            // Numeric non-zero is truthy - allow but should be bool
                        }
                        Value::String(_) | Value::Null => {
                            // String/Null are truthy/falsy - allow but should be bool
                        }
                        _ => {
                            return Err(format!(
                                "While condition must be boolean, got {:?}",
                                cond_val.infer_type()
                            ))
                        }
                    }

                    if !cond_val.is_truthy() {
                        break;
                    }
                    match self.eval_block(body)? {
                        EvalResult::Return(val) => return Ok(EvalResult::Return(val)),
                        EvalResult::Break => break,
                        EvalResult::Continue => continue,
                        EvalResult::Value(val) => last_val = val,
                    }
                }
                Ok(EvalResult::Value(last_val))
            }
            Stmt::For { var, iter, body } => {
                let iter_val = self.eval_expression(iter)?;
                let mut last_val = Value::Null;

                match iter_val {
                    Value::Array(arr) => {
                        for elem in arr {
                            self.env.define(var.clone(), elem);
                            match self.eval_block(body)? {
                                EvalResult::Return(val) => return Ok(EvalResult::Return(val)),
                                EvalResult::Break => break,
                                EvalResult::Continue => continue,
                                EvalResult::Value(val) => last_val = val,
                            }
                        }
                    }
                    Value::String(s) => {
                        for ch in s.chars() {
                            self.env.define(var.clone(), Value::String(ch.to_string()));
                            match self.eval_block(body)? {
                                EvalResult::Return(val) => return Ok(EvalResult::Return(val)),
                                EvalResult::Break => break,
                                EvalResult::Continue => continue,
                                EvalResult::Value(val) => last_val = val,
                            }
                        }
                    }
                    _ => return Err("for loop requires array or string".to_string()),
                }
                Ok(EvalResult::Value(last_val))
            }
            Stmt::Return(expr) => {
                let val = match expr {
                    Some(e) => self.eval_expression(e)?,
                    None => Value::Null,
                };

                // Type check: validate return value against expected return type
                if let Some(expected_type) = &self.expected_return_type {
                    if !val.is_compatible_with(expected_type) {
                        return Err(format!(
                            "Return type mismatch: expected {:?}, got {:?}",
                            expected_type,
                            val.infer_type()
                        ));
                    }
                }

                Ok(EvalResult::Return(val))
            }
            Stmt::Block(stmts) => self.eval_block(stmts),
        }
    }

    fn eval_block(&mut self, stmts: &[crate::ast::Stmt]) -> Result<EvalResult, String> {
        self.env.push_scope();
        let mut last_value = Value::Null;
        for stmt in stmts {
            match self.eval_statement(stmt)? {
                EvalResult::Value(val) => last_value = val,
                result => {
                    self.env.pop_scope();
                    return Ok(result);
                }
            }
        }
        self.env.pop_scope();
        Ok(EvalResult::Value(last_value))
    }

    fn eval_expression(&mut self, expr: &crate::ast::Expr) -> Result<Value, String> {
        use crate::ast::Expr;
        match expr {
            Expr::Number(n) => Ok(Value::Number(*n)),
            Expr::String(s) => Ok(Value::String(s.clone())),
            Expr::Boolean(b) => Ok(Value::Boolean(*b)),
            Expr::Null => Ok(Value::Null),
            Expr::Identifier(name) => self
                .env
                .get(name)
                .ok_or_else(|| format!("Undefined variable: {}", name)),
            Expr::Binary { left, op, right } => {
                let left_val = self.eval_expression(left)?;
                let right_val = self.eval_expression(right)?;
                self.eval_binary_op(&left_val, op, &right_val)
            }
            Expr::Unary { op, operand } => {
                let val = self.eval_expression(operand)?;
                self.eval_unary_op(op, &val)
            }
            Expr::Call { func, args } => {
                let func_val = self.eval_expression(func)?;
                let mut arg_vals = Vec::new();
                for arg in args {
                    arg_vals.push(self.eval_expression(arg)?);
                }
                // Extract function name if it's an identifier for signature lookup
                let func_name = if let Expr::Identifier(name) = &**func {
                    Some(name.as_str())
                } else {
                    None
                };
                self.call_function(&func_val, arg_vals, func_name)
            }
            Expr::Array(elements) => {
                let mut arr = Vec::new();
                for elem in elements {
                    arr.push(self.eval_expression(elem)?);
                }
                Ok(Value::Array(arr))
            }
            Expr::Index { object, index } => {
                let obj = self.eval_expression(object)?;
                let idx = self.eval_expression(index)?;
                match (&obj, &idx) {
                    (Value::Array(arr), Value::Number(n)) => {
                        let index = *n as usize;
                        Ok(arr.get(index).cloned().unwrap_or(Value::Null))
                    }
                    (Value::String(s), Value::Number(n)) => {
                        let index = *n as usize;
                        Ok(s.chars()
                            .nth(index)
                            .map(|c| Value::String(c.to_string()))
                            .unwrap_or(Value::Null))
                    }
                    _ => Err("Invalid indexing".to_string()),
                }
            }
            Expr::Ternary {
                condition,
                then_expr,
                else_expr,
            } => {
                let cond = self.eval_expression(condition)?;
                if cond.is_truthy() {
                    self.eval_expression(then_expr)
                } else {
                    self.eval_expression(else_expr)
                }
            }
        }
    }

    fn eval_binary_op(
        &self,
        left: &Value,
        op: &crate::ast::BinOp,
        right: &Value,
    ) -> Result<Value, String> {
        use crate::ast::BinOp;

        let left_type = left.infer_type();
        let right_type = right.infer_type();

        // Type check for different operation categories
        match op {
            BinOp::Add | BinOp::Subtract | BinOp::Multiply | BinOp::Divide | BinOp::Modulo => {
                // Arithmetic operations require numeric types or compatible types
                match (left, right) {
                    (Value::Number(_), Value::Number(_)) => {},
                    (Value::String(_), Value::String(_)) if matches!(op, BinOp::Add) => {
                        // String concatenation is allowed
                    },
                    _ => {
                        return Err(format!(
                            "Invalid operands for {:?}: {:?} and {:?}",
                            op, left_type, right_type
                        ))
                    }
                }
            }
            BinOp::Equal | BinOp::NotEqual => {
                // These operations work on matching types
                if left_type != right_type {
                    // Allow comparison between compatible numeric types
                    match (&left_type, &right_type) {
                        (Type::I32 | Type::I64 | Type::F32 | Type::F64,
                         Type::I32 | Type::I64 | Type::F32 | Type::F64) => {},
                        _ => {
                            return Err(format!(
                                "Cannot compare {:?} and {:?}",
                                left_type, right_type
                            ))
                        }
                    }
                }
            }
            BinOp::Less | BinOp::LessEqual | BinOp::Greater | BinOp::GreaterEqual => {
                // Comparison operations require numeric types
                match (left, right) {
                    (Value::Number(_), Value::Number(_)) => {},
                    (Value::String(_), Value::String(_)) => {},
                    _ => {
                        return Err(format!(
                            "Cannot compare {:?} and {:?} with {:?}",
                            left_type, right_type, op
                        ))
                    }
                }
            }
            BinOp::And | BinOp::Or => {
                // Logical operations work on truthy values (no strict type check)
            }
        }

        match op {
            BinOp::Add => match (left, right) {
                (Value::Number(l), Value::Number(r)) => Ok(Value::Number(l + r)),
                (Value::String(l), Value::String(r)) => Ok(Value::String(format!("{}{}", l, r))),
                (Value::String(l), r) => Ok(Value::String(format!("{}{}", l, r))),
                (l, Value::String(r)) => Ok(Value::String(format!("{}{}", l, r))),
                _ => Err("Invalid operands for +".to_string()),
            },
            BinOp::Subtract => {
                let l = left.to_number()?;
                let r = right.to_number()?;
                Ok(Value::Number(l - r))
            }
            BinOp::Multiply => {
                let l = left.to_number()?;
                let r = right.to_number()?;
                Ok(Value::Number(l * r))
            }
            BinOp::Divide => {
                let l = left.to_number()?;
                let r = right.to_number()?;
                if r == 0.0 {
                    Err("Division by zero".to_string())
                } else {
                    Ok(Value::Number(l / r))
                }
            }
            BinOp::Modulo => {
                let l = left.to_number()?;
                let r = right.to_number()?;
                if r == 0.0 {
                    Err("Modulo by zero".to_string())
                } else {
                    Ok(Value::Number(l % r))
                }
            }
            BinOp::Equal => Ok(Value::Boolean(self.values_equal(left, right))),
            BinOp::NotEqual => Ok(Value::Boolean(!self.values_equal(left, right))),
            BinOp::Less => {
                let l = left.to_number()?;
                let r = right.to_number()?;
                Ok(Value::Boolean(l < r))
            }
            BinOp::LessEqual => {
                let l = left.to_number()?;
                let r = right.to_number()?;
                Ok(Value::Boolean(l <= r))
            }
            BinOp::Greater => {
                let l = left.to_number()?;
                let r = right.to_number()?;
                Ok(Value::Boolean(l > r))
            }
            BinOp::GreaterEqual => {
                let l = left.to_number()?;
                let r = right.to_number()?;
                Ok(Value::Boolean(l >= r))
            }
            BinOp::And => Ok(Value::Boolean(left.is_truthy() && right.is_truthy())),
            BinOp::Or => Ok(Value::Boolean(left.is_truthy() || right.is_truthy())),
        }
    }

    fn eval_unary_op(&self, op: &crate::ast::UnaryOp, operand: &Value) -> Result<Value, String> {
        use crate::ast::UnaryOp;
        match op {
            UnaryOp::Negate => {
                let n = operand.to_number()?;
                Ok(Value::Number(-n))
            }
            UnaryOp::Not => Ok(Value::Boolean(!operand.is_truthy())),
        }
    }

    fn values_equal(&self, left: &Value, right: &Value) -> bool {
        match (left, right) {
            (Value::Number(l), Value::Number(r)) => l == r,
            (Value::String(l), Value::String(r)) => l == r,
            (Value::Boolean(l), Value::Boolean(r)) => l == r,
            (Value::Null, Value::Null) => true,
            _ => false,
        }
    }

    fn call_function(&mut self, func: &Value, args: Vec<Value>, func_name: Option<&str>) -> Result<Value, String> {
        match func {
            Value::Function {
                params,
                body,
                closure,
            } => {
                if args.len() != params.len() {
                    return Err(format!(
                        "Function expects {} arguments, got {}",
                        params.len(),
                        args.len()
                    ));
                }

                // Save current environment, return type, and use function's closure
                let saved_env = std::mem::replace(&mut self.env, closure.clone());
                let saved_return_type = self.expected_return_type.clone();

                // Look up function signature if available for type validation
                let mut sig_params = None;
                if let Some(name) = func_name {
                    if let Some(sig) = saved_env.get_function_sig(name) {
                        self.expected_return_type = Some(sig.return_type);
                        sig_params = Some(sig.params);
                    }
                }

                self.env.push_scope();

                // Bind arguments to parameters with type validation
                for (i, (param, arg)) in params.iter().zip(args.iter()).enumerate() {
                    // Validate argument type if signature has type information
                    if let Some(ref sig_params) = sig_params {
                        if i < sig_params.len() {
                            let arg_type = arg.infer_type();
                            let expected_type = &sig_params[i];
                            if !type_compatibility(&arg_type, expected_type) {
                                return Err(format!(
                                    "Argument {} has type {:?}, expected {:?}",
                                    i, arg_type, expected_type
                                ));
                            }
                        }
                    }
                    self.env.define(param.clone(), arg.clone());
                }

                // Execute function body
                let mut result = Value::Null;
                for stmt in body {
                    match self.eval_statement(stmt)? {
                        EvalResult::Value(val) => result = val,
                        EvalResult::Return(val) => {
                            result = val;
                            break;
                        }
                        _ => return Err("Unexpected control flow in function".to_string()),
                    }
                }

                // Restore environment and return type
                self.env = saved_env;
                self.expected_return_type = saved_return_type;
                Ok(result)
            }
            _ => Err("Attempting to call non-function".to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_value_display() {
        assert_eq!(Value::Number(42.0).to_string(), "42");
        assert_eq!(Value::Number(3.14).to_string(), "3.14");
        assert_eq!(Value::String("hello".to_string()).to_string(), "hello");
        assert_eq!(Value::Boolean(true).to_string(), "true");
        assert_eq!(Value::Null.to_string(), "null");
    }

    #[test]
    fn test_is_truthy() {
        assert!(Value::Boolean(true).is_truthy());
        assert!(!Value::Boolean(false).is_truthy());
        assert!(!Value::Null.is_truthy());
        assert!(Value::Number(1.0).is_truthy());
        assert!(!Value::Number(0.0).is_truthy());
        assert!(Value::String("hi".to_string()).is_truthy());
        assert!(!Value::String("".to_string()).is_truthy());
    }
}
