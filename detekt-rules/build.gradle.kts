plugins {
    kotlin("jvm") version "2.2.0"
}

repositories {
    mavenCentral()
}

dependencies {
    compileOnly("io.gitlab.arturbosch.detekt:detekt-api:1.23.1")
    compileOnly("org.jetbrains.kotlin:kotlin-stdlib")
}

java {
    withJavadocJar()
    withSourcesJar()
}
