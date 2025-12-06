/// Helper function to parse a stored function value into (params, return_type, body)
pub fn parse_fn_value(fn_value: &str) -> (Option<&str>, &str, &str, &str) {
    // Support either "params|ret|body" or "captures|params|ret|body"
    let parts: Vec<&str> = fn_value.splitn(4, '|').collect();
    if parts.len() == 4 {
        let p0 = parts.first().copied().unwrap_or("");
        let p1 = parts.get(1).copied().unwrap_or("");
        let p2 = parts.get(2).copied().unwrap_or("");
        let p3 = parts.get(3).copied().unwrap_or("");
        (Some(p0), p1, p2, p3)
    } else {
        let params = parts.first().copied().unwrap_or("");
        let return_type = parts.get(1).copied().unwrap_or("");
        let body = parts.get(2).copied().unwrap_or("");
        (None, params, return_type, body)
    }
}

/// Extract parameter names from a params string like "a: I32, b: I32"
pub fn extract_param_names(params_part: &str) -> Vec<String> {
    let mut param_names = Vec::new();
    if !params_part.is_empty() {
        for p in params_part.split(',') {
            let n = p.split(':').next().unwrap_or("").trim();
            if !n.is_empty() {
                param_names.push(n.to_string());
            }
        }
    }
    param_names
}
