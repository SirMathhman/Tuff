# Tuff Task Manager

A lightweight SQLite-backed CLI for managing Tuff project tasks.

## Usage

The task manager stores all tasks in a local SQLite database (`tasks.db`) and provides simple commands to manage them.

### Commands

#### List all tasks
```bash
python tasks.py readAll
```

Filter by status:
```bash
python tasks.py readAll --status not-started
python tasks.py readAll --status in-progress
python tasks.py readAll --status completed
```

#### Create a new task
```bash
python tasks.py create "Task title"
```

With description:
```bash
python tasks.py create "Task title" -d "Optional description"
```

Set initial status (defaults to `not-started`):
```bash
python tasks.py create "Task title" -d "Description" -s in-progress
```

#### Delete a task
```bash
python tasks.py delete 5
```

## Task Database

All tasks are stored in `tasks.db`. The database schema includes:

- **id**: Unique task identifier
- **title**: Task name/description
- **description**: Extended details (optional)
- **status**: One of `not-started`, `in-progress`, `completed`
- **created_at**: Timestamp when task was created
- **updated_at**: Timestamp when task was last modified

## Status Values

- `not-started`: Task has not been started
- `in-progress`: Task is currently being worked on
- `completed`: Task has been completed

## Examples

Create a new task:
```bash
$ python tasks.py create "Implement string interpolation" -d "Add support for \${} syntax in strings"
✓ Created task #29: Implement string interpolation
```

View all tasks:
```bash
$ python tasks.py readAll
ID   Status       Title                                              Description
────────────────────────────────────────────────────────────────────────────────────
1    completed    Stop panicking on first analyzer error             Analyzer should...
2    in-progress  Multi-file ES module graph emission                compile_project...
3    not-started  Unused local variables detection (linter)          Warn on local...
```

Mark a task as in progress:
```bash
$ python tasks.py delete 3
✓ Deleted task #3: Unused local variables detection (linter)
```

## Notes

- All commands are idempotent where applicable
- Database is automatically initialized on first use
- No update command is provided—delete and recreate if needed
