pub fn build_ptr_components(
    pointee_opt: Option<&String>,
    target: &str,
    is_mutref: bool,
) -> (String, Option<String>) {
    let pointee = pointee_opt.cloned().unwrap_or_default();
    let ptr_val = format!("__PTR__:{}|{}", pointee, target);
    let ptr_suffix = if pointee.is_empty() {
        if is_mutref {
            Some("*mut".to_string())
        } else {
            Some("*".to_string())
        }
    } else if is_mutref {
        Some(format!("*mut {}", pointee))
    } else {
        Some(format!("*{}", pointee))
    };
    (ptr_val, ptr_suffix)
}
