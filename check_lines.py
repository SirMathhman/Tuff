#!/usr/bin/env python3
content = open("src/compiler/parser.rs", "rb").read()
print(f"Total bytes: {len(content)}")
print(f'LF count: {content.count(b"\n")}')
print(f'CR count: {content.count(b"\r")}')
print(f'CRLF count: {content.count(b"\r\n")}')
