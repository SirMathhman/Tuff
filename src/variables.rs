use std::collections::HashMap;

#[derive(Clone)]
pub struct VariableInfo {
    pub value: Option<i32>,
    pub type_name: String,
    pub is_mutable: bool,
    pub points_to: Option<String>, // If this is a reference, which variable does it point to?
    pub struct_fields: Option<HashMap<String, i32>>, // For struct instances
    pub function_name: Option<String>, // For function pointers, which function does it reference?
}

#[derive(Clone)]
pub struct StructDef {
    pub name: String,
    #[allow(dead_code)]
    pub fields: Vec<(String, String)>, // field_name, field_type
}

#[derive(Clone)]
pub struct FunctionDef {
    pub name: String,
    pub params: Vec<(String, String)>, // param_name, param_type
    pub return_type: String,
    pub body: String, // Store the expression as a string for lazy evaluation
}

pub type Environment = HashMap<String, VariableInfo>;
pub type StructRegistry = HashMap<String, StructDef>;
pub type FunctionRegistry = HashMap<String, FunctionDef>;

// Thread-local storage for struct registry
thread_local! {
    static STRUCT_REGISTRY: std::cell::RefCell<StructRegistry> = std::cell::RefCell::new(StructRegistry::new());
    static FUNCTION_REGISTRY: std::cell::RefCell<FunctionRegistry> = std::cell::RefCell::new(FunctionRegistry::new());
}

#[allow(dead_code)]
pub fn register_struct(def: StructDef) {
    STRUCT_REGISTRY.with(|sr| sr.borrow_mut().insert(def.name.clone(), def));
}

#[allow(dead_code)]
pub fn get_struct_registry() -> StructRegistry {
    STRUCT_REGISTRY.with(|sr| sr.borrow().clone())
}

#[allow(dead_code)]
pub fn clear_struct_registry() {
    STRUCT_REGISTRY.with(|sr| sr.borrow_mut().clear());
}

#[allow(dead_code)]
pub fn register_function(def: FunctionDef) {
    FUNCTION_REGISTRY.with(|fr| fr.borrow_mut().insert(def.name.clone(), def));
}

#[allow(dead_code)]
pub fn get_function_registry() -> FunctionRegistry {
    FUNCTION_REGISTRY.with(|fr| fr.borrow().clone())
}

#[allow(dead_code)]
pub fn get_function(name: &str) -> Option<FunctionDef> {
    FUNCTION_REGISTRY.with(|fr| fr.borrow().get(name).cloned())
}

#[allow(dead_code)]
pub fn clear_function_registry() {
    FUNCTION_REGISTRY.with(|fr| fr.borrow_mut().clear());
}

pub fn is_type_compatible(declared: &str, actual: &str) -> bool {
    if actual.is_empty() || declared.is_empty() {
        return true;
    }

    if declared == actual {
        return true;
    }

    // Extract base types (remove leading *)
    let declared_base = declared.trim_start_matches('*');
    let actual_base = actual.trim_start_matches('*');

    // Count pointer levels
    let declared_ptr_level = declared.len() - declared_base.len();
    let actual_ptr_level = actual.len() - actual_base.len();

    // Pointer types must match in level
    if declared_ptr_level != actual_ptr_level {
        return false;
    }

    let widening_rules = [
        ("U16", &["U8"][..]),
        ("U32", &["U8", "U16"][..]),
        ("U64", &["U8", "U16", "U32"][..]),
        ("I16", &["I8"][..]),
        ("I32", &["I8", "I16"][..]),
        ("I64", &["I8", "I16", "I32"][..]),
    ];

    for (larger_type, smaller_types) in &widening_rules {
        if declared_base == *larger_type && smaller_types.contains(&actual_base) {
            return true;
        }
    }

    false
}
