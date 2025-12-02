// File IO builtins for Tuff
// Simple C-style API with integer error codes

#pragma once

#define _CRT_SECURE_NO_WARNINGS
#include <cstdio>
#include <cstdlib>
#include <cstring>

// FileHandle is just FILE*
typedef FILE *FileHandle;

// Open a file - returns nullptr on failure
inline FileHandle file_open(const char *path, const char *mode)
{
	return fopen(path, mode);
}

// Check if file handle is valid
inline bool file_isValid(FileHandle handle)
{
	return handle != nullptr;
}

// Close a file - returns 0 on success, -1 on error
inline int32_t file_close(FileHandle handle)
{
	return fclose(handle) == 0 ? 0 : -1;
}

// Read from file - returns bytes read, or -1 on error
inline int64_t file_read(FileHandle handle, char *buffer, size_t count)
{
	size_t bytesRead = fread(buffer, 1, count, handle);
	if (bytesRead < count && ferror(handle))
	{
		return -1;
	}
	return static_cast<int64_t>(bytesRead);
}

// Write to file - returns bytes written, or -1 on error
inline int64_t file_write(FileHandle handle, const char *buffer, size_t count)
{
	size_t written = fwrite(buffer, 1, count, handle);
	if (written < count)
	{
		return -1;
	}
	return static_cast<int64_t>(written);
}

// Check end of file
inline bool file_eof(FileHandle handle)
{
	return feof(handle) != 0;
}

// Read entire file as string - returns nullptr on failure
inline char *file_readAll(const char *path)
{
	FILE *f = fopen(path, "rb");
	if (f == nullptr)
	{
		return nullptr;
	}

	// Get file size
	fseek(f, 0, SEEK_END);
	long size = ftell(f);
	fseek(f, 0, SEEK_SET);

	if (size < 0)
	{
		fclose(f);
		return nullptr;
	}

	// Allocate buffer (+1 for null terminator)
	char *buffer = (char *)malloc(size + 1);
	if (buffer == nullptr)
	{
		fclose(f);
		return nullptr;
	}

	// Read file
	size_t bytesRead = fread(buffer, 1, size, f);
	fclose(f);

	if (bytesRead != static_cast<size_t>(size))
	{
		free(buffer);
		return nullptr;
	}

	buffer[size] = '\0';
	return buffer;
}

// Write string to file - returns 0 on success, -1 on error
inline int32_t file_writeAll(const char *path, const char *content)
{
	FILE *f = fopen(path, "wb");
	if (f == nullptr)
	{
		return -1;
	}

	size_t len = strlen(content);
	size_t written = fwrite(content, 1, len, f);
	fclose(f);

	return (written == len) ? 0 : -1;
}
