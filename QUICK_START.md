# Quick Start Guide

## Running the Application

### Standard Run
```bash
./gradlew run
```

### Continuous Watch Mode (Like nodemon)
```bash
./gradlew run --continuous
# or short form
./gradlew run -t
```

In continuous mode, the application will automatically rebuild and rerun whenever you change any files in the `src/` directory. This is perfect for development!

## Example Development Workflow

```bash
# Terminal 1: Start continuous mode
./gradlew run --continuous

# Terminal 2 (or in your editor): Make changes to src files
# Changes are automatically detected and the app restarts!
```

## Building the Project

```bash
# Build once
./gradlew build

# Build continuously
./gradlew build --continuous
```

## Other Common Tasks

```bash
# Clean build directory
./gradlew clean

# Just compile Java
./gradlew compileJava

# Run tests
./gradlew test

# Create JAR file
./gradlew jar

# List all available tasks
./gradlew tasks
```

## Features

- ✅ Gradle Wrapper included (no Gradle installation needed)
- ✅ Java 17 support
- ✅ Built-in continuous/watch mode with `--continuous`
- ✅ Ready for IDE integration (IntelliJ IDEA, Eclipse, VSCode)
- ✅ Automatic rebuild and rerun on file changes

See `GRADLE_SETUP.md` and `CONTINUOUS_MODE.md` for more details.
