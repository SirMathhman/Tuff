# Continuous Watch Mode (Like nodemon)

Gradle has built-in support for continuous builds using the `--continuous` (or `-t`) flag. This automatically rebuilds your project whenever source files change, similar to **nodemon** for Node.js projects.

## Running in Continuous Mode

### Using Gradle Wrapper

```bash
# Unix/Linux/Mac
./gradlew run --continuous

# Windows
gradlew.bat run --continuous

# Shorter form (-t)
./gradlew run -t
```

### Using Local Gradle Installation

```bash
gradle run --continuous
# or
gradle run -t
```

## How It Works

1. Gradle watches for file changes in your `src/` directory
2. When changes are detected, it automatically:
   - Recompiles your Java code
   - Rebuilds the project
   - Reruns your application
3. Press **Ctrl+C** to stop the continuous build

## Example Output

```
> Task :compileJava
> Task :processResources
> Task :classes
> Task :run

BUILD SUCCESSFUL

Waiting for changes to input files of tasks... (ctrl-d to exit)
```

## Other Continuous Tasks

You can use `--continuous` with any Gradle task:

```bash
# Just compile, don't run
./gradlew compileJava --continuous

# Build and check tests
./gradlew build --continuous

# Run tests continuously
./gradlew test --continuous
```

## Configuration Cache

For even faster rebuild times, you can enable Gradle's configuration cache. Add this to `gradle.properties`:

```properties
org.gradle.configuration-cache=true
```

This can significantly speed up builds, especially with continuous mode.

## Tips

- Use `--continuous` during development for rapid iteration
- Combine with `--info` flag for detailed build output: `./gradlew run --continuous --info`
- The continuous mode works with any Gradle task, not just `run`
- Press Ctrl+D (on Unix/Mac) or Ctrl+C to exit continuous mode
