#!/bin/sh
# Install pre-commit hook

cat > .git/hooks/pre-commit << 'EOF'
#!/bin/sh
# Pre-commit hook to run Maven tests before allowing commits

echo "Running Maven tests before commit..."
mvn test --quiet

if [ $? -ne 0 ]; then
    echo "Tests failed! Commit aborted."
    exit 1
fi

echo "All tests passed. Proceeding with commit."
exit 0
EOF

chmod +x .git/hooks/pre-commit
echo "Pre-commit hook installed successfully!"
