#!/usr/bin/env python3
import subprocess
import sys

recommendations = []

def run_command(command, description):
    print(f">> Running {description}...")
    result = subprocess.run(command, shell=True)
    if result.returncode == 0:
        print(f"[OK] {description} passed")
        return True
    else:
        print(f"[FAIL] {description} failed")
        return False

def print_recommendations():
    if recommendations:
        print("\nRecommendations:")
        for rec in recommendations:
            print(f"  - {rec}")

def main():
    lint_passed = run_command("npm run lint", "ESLint check")
    pmd_passed = run_command("pmd check -d src -R category/ecmascript/bestpractices.xml --no-fail-on-violation", "PMD analysis")
    test_passed = run_command("npm test", "Test suite")

    print_recommendations()

    if not lint_passed or not pmd_passed or not test_passed:
        print("\nPre-commit checks failed. Please fix issues before committing.")
        sys.exit(1)

    print("\nAll pre-commit checks passed!")
    sys.exit(0)

if __name__ == "__main__":
    main()
