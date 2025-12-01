#ifndef TUFF_TEST_H
#define TUFF_TEST_H

#include <string>
#include <functional>
#include <vector>
#include <iostream>
#include <sstream>
#include <cstdio>
#include <array>
#include <memory>
#include <fstream>

// ANSI color codes
#define COLOR_RESET "\033[0m"
#define COLOR_GREEN "\033[32m"
#define COLOR_RED   "\033[31m"
#define COLOR_CYAN  "\033[36m"
#define COLOR_GRAY  "\033[90m"

namespace tuff_test {

struct TestCase {
    std::string name;
    std::function<void()> func;
};

class TestRunner {
public:
    static TestRunner& instance() {
        static TestRunner runner;
        return runner;
    }
    
    void addTest(const std::string& name, std::function<void()> func) {
        tests.push_back({name, func});
    }
    
    int run() {
        int passed = 0;
        int failed = 0;
        
        std::cout << COLOR_CYAN << "=== Tuff Compiler Unit Tests ===" << COLOR_RESET << "\n\n";
        
        for (const auto& test : tests) {
            std::cout << "Running: " << test.name << "... ";
            try {
                test.func();
                std::cout << COLOR_GREEN << "PASSED" << COLOR_RESET << "\n";
                passed++;
            } catch (const std::exception& e) {
                std::cout << COLOR_RED << "FAILED" << COLOR_RESET << "\n";
                std::cout << COLOR_GRAY << "  " << e.what() << COLOR_RESET << "\n";
                failed++;
            }
        }
        
        std::cout << "\n" << COLOR_CYAN << "================================" << COLOR_RESET << "\n";
        std::cout << "Results: " << COLOR_GREEN << passed << " passed" << COLOR_RESET;
        if (failed > 0) {
            std::cout << ", " << COLOR_RED << failed << " failed" << COLOR_RESET;
        }
        std::cout << "\n";
        
        return failed > 0 ? 1 : 0;
    }
    
private:
    std::vector<TestCase> tests;
};

// Auto-registration helper
struct TestRegistrar {
    TestRegistrar(const std::string& name, std::function<void()> func) {
        TestRunner::instance().addTest(name, func);
    }
};

// Assertion exception
class AssertionError : public std::runtime_error {
public:
    explicit AssertionError(const std::string& msg) : std::runtime_error(msg) {}
};

// assertEquals - compare expected vs actual strings
inline void assertEquals(const std::string& expected, const std::string& actual) {
    if (expected != actual) {
        std::ostringstream oss;
        oss << "Assertion failed:\n";
        oss << "  Expected:\n    \"" << expected << "\"\n";
        oss << "  Actual:\n    \"" << actual << "\"";
        throw AssertionError(oss.str());
    }
}

// assertTrue
inline void assertTrue(bool condition, const std::string& message = "Expected true") {
    if (!condition) {
        throw AssertionError(message);
    }
}

// assertError - verify that a function throws CompileError
template<typename Func>
void assertError(Func func) {
    bool threw = false;
    try {
        func();
    } catch (const std::exception&) {
        threw = true;
    }
    if (!threw) {
        throw AssertionError("Expected compilation to fail, but it succeeded");
    }
}

// assertErrorContains - verify that a function throws and error contains message
template<typename Func>
void assertErrorContains(const std::string& expectedMessage, Func func) {
    bool threw = false;
    std::string actualError;
    try {
        func();
    } catch (const std::exception& e) {
        threw = true;
        actualError = e.what();
    }
    if (!threw) {
        throw AssertionError("Expected compilation to fail, but it succeeded");
    }
    if (actualError.find(expectedMessage) == std::string::npos) {
        std::ostringstream oss;
        oss << "Error message mismatch:\n";
        oss << "  Expected to contain: \"" << expectedMessage << "\"\n";
        oss << "  Actual error: \"" << actualError << "\"";
        throw AssertionError(oss.str());
    }
}

// Helper to run compiler as subprocess and capture stderr
// Returns {exitCode, stderrOutput}
inline std::pair<int, std::string> runCompilerProcess(const std::string& source, const std::string& target) {
    // Write source to temp file
    std::string tempFile = "_test_temp.tuff";
    {
        std::ofstream out(tempFile);
        out << source;
    }
    
    // Run compiler and capture stderr - use relative path since test runs from Release dir
    std::string cmd = ".\\tuffc.exe " + tempFile + " " + target + " 2>&1";
    std::array<char, 4096> buffer;
    std::string output;
    
    FILE* pipe = _popen(cmd.c_str(), "r");
    if (!pipe) {
        std::remove(tempFile.c_str());
        throw AssertionError("Failed to run compiler subprocess");
    }
    
    while (fgets(buffer.data(), static_cast<int>(buffer.size()), pipe) != nullptr) {
        output += buffer.data();
    }
    
    int exitCode = _pclose(pipe);
    std::remove(tempFile.c_str());
    
    return {exitCode, output};
}

// assertCompileError - verify compilation fails with expected error message (runs in subprocess)
inline void assertCompileError(const std::string& source, const std::string& expectedError) {
    auto [exitCode, output] = runCompilerProcess(source, "js");
    
    if (exitCode == 0) {
        throw AssertionError("Expected compilation to fail, but it succeeded");
    }
    
    if (output.find(expectedError) == std::string::npos) {
        std::ostringstream oss;
        oss << "Error message mismatch:\n";
        oss << "  Expected to contain: \"" << expectedError << "\"\n";
        oss << "  Actual error: \"" << output << "\"";
        throw AssertionError(oss.str());
    }
}

} // namespace tuff_test

// Macros for test definition
#define TEST(name) \
    void test_##name(); \
    static tuff_test::TestRegistrar registrar_##name(#name, test_##name); \
    void test_##name()

#define RUN_TESTS() tuff_test::TestRunner::instance().run()

#endif // TUFF_TEST_H
