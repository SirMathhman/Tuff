# Git Hooks

This directory contains custom Git hooks for the Tuff project.

## Setup

Hooks are automatically configured via `.git/config`. If you cloned this repository and hooks aren't running, execute:

```bash
git config core.hooksPath .githooks
```

## pre-commit

Enforces a 500-line maximum per file to encourage modular code organization.
