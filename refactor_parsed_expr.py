import re

# Read the file
with open("selfhost/tuffc_lib.tuff", "r") as f:
    lines = f.readlines()

# Track current function
current_function = None
for i, line in enumerate(lines):
    # Track current function
    if line.strip().startswith("fn "):
        match = re.search(r"fn (\w+)\(", line)
        if match:
            current_function = match.group(1)

    # Only process in these specific functions
    expr_parser_funcs = [
        "parse_or",
        "parse_and",
        "parse_cmp",
        "parse_add",
        "parse_mul",
        "parse_unary",
        "parse_postfix",
        "parse_arg_list",
        "parse_primary",
        "parse_block_expr",
        "parse_if_expr",
        "parse_match_expr",
        "parse_stmt",
        "parse_block_body",
    ]
    if current_function in expr_parser_funcs:
        # Replace for specific variables that ONLY hold ParsedExpr
        line = re.sub(r"\bleft\.v1\b", "left.nextPos", line)
        line = re.sub(r"\bleft\.v0\b", "left.js", line)
        line = re.sub(r"\brhs\.v1\b", "rhs.nextPos", line)
        line = re.sub(r"\brhs\.v0\b", "rhs.js", line)
        line = re.sub(r"\binner\.v1\b", "inner.nextPos", line)
        line = re.sub(r"\binner\.v0\b", "inner.js", line)
        line = re.sub(r"\bargs\.v1\b", "args.nextPos", line)
        line = re.sub(r"\bargs\.v0\b", "args.js", line)
        line = re.sub(r"\bidx\.v1\b", "idx.nextPos", line)
        line = re.sub(r"\bidx\.v0\b", "idx.js", line)
        # For these functions specifically, also handle: e, expr, cond, thenE, elseE, tail, arm, first
        line = re.sub(r"\be\.v1\b", "e.nextPos", line)
        line = re.sub(r"\be\.v0\b", "e.js", line)
        line = re.sub(r"\bexpr\.v1\b", "expr.nextPos", line)
        line = re.sub(r"\bexpr\.v0\b", "expr.js", line)
        line = re.sub(r"\bcond\.v1\b", "cond.nextPos", line)
        line = re.sub(r"\bcond\.v0\b", "cond.js", line)
        line = re.sub(r"\bthenE\.v1\b", "thenE.nextPos", line)
        line = re.sub(r"\bthenE\.v0\b", "thenE.js", line)
        line = re.sub(r"\belseE\.v1\b", "elseE.nextPos", line)
        line = re.sub(r"\belseE\.v0\b", "elseE.js", line)
        line = re.sub(r"\btail\.v1\b", "tail.nextPos", line)
        line = re.sub(r"\btail\.v0\b", "tail.js", line)
        line = re.sub(r"\barm\.v1\b", "arm.nextPos", line)
        line = re.sub(r"\barm\.v0\b", "arm.js", line)
        line = re.sub(r"\bfirst\.v1\b", "first.nextPos", line)
        line = re.sub(r"\bfirst\.v0\b", "first.js", line)
        lines[i] = line

# Also update the definition
for i, line in enumerate(lines):
    if "class fn ParsedExpr(v0, v1)" in line:
        lines[i] = "class fn ParsedExpr(js, nextPos) => {}\n"

# Write back
with open("selfhost/tuffc_lib.tuff", "w") as f:
    f.writelines(lines)

print("Refactoring complete")
