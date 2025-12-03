// File IO builtins for Tuff
// Simple C-style API with integer error codes

#pragma once

#define _CRT_SECURE_NO_WARNINGS
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <sys/stat.h>
#include <string>
#ifdef _WIN32
	#include <direct.h>
	#include <io.h>
	#include <windows.h>
#else
	#include <unistd.h>
	#include <dirent.h>
#endif
#include <errno.h>

// Windows compatibility for stat macros
#ifdef _WIN32
	#ifndef S_ISREG
		#define S_ISREG(m) (((m) & S_IFMT) == S_IFREG)
	#endif
	#ifndef S_ISDIR
		#define S_ISDIR(m) (((m) & S_IFMT) == S_IFDIR)
	#endif
#endif

// FileHandle is just FILE*
typedef FILE *FileHandle;

// Open a file - returns nullptr on failure
inline FileHandle __builtin_file_open(const char *path, const char *mode)
{
	return fopen(path, mode);
}

// Check if file handle is valid
inline bool __builtin_file_isValid(FileHandle handle)
{
	return handle != nullptr;
}

// Close a file - returns 0 on success, -1 on error
inline int32_t __builtin_file_close(FileHandle handle)
{
	return fclose(handle) == 0 ? 0 : -1;
}

// Read from file - returns bytes read, or -1 on error
inline int64_t __builtin_file_read(FileHandle handle, uint8_t *buffer, size_t count)
{
	size_t bytesRead = fread(buffer, 1, count, handle);
	if (bytesRead < count && ferror(handle))
	{
		return -1;
	}
	return static_cast<int64_t>(bytesRead);
}

// Write to file - returns bytes written, or -1 on error
inline int64_t __builtin_file_write(FileHandle handle, const uint8_t *buffer, size_t count)
{
	size_t written = fwrite(buffer, 1, count, handle);
	if (written < count)
	{
		return -1;
	}
	return static_cast<int64_t>(written);
}

// Check end of file
inline bool __builtin_file_eof(FileHandle handle)
{
	return feof(handle) != 0;
}

// Read entire file as string - returns nullptr on failure
inline char *__builtin_file_readAll(const char *path)
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
inline int32_t __builtin_file_writeAll(const char *path, const char *content)
{
	FILE *f = fopen(path, "w");
	if (f == nullptr)
	{
		return -1;
	}
	
	size_t len = strlen(content);
	size_t written = fwrite(content, 1, len, f);
	fclose(f);
	
	if (written != len)
	{
		return -1;
	}
	return 0;
}

// Check if file/directory exists
inline bool __builtin_file_exists(const char *path)
{
	#ifdef _WIN32
		return _access(path, 0) == 0;
	#else
		return access(path, F_OK) == 0;
	#endif
}

// Check if path is a regular file
inline bool __builtin_file_isFile(const char *path)
{
	struct stat st;
	if (stat(path, &st) != 0)
	{
		return false;
	}
	return S_ISREG(st.st_mode);
}

// Check if path is a directory
inline bool __builtin_file_isDirectory(const char *path)
{
	struct stat st;
	if (stat(path, &st) != 0)
	{
		return false;
	}
	return S_ISDIR(st.st_mode);
}

// Get file size
inline bool __builtin_file_getSize(const char *path, int64_t *outSize)
{
	struct stat st;
	if (stat(path, &st) != 0)
	{
		return false;
	}
	*outSize = st.st_size;
	return true;
}

// Create directory (with parents)
inline bool __builtin_file_createDirectory(const char *path)
{
	#ifdef _WIN32
		// Windows: use _mkdir recursively
		std::string pathStr(path);
		size_t pos = 0;
		do {
			pos = pathStr.find_first_of("\\/", pos + 1);
			std::string subPath = pathStr.substr(0, pos);
			if (!subPath.empty() && _access(subPath.c_str(), 0) != 0)
			{
				if (_mkdir(subPath.c_str()) != 0 && errno != EEXIST)
				{
					return false;
				}
			}
		} while (pos != std::string::npos);
		return true;
	#else
		// Unix: use mkdir recursively
		std::string pathStr(path);
		size_t pos = 0;
		do {
			pos = pathStr.find_first_of("/", pos + 1);
			std::string subPath = pathStr.substr(0, pos);
			if (!subPath.empty() && access(subPath.c_str(), F_OK) != 0)
			{
				if (mkdir(subPath.c_str(), 0755) != 0 && errno != EEXIST)
				{
					return false;
				}
			}
		} while (pos != std::string::npos);
		return true;
	#endif
}

// List directory contents (returns array of strings)
inline void *__builtin_file_listDirectory(const char *path, size_t *outCount)
{
	#ifdef _WIN32
		// Windows implementation using FindFirstFile/FindNextFile
		std::string pattern = std::string(path) + "\\*";
		WIN32_FIND_DATAA findData;
		HANDLE hFind = FindFirstFileA(pattern.c_str(), &findData);
		
		if (hFind == INVALID_HANDLE_VALUE)
		{
			*outCount = 0;
			return nullptr;
		}
		
		// Count entries first
		size_t count = 0;
		do {
			count++;
		} while (FindNextFileA(hFind, &findData));
		
		// Allocate array
		char **result = static_cast<char **>(std::malloc((count + 1) * sizeof(char *)));
		if (result == nullptr)
		{
			FindClose(hFind);
			*outCount = 0;
			return nullptr;
		}
		
		// Reset and collect entries
		FindClose(hFind);
		hFind = FindFirstFileA(pattern.c_str(), &findData);
		size_t idx = 0;
		do {
			size_t len = std::strlen(findData.cFileName);
			result[idx] = static_cast<char *>(std::malloc(len + 1));
			if (result[idx] != nullptr)
			{
				std::strcpy(result[idx], findData.cFileName);
			}
			idx++;
		} while (FindNextFileA(hFind, &findData));
		
		FindClose(hFind);
		result[count] = nullptr;
		*outCount = count;
		return result;
	#else
		// Unix implementation using opendir/readdir
		DIR *dir = opendir(path);
		if (dir == nullptr)
		{
			*outCount = 0;
			return nullptr;
		}
		
		// Count entries first
		size_t count = 0;
		struct dirent *entry;
		while ((entry = readdir(dir)) != nullptr)
		{
			count++;
		}
		
		// Allocate array
		char **result = static_cast<char **>(std::malloc((count + 1) * sizeof(char *)));
		if (result == nullptr)
		{
			closedir(dir);
			*outCount = 0;
			return nullptr;
		}
		
		// Reset and collect entries
		rewinddir(dir);
		size_t idx = 0;
		while ((entry = readdir(dir)) != nullptr)
		{
			size_t len = std::strlen(entry->d_name);
			result[idx] = static_cast<char *>(std::malloc(len + 1));
			if (result[idx] != nullptr)
			{
				std::strcpy(result[idx], entry->d_name);
			}
			idx++;
		}
		
		closedir(dir);
		result[count] = nullptr;
		*outCount = count;
		return result;
	#endif
}

// Delete a file - returns 0 on success, -1 on error
inline int32_t __builtin_file_delete(const char *path)
{
	#ifdef _WIN32
		return _unlink(path) == 0 ? 0 : -1;
	#else
		return unlink(path) == 0 ? 0 : -1;
	#endif
}

// Delete an empty directory - returns 0 on success, -1 on error
// Does not support recursive deletion; directory must be empty
inline int32_t __builtin_file_deleteDirectory(const char *path)
{
	#ifdef _WIN32
		return _rmdir(path) == 0 ? 0 : -1;
	#else
		return rmdir(path) == 0 ? 0 : -1;
	#endif
}
