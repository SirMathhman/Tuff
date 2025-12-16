import re

with open("src/main/tuff/compiler/ast.tuff", "r", encoding="utf-8") as f:
    content = f.read()

# Remove "tag: String," lines
content = re.sub(r"^\s*tag:\s*String,\s*\n", "", content, flags=re.MULTILINE)

# Remove tag literals from constructors: StructName { "Tag", ... } -> StructName { ... }
content = re.sub(r'(\w+)\s*\{\s*"[^"]+",\s*', r"\1 { ", content)

# Remove _kind helper functions
lines = content.split("\n")
filtered = []
for line in lines:
    if (
        "out fn type_kind" in line
        or "out fn expr_kind" in line
        or "out fn stmt_kind" in line
        or "out fn decl_kind" in line
    ):
        continue
    filtered.append(line)

content = "\n".join(filtered)

with open("src/main/tuff/compiler/ast.tuff", "w", encoding="utf-8") as f:
    f.write(content)

print("Removed tag fields from variant structs")
