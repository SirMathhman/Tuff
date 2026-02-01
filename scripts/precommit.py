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
    return [duplication_text]


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

