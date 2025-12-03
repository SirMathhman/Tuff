// File IO builtins for Tuff
// Simple C-style API with integer error codes

#pragma once

#define _CRT_SECURE_NO_WARNINGS
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <sys/stat.h>

#ifdef _WIN32
#include <direct.h>
#include <io.h>
#define stat _stat
#define S_ISDIR(m) (((m) & S_IFMT) == S_IFDIR)
#define S_ISREG(m) (((m) & S_IFMT) == S_IFREG)
#else
#include <unistd.h>
#include <dirent.h>
#endif

// FileHandle is just FILE*
typedef FILE *FileHandle;

// Open a file - returns nullptr on failure
inline FileHandle file_open(const char *path, const char *mode)
{
	return fopen(path, mode);
}
inline FileHandle __builtin_file_open(const char *path, const char *mode)
{
	return file_open(path, mode);
}

// Check if file handle is valid
inline bool file_isValid(FileHandle handle)
{
	return handle != nullptr;
}
inline bool __builtin_file_isValid(FileHandle handle)
{
	return file_isValid(handle);
}

// Close a file - returns 0 on success, -1 on error
inline int32_t file_close(FileHandle handle)
{
	return fclose(handle) == 0 ? 0 : -1;
}
inline int32_t __builtin_file_close(FileHandle handle)
{
	return file_close(handle);
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
inline int64_t __builtin_file_read(FileHandle handle, uint8_t *buffer, size_t count)
{
	return file_read(handle, reinterpret_cast<char *>(buffer), count);
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
inline int64_t __builtin_file_write(FileHandle handle, const uint8_t *buffer, size_t count)
{
	return file_write(handle, reinterpret_cast<const char *>(buffer), count);
}

// Check end of file
inline bool file_eof(FileHandle handle)
{
	return feof(handle) != 0;
}
inline bool __builtin_file_eof(FileHandle handle)
{
	return file_eof(handle);
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
inline char *__builtin_file_readAll(const char *path)
{
	return file_readAll(path);
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
inline int32_t __builtin_file_writeAll(const char *path, const char *content)
{
	return file_writeAll(path, content);
}

// Check if file exists
inline bool __builtin_file_exists(const char *path)
{
	struct stat buffer;
	return (stat(path, &buffer) == 0);
}

// Check if path is a file
inline bool __builtin_file_isFile(const char *path)
{
	struct stat buffer;
	if (stat(path, &buffer) != 0)
		return false;
	return S_ISREG(buffer.st_mode);
}

// Check if path is a directory
inline bool __builtin_file_isDirectory(const char *path)
{
	struct stat buffer;
	if (stat(path, &buffer) != 0)
		return false;
	return S_ISDIR(buffer.st_mode);
}

// Get file size
inline bool __builtin_file_getSize(const char *path, int64_t *outSize)
{
	struct stat buffer;
	if (stat(path, &buffer) != 0)
		return false;
	*outSize = buffer.st_size;
	return true;
}

// Delete file
inline int32_t __builtin_file_delete(const char *path)
{
	return remove(path) == 0 ? 0 : -1;
}

// Create directory
inline bool __builtin_file_createDirectory(const char *path)
{
#ifdef _WIN32
	return _mkdir(path) == 0;
#else
	return mkdir(path, 0755) == 0;
#endif
}

// Delete directory
inline int32_t __builtin_file_deleteDirectory(const char *path)
{
#ifdef _WIN32
	return _rmdir(path) == 0 ? 0 : -1;
#else
	return rmdir(path) == 0 ? 0 : -1;
#endif
}

// List directory (returns array of strings)
inline void *__builtin_file_listDirectory(const char *path, size_t *outCount)
{
	*outCount = 0;
	// Simplified implementation - just return NULL for now
	// A real implementation would scan the directory and return string array
	return nullptr;
}
