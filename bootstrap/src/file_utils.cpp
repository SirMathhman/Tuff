#include "utils/file_utils.h"
#include <fstream>
#include <sstream>
#include <filesystem>
#include <iostream>

namespace fs = std::filesystem;

std::string readFile(const std::string &path)
{
	std::ifstream file(path);
	if (!file.is_open())
	{
		std::cerr << "Could not open file: " << path << std::endl;
		exit(1);
	}
	std::stringstream buffer;
	buffer << file.rdbuf();
	return buffer.str();
}

void writeToFile(const std::string &path, const std::string &content)
{
	// Create parent directories
	fs::path filePath(path);
	if (filePath.has_parent_path())
	{
		fs::create_directories(filePath.parent_path());
	}

	std::ofstream file(path);
	if (!file.is_open())
	{
		std::cerr << "Could not write to file: " << path << std::endl;
		exit(1);
	}
	file << content;
	file.close();
}

std::vector<std::string> split(const std::string &str, char delimiter)
{
	std::vector<std::string> tokens;
	std::stringstream ss(str);
	std::string token;
	while (std::getline(ss, token, delimiter))
	{
		tokens.push_back(token);
	}
	return tokens;
}

// Recursively find all .tuff files in a directory or return the file if it's a file
std::vector<std::string> expandSourcePath(const std::string &path)
{
	std::vector<std::string> result;
	fs::path p(path);

	if (!fs::exists(p))
	{
		std::cerr << "Source path does not exist: " << path << std::endl;
		exit(1);
	}

	if (fs::is_regular_file(p))
	{
		// Single file
		result.push_back(p.string());
	}
	else if (fs::is_directory(p))
	{
		// Recursively find all .tuff files
		for (const auto &entry : fs::recursive_directory_iterator(p))
		{
			if (fs::is_regular_file(entry) && entry.path().extension() == ".tuff")
			{
				result.push_back(entry.path().string());
			}
		}
	}

	return result;
}
