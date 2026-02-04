# Tuff Project - Gradle Setup

This project has been successfully converted to a **Gradle** project structure.

## Project Structure

```
Tuff/
├── gradle/
│   └── wrapper/              # Gradle Wrapper configuration
├── src/
│   ├── main/
│   │   ├── java/            # Java source code
│   │   ├── js/              # JavaScript files
│   │   └── tuff/            # Tuff language files
│   └── test/
│       └── java/            # Test source code
├── build.gradle             # Gradle build configuration
├── settings.gradle          # Gradle settings
├── gradle.properties        # Gradle properties
├── gradlew                  # Gradle Wrapper (Unix/Linux/Mac)
└── gradlew.bat             # Gradle Wrapper (Windows)
```

## Key Configuration

- **Java Version:** 17
- **Main Class:** `com.meti.Main`
- **Gradle Version:** 8.5 (via Gradle Wrapper)
- **Build Output:** `build/` directory

## Building the Project

### Using Gradle Wrapper (Recommended)

```bash
# Unix/Linux/Mac
./gradlew build

# Windows
gradlew.bat build
```

### Using Local Gradle Installation

```bash
gradle build
```

## Running the Application

```bash
# Unix/Linux/Mac
./gradlew run

# Windows
gradlew.bat run
```

Or with local Gradle:

```bash
gradle run
```

## Other Useful Tasks

- `./gradlew clean` - Clean build directory
- `./gradlew compileJava` - Compile Java source code only
- `./gradlew test` - Run tests
- `./gradlew jar` - Create JAR file
- `./gradlew distZip` - Create distribution ZIP
- `./gradlew tasks` - List all available tasks

## IDE Integration

The Gradle Wrapper allows you to use Gradle in your IDE (IntelliJ IDEA, Eclipse, Visual Studio Code) without having to install Gradle separately. Most IDEs recognize the `build.gradle` file automatically.

### IntelliJ IDEA
1. Open the project root folder
2. IntelliJ will recognize the Gradle structure automatically
3. Sync the Gradle project if prompted

## Notes

- The Gradle Wrapper (`gradlew` and `gradlew.bat`) is included, so you don't need to install Gradle separately
- All Gradle cache files are in `.gradle/` and `build/` directories (ignored by Git)
- The old `Tuff.iml` file can be removed if you're fully migrating to Gradle
