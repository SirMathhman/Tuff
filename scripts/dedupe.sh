#!/bin/bash
echo "ls /usr/bin/java output:" >&2
ls -la /usr/bin/java 2>&1 || echo "File not found" >&2
which java 2>&1 || echo "which failed" >&2
java -version 2>&1 || echo "java command failed" >&2
