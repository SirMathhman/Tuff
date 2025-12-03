#ifndef FILE_UTILS_H
#define FILE_UTILS_H

#include <string>
#include <vector>

std::string readFile(const std::string &path);
void writeToFile(const std::string &path, const std::string &content);
std::vector<std::string> split(const std::string &str, char delimiter);
std::vector<std::string> expandSourcePath(const std::string &path);

#endif // FILE_UTILS_H
