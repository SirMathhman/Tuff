# AGENTS.md - Instructions for AI Coding Agents

## Project Overview

This is a TypeScript project named "Tuff" located at `C:\Users\mathm\Documents\Projects\Tuff`. The project is in early stages with a basic TypeScript configuration.

## Build Commands

### Current Available Scripts
- `npm run build` - Compile TypeScript to JavaScript (outputs to `dist/`)
- `npm start` - Execute `src/index.ts` using ts-node
- `npm run dev` - Watch mode for development (ts-node with file watching)
- `npm test` - Run all Jest tests (pre-commit hook runs this automatically)
- `npm run test:watch` - Run tests in watch mode
- `npm run test:file` - Run specific test file: `npm run test:file path/to/test.spec.ts`
- `npm run test:coverage` - Run tests with coverage report
- `npm run lint` - Check code style with ESLint
- `npm run lint:fix` - Auto-fix linting issues

### Running Tests
- All tests: `npm test`
- Watch mode: `npm run test:watch`
- Single test file: `npm run test:file path/to/test.spec.ts` or `jest path/to/test.spec.ts`
- With coverage: `npm run test:coverage`

**Pre-commit hook:** Automatically runs `npm test` before each commit to ensure tests pass.

### Setting Up Linting (When Needed)
If ESLint is needed, install and configure:
```bash
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
npx eslint --init
```

Add to package.json scripts:
```json
"lint": "eslint . --ext .ts,.tsx",
"lint:fix": "eslint . --ext .ts,.tsx --fix"
```

## Code Style Guidelines

### Imports and Module Organization
- Use ES6 import/export syntax (`import { } from ''; export {}; export default`)
- Group imports in this order: 1) Node built-in modules, 2) External packages, 3) Internal modules, 4) Types
- Use named exports for most cases (`export function foo()`), default export only for main entry points
- Avoid `import * as Foo` for default imports - use `import Foo` or `import { Foo }`

### Type Safety
- Always use TypeScript types - avoid `any` and `unknown`
- Use interfaces for object shapes that may be extended, types for unions/intersections
- Use generic types `<T>` appropriately for reusable functions
- Leverage TypeScript's type inference when possible
- For function parameters, prefer explicit types when the inferred type is unclear
- Use `readonly` for immutable properties: `interface Foo { readonly bar: string; }`

### Naming Conventions
- **Variables/Functions:** camelCase (`myVariable`, `getData`)
- **Classes/Interfaces:** PascalCase (`UserService`, `IDataProvider`)
- **Constants:** UPPER_SNAKE_CASE for true constants (`MAX_RETRIES`, `API_BASE_URL`)
- **Private members:** Leading underscore (`_internalState`)
- **Type parameters:** Single uppercase letter or descriptive PascalCase (`T`, `TUser`, `K`)
- **File names:** kebab-case or camelCase (`user-service.ts`, `userService.ts`)

### Code Formatting
- Use 2 spaces for indentation (not tabs)
- Use double quotes for strings (`"string"`, not `'string'`)
- Use semicolons at the end of statements
- Use trailing commas in multi-line arrays/objects
- Max line length: 100 characters
- Use `===` and `!==` for comparisons (never `==` or `!=`)

### Error Handling
- Use try/catch for synchronous operations that may throw
- Use async/await with try/catch for async operations (not .then/.catch)
- Define custom error types: `class CustomError extends Error { ... }`
- Never use `any` as error type - use `unknown` and type guards
- Always re-throw errors after logging if they can't be handled
- For Result types (success/failure patterns), use discriminated unions:
  ```typescript
  type Result<T, E> = { success: true; data: T } | { success: false; error: E };
  ```

### Function Design
- Keep functions small and focused (single responsibility)
- Prefer pure functions when possible (no side effects)
- Use default parameters instead of checking for undefined: `function foo(x: number = 5) {}`
- Use rest parameters for variadic functions: `function sum(...nums: number[]) {}`
- Document public APIs with JSDoc comments for complex logic
- Use arrow functions for callbacks, regular functions for methods (to preserve `this`)

### File Structure
- Place source code in `src/` directory
- Place test files in `tests/` directory
- Organize by feature/domain (e.g., `src/services/`, `src/utils/`, `src/types/`)
- Use index files for clean imports: `src/user/index.ts` exports public API
- Keep related files together in the same directory
- Separation of concerns: types in separate files or at top of module files
- **Never move files manually** - always use `git mv` to preserve git history when moving files

### Git Workflow
- **IMPORTANT:** Always create a git commit at the end of your task using descriptive commit messages
- Use conventional commit format: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- Example: `feat: add user authentication service`
- Stage all relevant changes before committing (`git add .`)
- Do not commit build artifacts (node_modules, dist/) - these are in .gitignore
- Only commit when explicitly asked by the user or when completing a feature
- Pre-commit hooks may be configured later to run lint/test automatically
- **Update documentation** when completing tasks that add new features, modify existing functionality, or change project structure
- Relevant documentation files include: AGENTS.md, README.md, and any inline code comments that explain complex logic

### Performance Considerations
- Avoid unnecessary re-renders or recalculations
- Use memoization for expensive operations
- Consider lazy loading for large modules
- Optimize loops and avoid nested loops when possible
- Use appropriate data structures (Map vs Object, Set vs Array)

### Security Best Practices
- Never commit secrets or API keys
- Use environment variables for configuration: `process.env.API_KEY`
- Validate and sanitize user inputs
- Use HTTPS for all network requests
- Keep dependencies updated regularly

### Testing Guidelines (When Tests Are Added)
- Write tests for business logic, not implementation details
- Use descriptive test names: `should return user data when given valid id`
- Arrange-Act-Assert pattern: setup, execute, verify
- Mock external dependencies (API calls, databases)
- Test edge cases and error conditions
- Aim for high coverage on critical paths

## Project Context

This repository previously contained a JavaScript-based compiler project that was reset. The current setup is a clean TypeScript foundation. When working on this project, prioritize type safety and maintainability. If you need to add dependencies, check if they're commonly used and well-maintained.

---

**Last Updated:** January 31, 2026
