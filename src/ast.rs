/// A single term in a flat expression: the operator that introduces it
/// (the first term uses `+`) and its value.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Term {
    pub op: char,
    pub value: i64,
}
