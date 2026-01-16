use std::collections::HashMap;

#[derive(Clone)]
pub struct VariableInfo {
    pub value: Option<i32>,
    pub type_name: String,
    pub is_mutable: bool,
    pub points_to: Option<String>, // If this is a reference, which variable does it point to?
}

pub type Environment = HashMap<String, VariableInfo>;

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
