/// Find the index of the closing brace that matches an opening brace at `open_brace_idx`.
/// Returns the index of the closing brace or None if not found.
pub fn find_matching_brace(s: &str, open_brace_idx: usize) -> Option<usize> {
    let mut depth = 0isize;
    let mut closing = None;
    for (i, ch) in s[open_brace_idx..].char_indices() {
        match ch {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    closing = Some(open_brace_idx + i);
                    break;
                }
            }
            _ => {}
        }
    }
    closing
}

/// Find the arrow position and matching braces for a function definition.
///
/// For a string like "fn name(...) : Type => { body }", finds:
/// - The position of "=>"
/// - The position of the opening '{' after '=>'
/// - The position of the matching closing '}'
///
/// Returns (arrow_pos, open_brace_idx, close_brace_idx) or None if pattern not found.
pub fn find_fn_arrow_and_braces(s: &str) -> Option<(usize, usize, usize)> {
    if let Some(arrow_pos) = s.find("=>") {
        if let Some(open_brace_rel) = s[arrow_pos + 2..].find('{') {
            let open_brace = arrow_pos + 2 + open_brace_rel;
            if let Some(close_brace) = find_matching_brace(s, open_brace) {
                return Some((arrow_pos, open_brace, close_brace));
            }
        }
    }
    None
}
