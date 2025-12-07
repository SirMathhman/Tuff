# Tuff — Minimal Maven Java project

This is a minimal Maven project scaffold created for local Java development.

Java version detected: 24.0.1

Build and run:

```powershell
mvn -q -DskipTests=false package
java -jar target/tuff-0.1.0-SNAPSHOT.jar
```

Run tests:

```powershell
mvn test
```

Git hooks
 - This repository uses a repo-level pre-commit hook placed in `.githooks/pre-commit`.
 - The hook runs `mvn -q test` and will abort commits if tests fail.
 - To opt out temporarily, use `git commit --no-verify`.
