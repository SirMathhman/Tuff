#!/usr/bin/env python3
"""
Find and Replace Tool
Performs regex-based find and replace on files and directories.
"""

import argparse
import re
import sys
from pathlib import Path


def find_and_replace(path: str, pattern: str, replacement: str, dry_run: bool = False) -> dict:
    """
    Find and replace text in files using regex.
    
    Args:
        path: File path or directory path to process
        pattern: Regex pattern to find
        replacement: Replacement string (supports backreferences like \1, \2)
        dry_run: If True, only show what would be changed without modifying files
    
    Returns:
        Dictionary with statistics: {'files_processed': int, 'files_modified': int, 'replacements': int}
    """
    stats = {
        'files_processed': 0,
        'files_modified': 0,
        'replacements': 0,
        'errors': [],
    }
    
    # Compile regex pattern
    try:
        regex = re.compile(pattern)
    except re.error as e:
        stats['errors'].append(f"Invalid regex pattern: {e}")
        return stats
    
    path_obj = Path(path)
    
    if not path_obj.exists():
        stats['errors'].append(f"Path does not exist: {path}")
        return stats
    
    # Get all files to process
    if path_obj.is_file():
        files = [path_obj]
    else:
        # Process all text files in directory (exclude common non-text extensions)
        exclude_extensions = {'.pyc', '.so', '.o', '.a', '.bin', '.exe', '.dll', '.zip', '.tar', '.gz'}
        files = [
            f for f in path_obj.rglob('*')
            if f.is_file() and f.suffix not in exclude_extensions
        ]
    
    for file_path in files:
        try:
            # Read file
            content = file_path.read_text(encoding='utf-8', errors='ignore')
            original_content = content
            
            # Count matches and perform replacement
            matches = list(regex.finditer(content))
            if matches:
                content = regex.sub(replacement, content)
                stats['replacements'] += len(matches)
                
                if not dry_run:
                    # Write back if changes were made
                    if content != original_content:
                        file_path.write_text(content, encoding='utf-8')
                        stats['files_modified'] += 1
                        print(f"✓ {file_path} ({len(matches)} replacement(s))")
                else:
                    stats['files_modified'] += 1
                    print(f"⚠ [DRY RUN] {file_path} ({len(matches)} replacement(s))")
            
            stats['files_processed'] += 1
        except Exception as e:
            stats['errors'].append(f"Error processing {file_path}: {e}")
    
    return stats


def main():
    parser = argparse.ArgumentParser(
        description='Find and replace text in files using regex patterns.'
    )
    parser.add_argument(
        'path',
        help='File path or directory path to process'
    )
    parser.add_argument(
        'pattern',
        help='Regex pattern to find'
    )
    parser.add_argument(
        'replacement',
        help='Replacement string (supports backreferences like \\1, \\2)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be changed without modifying files'
    )
    
    args = parser.parse_args()
    
    # Run find and replace
    stats = find_and_replace(args.path, args.pattern, args.replacement, args.dry_run)
    
    # Print summary
    print()
    print("=" * 60)
    print(f"Files processed: {stats['files_processed']}")
    print(f"Files modified: {stats['files_modified']}")
    print(f"Total replacements: {stats['replacements']}")
    
    if stats['errors']:
        print(f"\nErrors ({len(stats['errors'])}):")
        for error in stats['errors']:
            print(f"  ✗ {error}")
        return 1
    
    return 0


if __name__ == '__main__':
    sys.exit(main())
