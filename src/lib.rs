mod error;
mod parser;

pub use error::Error;

use parser::Parser;

/// Interprets `input` and returns its value.
///
/// The bare minimum for now: an empty string is `0`; a non-negative
/// integer literal is its value; the boolean literals `true` and
/// `false` are `1` and `0`; a chain of literals joined by `+`,
/// `-`, or `*` (optional surrounding spaces) is evaluated with `*`
/// binding tighter than `+`/`-`; parentheses group subexpressions;
/// curly braces delimit blocks of `let` bindings ending in an
/// expression, whose value is the block's value; the top level is a
/// sequence of statements (optionally separated by `;`) whose value
/// is the value of the last statement; a `let` statement evaluates to
/// `0`; booleans
/// are distinct from integers, so `==` yields `1` only for two
/// values of the same kind (e.g. `true == 1` is `0`), while
/// arithmetic treats `true` as `1` and `false` as `0`; `==` binds
/// looser than `+`, `-`, and `*`; `||` yields `1` if either side is
/// non-zero and binds looser than `==`, `+`, `-`, and `*`; `let mut`
/// declares a mutable binding, and `name = expr` assigns to it
/// (evaluating to the assigned value); assigning to a non-`mut`
/// binding or a value of a different kind is an error; `if (cond) a
/// else b` evaluates to `a` when
/// `cond` is truthy and `b` otherwise; both branches are checked, but
/// only the chosen branch's side effects persist; as a statement, an
/// `if`'s branches may be statements (so a block branch may end in a
/// statement); `[expr, ...]` builds an array and `value[index]` reads
/// an element (indexing binds tighter than `*`, `+`, and `-`);
/// `(expr, ...)` builds a tuple and `value.N` reads its `N`th field;
/// `&name` is a reference to the binding `name`, `&mut name` is a
/// mutable reference, `*value` dereferences a reference, and
/// `*ref = expr` assigns through a mutable reference; anything else
/// is not yet supported.
pub fn interpret(input: &str) -> Result<i64, Error> {
    if input.is_empty() {
        return Ok(0);
    }
    let mut parser = Parser {
        input,
        pos: 0,
        env: Vec::new(),
    };
    parser.parse_program().map(|value| value.as_i64())
}
