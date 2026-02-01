# AGENTS.md - Instructions for AI Coding Agents

## Quick Reference

**Project:** Tuff - TypeScript project located at `C:\Users\mathm\Documents\Projects\Tuff`
**Node Version:** ^16.0.0 | **TypeScript:** ^5.9.3 | **Test Framework:** Jest

## Build & Test Commands

### Essential Commands
- **Build:** `npm run build` - Compiles TypeScript to `dist/`
- **Start:** `npm start` - Execute `src/index.ts` via ts-node
- **Dev:** `npm run dev` - Watch mode with auto-reload
- **Lint:** `npm run lint` - Run ESLint checks
- **Lint Fix:** `npm run lint:fix` - Auto-fix formatting issues

### Testing
- **All tests:** `npm test`
- **Watch mode:** `npm run test:watch`
- **Single test file:** `npm run test:file path/to/test.spec.ts` or `jest path/to/test.spec.ts`
- **Coverage report:** `npm run test:coverage`
- **Pre-commit checks:** Runs tests, lint, and PMD duplicate code detection automatically

## Code Style Guidelines

### Imports & Modules
- Use ES6 syntax: `import { } from ''` and `export`
- Order: 1) Node built-ins, 2) External packages, 3) Internal modules, 4) Types
- Prefer named exports; use default exports only for main entry points
- Avoid `import * as X` for defaults—use `import X` instead

### Type Safety (Strict Mode Enabled)
- **Never use `any`** - use specific types or `unknown` with type guards
- Use `interface` for extensible object shapes, `type` for unions/intersections
- Leverage TypeScript's type inference when the type is obvious
- Use `readonly` for immutable properties: `interface Foo { readonly bar: string; }`
- Always type function parameters explicitly

### Naming Conventions
- **Variables/Functions:** `camelCase` (e.g., `getUserData`, `isValid`)
- **Classes/Interfaces:** `PascalCase` (e.g., `UserService`, `IDataProvider`)
- **Constants:** `UPPER_SNAKE_CASE` (e.g., `MAX_RETRIES`, `API_BASE_URL`)
- **Private members:** Leading underscore (e.g., `_internalState`)
- **Type parameters:** Single letter (`T`, `K`) or descriptive PascalCase (`TUser`)
- **Files:** kebab-case or camelCase (e.g., `user-service.ts`)

### Code Formatting (ESLint Enforced)
- **Indentation:** 2 spaces (not tabs)
- **Quotes:** Double quotes only (`"string"`)
- **Semicolons:** Always required
- **Comparisons:** Use `===` and `!==` (never `==` or `!=`)
- **Trailing commas:** Use in multi-line arrays/objects
- **Line length:** Max 100 characters
- **Unused variables:** Prefix with underscore to suppress warnings (e.g., `_unused`)
- **Function size:** Max 50 lines per function (excludes blank lines & comments)

### Error Handling
- Use `try/catch` for synchronous operations
- Use `async/await` with `try/catch` for async (avoid `.then()/.catch()`)
- Define custom error types: `class CustomError extends Error { ... }`
- Never use `any` for error types—use `unknown` with type guards
- Re-throw errors after logging if they can't be handled
- Use discriminated unions for Result types:
  ```typescript
  type Result<T, E> = { success: true; data: T } | { success: false; error: E };
  ```

### Functions & Logic
- Keep functions focused (single responsibility principle)
- Prefer pure functions (no side effects)
- Use default parameters: `function foo(x: number = 5) {}`
- Use rest parameters: `function sum(...nums: number[]) {}`
- Use arrow functions for callbacks; regular functions for methods
- Add JSDoc for complex public APIs

### Project Structure
- **Source code:** `src/` directory
- **Tests:** `tests/` directory
- **Organization:** Group by feature/domain (e.g., `src/services/`, `src/utils/`)
- **Index files:** Use `src/feature/index.ts` to export public API
- **File moves:** Always use `git mv` to preserve history
- **Separation of concerns:** Keep types separate or at module top

## Git Workflow

- **Commit format:** Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`)
  - Example: `feat: add user authentication service`
- **Stage changes:** `git add .` before committing
- **Pre-commit hooks:** Automatically run tests, lint, and PMD duplicate code checks
- **Only commit when:** Explicitly requested or when completing a feature
- **Documentation:** Update AGENTS.md, README.md, or inline comments when modifying features

## Project Configuration

- **TypeScript:** Strict mode enabled (ES2020 target, CommonJS modules)
- **ESLint:** Extends recommended + @typescript-eslint/recommended
- **Jest:** ts-jest preset, runs tests from `src/` and `tests/` directories
- **Husky:** Pre-commit hook runs `npm run precommit` (Python script)
- **PMD:** Duplicate code detection (minimum 35 tokens) on pre-commit

## Testing Guidelines

- Write tests for business logic, not implementation details
- Use descriptive names: `should return user data when given valid id`
- Follow Arrange-Act-Assert pattern (setup → execute → verify)
- Mock external dependencies (APIs, databases)
- Test edge cases and error conditions
- Aim for high coverage on critical paths

---

**Last Updated:** January 31, 2025
