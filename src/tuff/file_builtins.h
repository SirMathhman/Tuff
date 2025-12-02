// File IO builtins for Tuff
// Wraps C stdio functions with Result<T, string> error handling

#pragma once

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cerrno>

// FileHandle is an opaque wrapper around FILE*
typedef FILE *FileHandle;

// Result types for file operations
// These match the Tuff Result<T, E> = Ok<T> | Err<E> union type

template <typename T>
struct FileOk
{
	T value;
};

template <typename E>
struct FileErr
{
	E error;
};

// Result for FileHandle
struct ResultFileHandle
{
	enum class Tag
	{
		Ok,
		Err
	} __tag;
	union
	{
		FileOk<FileHandle> __val_Ok;
		FileErr<const char *> __val_Err;
	};

	ResultFileHandle(FileOk<FileHandle> v) : __tag(Tag::Ok), __val_Ok(v) {}
	ResultFileHandle(FileErr<const char *> v) : __tag(Tag::Err), __val_Err(v) {}
};

// Result for Void (just success/error)
struct ResultVoid
{
	enum class Tag
	{
		Ok,
		Err
	} __tag;
	union
	{
		FileOk<int> __val_Ok; // dummy value for void
		FileErr<const char *> __val_Err;
	};

	ResultVoid(FileOk<int> v) : __tag(Tag::Ok), __val_Ok(v) {}
	ResultVoid(FileErr<const char *> v) : __tag(Tag::Err), __val_Err(v) {}
};

// Result for USize
struct ResultUSize
{
	enum class Tag
	{
		Ok,
		Err
	} __tag;
	union
	{
		FileOk<size_t> __val_Ok;
		FileErr<const char *> __val_Err;
	};

	ResultUSize(FileOk<size_t> v) : __tag(Tag::Ok), __val_Ok(v) {}
	ResultUSize(FileErr<const char *> v) : __tag(Tag::Err), __val_Err(v) {}
};

// Result for string (file contents)
struct ResultString
{
	enum class Tag
	{
		Ok,
		Err
	} __tag;
	union
	{
		FileOk<const char *> __val_Ok;
		FileErr<const char *> __val_Err;
	};

	ResultString(FileOk<const char *> v) : __tag(Tag::Ok), __val_Ok(v) {}
	ResultString(FileErr<const char *> v) : __tag(Tag::Err), __val_Err(v) {}
};

// Helper to get error message (caller must free)
inline const char *make_error_string(const char *prefix)
{
	const char *err = strerror(errno);
	size_t len = strlen(prefix) + strlen(err) + 3;
	char *result = (char *)malloc(len);
	snprintf(result, len, "%s: %s", prefix, err);
	return result;
}

// Open a file
inline ResultFileHandle file_open(const char *path, const char *mode)
{
	FILE *f = fopen(path, mode);
	if (f == nullptr)
	{
		return ResultFileHandle(FileErr<const char *>{make_error_string("file_open")});
	}
	return ResultFileHandle(FileOk<FileHandle>{f});
}

// Close a file
inline ResultVoid file_close(FileHandle handle)
{
	if (fclose(handle) != 0)
	{
		return ResultVoid(FileErr<const char *>{make_error_string("file_close")});
	}
	return ResultVoid(FileOk<int>{0});
}

// Read from file
inline ResultUSize file_read(FileHandle handle, uint8_t *buffer, size_t count)
{
	size_t read = fread(buffer, 1, count, handle);
	if (read < count && ferror(handle))
	{
		return ResultUSize(FileErr<const char *>{make_error_string("file_read")});
	}
	return ResultUSize(FileOk<size_t>{read});
}

// Write to file
inline ResultUSize file_write(FileHandle handle, const uint8_t *buffer, size_t count)
{
	size_t written = fwrite(buffer, 1, count, handle);
	if (written < count)
	{
		return ResultUSize(FileErr<const char *>{make_error_string("file_write")});
	}
	return ResultUSize(FileOk<size_t>{written});
}

// Check end of file
inline bool file_eof(FileHandle handle)
{
	return feof(handle) != 0;
}

// Flush file
inline ResultVoid file_flush(FileHandle handle)
{
	if (fflush(handle) != 0)
	{
		return ResultVoid(FileErr<const char *>{make_error_string("file_flush")});
	}
	return ResultVoid(FileOk<int>{0});
}

// Get file position
inline ResultUSize file_tell(FileHandle handle)
{
	long pos = ftell(handle);
	if (pos < 0)
	{
		return ResultUSize(FileErr<const char *>{make_error_string("file_tell")});
	}
	return ResultUSize(FileOk<size_t>{static_cast<size_t>(pos)});
}

// Seek in file
inline ResultVoid file_seek(FileHandle handle, int64_t offset, int32_t whence)
{
	if (fseek(handle, static_cast<long>(offset), whence) != 0)
	{
		return ResultVoid(FileErr<const char *>{make_error_string("file_seek")});
	}
	return ResultVoid(FileOk<int>{0});
}

// Read entire file as string
inline ResultString file_readAll(const char *path)
{
	FILE *f = fopen(path, "rb");
	if (f == nullptr)
	{
		return ResultString(FileErr<const char *>{make_error_string("file_readAll")});
	}

	// Get file size
	fseek(f, 0, SEEK_END);
	long size = ftell(f);
	fseek(f, 0, SEEK_SET);

	if (size < 0)
	{
		fclose(f);
		return ResultString(FileErr<const char *>{make_error_string("file_readAll")});
	}

	// Allocate buffer (+1 for null terminator)
	char *buffer = (char *)malloc(size + 1);
	if (buffer == nullptr)
	{
		fclose(f);
		return ResultString(FileErr<const char *>{"file_readAll: out of memory"});
	}

	// Read file
	size_t read = fread(buffer, 1, size, f);
	fclose(f);

	if (read != static_cast<size_t>(size))
	{
		free(buffer);
		return ResultString(FileErr<const char *>{make_error_string("file_readAll")});
	}

	buffer[size] = '\0';
	return ResultString(FileOk<const char *>{buffer});
}

// Write string to file
inline ResultVoid file_writeAll(const char *path, const char *content)
{
	FILE *f = fopen(path, "wb");
	if (f == nullptr)
	{
		return ResultVoid(FileErr<const char *>{make_error_string("file_writeAll")});
	}

	size_t len = strlen(content);
	size_t written = fwrite(content, 1, len, f);
	fclose(f);

	if (written != len)
	{
		return ResultVoid(FileErr<const char *>{make_error_string("file_writeAll")});
	}

	return ResultVoid(FileOk<int>{0});
}
