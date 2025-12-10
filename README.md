# Tuff Maven Project

A minimal Maven project generated for the Java runtime detected on this machine.

Detected Java Version: 24

## Build & Run

If you have Maven installed:

```powershell
# From the project root (where pom.xml is):
mvn -v
mvn test
mvn package
# Run the generated runnable JAR
java -jar target/tuff-1.0-SNAPSHOT.jar
```

If Maven is not installed, compile and run with javac/java directly:

```powershell
# From the project root (where pom.xml is):
javac -d out src/main/java/com/example/tuff/*.java
java -cp out com.example.tuff.App
```
