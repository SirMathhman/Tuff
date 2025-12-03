#include "utils/build_config.h"
#include "json_parser.h"
#include <fstream>
#include <sstream>
#include <filesystem>
#include <iostream>

namespace fs = std::filesystem;

BuildConfig loadBuildConfig(const std::string &buildFilePath, bool includeTests)
{
	BuildConfig config;
	config.target = "cpp";
	config.outputDir = "dist";
	config.includeTests = includeTests;

	if (!fs::exists(buildFilePath))
	{
		return config; // Return defaults if no build file
	}

	std::string jsonContent;
	{
		std::ifstream file(buildFilePath);
		if (!file.is_open())
		{
			std::cerr << "Could not open file: " << buildFilePath << std::endl;
			exit(1);
		}
		std::stringstream buffer;
		buffer << file.rdbuf();
		jsonContent = buffer.str();
	}

	auto root = json::parse(jsonContent);

	if (root->type == json::Value::Type::Object)
	{
		// Parse main sourceSets
		if (root->objectValue.count("main"))
		{
			auto mainObj = root->objectValue["main"];
			if (mainObj->type == json::Value::Type::Object && mainObj->objectValue.count("sourceSets"))
			{
				auto sourceSets = mainObj->objectValue["sourceSets"];
				if (sourceSets->type == json::Value::Type::Array)
				{
					for (const auto &item : sourceSets->arrayValue)
					{
						if (item->type == json::Value::Type::String)
						{
							config.mainSourceSets.push_back(item->stringValue);
						}
					}
				}
			}
		}

		// Parse test sourceSets if requested
		if (includeTests && root->objectValue.count("test"))
		{
			auto testObj = root->objectValue["test"];
			if (testObj->type == json::Value::Type::Object && testObj->objectValue.count("sourceSets"))
			{
				auto sourceSets = testObj->objectValue["sourceSets"];
				if (sourceSets->type == json::Value::Type::Array)
				{
					for (const auto &item : sourceSets->arrayValue)
					{
						if (item->type == json::Value::Type::String)
						{
							config.testSourceSets.push_back(item->stringValue);
						}
					}
				}
			}
		}

		// Parse target
		if (root->objectValue.count("target"))
		{
			auto targetVal = root->objectValue["target"];
			if (targetVal->type == json::Value::Type::String)
			{
				config.target = targetVal->stringValue;
			}
		}

		// Parse outputDir
		if (root->objectValue.count("outputDir"))
		{
			auto outputDirVal = root->objectValue["outputDir"];
			if (outputDirVal->type == json::Value::Type::String)
			{
				config.outputDir = outputDirVal->stringValue;
			}
		}
	}

	return config;
}

void copyBuiltinHeaders(const std::string &outputDir, const std::vector<std::string> &sourceSetDirs)
{
	// Copy all .h and .cpp files from each source set directory
	for (const auto &sourceSetDir : sourceSetDirs)
	{
		fs::path sourceDir(sourceSetDir);
		if (fs::exists(sourceDir) && fs::is_directory(sourceDir))
		{
			for (const auto &entry : fs::recursive_directory_iterator(sourceDir))
			{
				if (fs::is_regular_file(entry))
				{
					auto ext = entry.path().extension().string();
					if (ext == ".h" || ext == ".cpp" || ext == ".hpp")
					{
						fs::path destPath = fs::path(outputDir) / entry.path().filename();
						fs::copy_file(entry.path(), destPath, fs::copy_options::overwrite_existing);
					}
				}
			}
		}
	}
}
