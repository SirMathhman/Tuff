#!/usr/bin/env python3
import subprocess
import sys
import re

recommendations = []


def run_command(command, description):
    print(">> Running " + description + "...")
    result = subprocess.run(command, shell=True, capture_output=True, text=True)
    if result.returncode == 0:
        print("[OK] " + description + " passed")
        return True, result.stdout + result.stderr
    else:
        print("[FAIL] " + description + " failed")
        return False, result.stdout + result.stderr


def analyze_duplication(output):
    lines = output.split("\n")
    in_duplication_block = False
    duplication_samples = []
    current_sample = []

    for line in lines:
        if "duplication in the following files" in line:
            in_duplication_block = True
            current_sample = [line]
        elif in_duplication_block:
            if line.strip() == "" or "======" in line:
                if current_sample:
                    duplication_samples.append("\n".join(current_sample))
                current_sample = []
                in_duplication_block = False
            else:
                current_sample.append(line)

    if current_sample:
        duplication_samples.append("\n".join(current_sample))

    return duplication_samples


def get_duplication_advice(duplication_text):
    advice_list = []

    has_function_params = "function" in duplication_text and (":" in duplication_text or "," in duplication_text)
    has_long_declaration = len([line for line in duplication_text.split("\n") if ":" in line and len(line) > 80]) > 0
    has_complex_type = "Record<" in duplication_text or "Result<" in duplication_text or "{ " in duplication_text

    if has_long_declaration and has_function_params:
        advice_list.append("Consider extracting function parameters into a parameter object to reduce duplication")

    if has_complex_type:
        advice_list.append("Consider extracting the complex type into a type alias for reusability")

    if len(duplication_text.split("\n")) > 10:
        advice_list.append("Consider extracting duplicated logic into a shared utility function")

    if not advice_list:
        advice_list.append("Review the duplicated code and consider refactoring for maintainability")

    return advice_list


def print_recommendations():
    if recommendations:
        print("\nRecommendations:")
        for rec in recommendations:
            print("  - " + rec)


def main():
    test_passed, test_output = run_command("npm test", "Test suite")
    dupe_passed, dupe_output = run_command("pmd cpd --minimum-tokens 50 src tests --language typescript", "Duplicate code check")
    lint_passed, lint_output = run_command("npm run lint", "ESLint check")

    if not dupe_passed:
        duplication_samples = analyze_duplication(dupe_output)
        for idx, sample in enumerate(duplication_samples):
            advice = get_duplication_advice(sample)
            for adv in advice:
                recommendations.append(adv)

    print_recommendations()

    if not test_passed or not dupe_passed or not lint_passed:
        print("\nPre-commit checks failed. Please fix issues before committing.")
        sys.exit(1)

    print("\nAll pre-commit checks passed!")
    sys.exit(0)


if __name__ == "__main__":
    main()

