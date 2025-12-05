# Tuff

This repository contains a minimal Rust library crate with one function `interpret`.

Pre-commit hook
- This project includes a versioned git pre-commit hook in `.githooks/pre-commit`.
- It runs `cargo clippy --all-targets --all-features -- -D warnings` and will abort commits if Clippy reports warnings/errors.

To enable hooks (only required once per clone):

```
git config core.hooksPath .githooks
```
