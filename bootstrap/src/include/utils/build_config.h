#ifndef BUILD_CONFIG_H
#define BUILD_CONFIG_H

#include <string>
#include <vector>

struct BuildConfig
{
	std::vector<std::string> mainSourceSets;
	std::vector<std::string> testSourceSets;
	std::string target;
	std::string outputDir;
	bool includeTests = false;
};

BuildConfig loadBuildConfig(const std::string &buildFilePath, bool includeTests);
void copyBuiltinHeaders(const std::string &outputDir, const std::vector<std::string> &sourceSetDirs);

#endif // BUILD_CONFIG_H
