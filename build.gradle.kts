plugins {
    kotlin("jvm") version "2.2.0"
    id("org.jlleitschuh.gradle.ktlint") version "11.4.2"
    id("io.gitlab.arturbosch.detekt") version "1.23.1"
}

repositories {
    mavenCentral()
}

dependencies {
    testImplementation("org.junit.jupiter:junit-jupiter:5.9.3")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.9.3")

    // Custom Detekt rule set(s) live here; add more modules later as needed.
    detektPlugins(project(":detekt-rules"))
}

tasks.test {
    useJUnitPlatform()

    testLogging {
        // Show basic events and use short exception format to reduce noisy stack traces
        events("passed", "skipped", "failed")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.SHORT
        showExceptions = true
        showCauses = true
        showStackTraces = false
    }
}

ktlint {
    version.set("0.49.1")
    enableExperimentalRules.set(false)
    reporters {
        reporter(org.jlleitschuh.gradle.ktlint.reporter.ReporterType.PLAIN)
        reporter(org.jlleitschuh.gradle.ktlint.reporter.ReporterType.CHECKSTYLE)
    }
    filter {
        exclude("**/generated/**")
    }
}

detekt {
    // Keep all lint configuration in detekt.yml so we can evolve rules over time.
    config.from(files("detekt.yml"))
    buildUponDefaultConfig = true
    source.from(files("src/main/kotlin", "src/test/kotlin"))
}

// Detekt currently supports JVM targets up to 20; pin to 17 to work reliably even when building with newer JDKs.
tasks.withType(io.gitlab.arturbosch.detekt.Detekt::class.java).configureEach {
    jvmTarget = "17"
}

// Ensure Detekt participates in the standard verification lifecycle.
tasks.named("check") {
    dependsOn("detekt")
}
