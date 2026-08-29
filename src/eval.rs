use crate::ast::Term;

/// Evaluate a flat list of terms with `*` binding tighter than `+`/`-`.
///
/// Pass 1 folds each `*` term into the value of the preceding term;
/// pass 2 folds the remaining `+`/`-` terms left to right.
pub fn fold_terms(terms: &[Term]) -> i64 {
    // Pass 1: fold * into terms
    let mut folded: Vec<Term> = Vec::new();
    for term in terms {
        if term.op == '*' {
            if let Some(prev) = folded.last_mut() {
                prev.value *= term.value;
            }
        } else {
            folded.push(term.clone());
        }
    }
    // Pass 2: fold + and -
    folded.iter().fold(0i64, |total, term| match term.op {
        '+' => total + term.value,
        '-' => total - term.value,
        _ => unreachable!(),
    })
}
