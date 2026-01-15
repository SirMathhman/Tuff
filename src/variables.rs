use std::collections::HashMap;

#[derive(Clone)]
pub struct VariableInfo {
    pub value: Option<i32>,
    pub type_name: String,
    pub is_mutable: bool,
}

pub type Environment = HashMap<String, VariableInfo>;

pub fn is_type_compatible(declared: &str, actual: &str) -> bool {
    if actual.is_empty() {
        return true;
    }

    if declared == actual {
        return true;
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
        if declared == *larger_type && smaller_types.contains(&actual) {
            return true;
        }
    }

    false
}
