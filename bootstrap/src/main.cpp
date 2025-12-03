#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <filesystem>

#include "lexer.h"
#include "parser.h"
#include "type_checker.h"
#include "codegen_cpp.h"
#include "ast_typed.h"
#include "ast_converter.h"
#include "codegen_typed.h"
#include "json_parser.h"

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

struct BuildConfig
{
	std::vector<std::string> mainSourceSets;
	std::vector<std::string> testSourceSets;
	std::string target;
	std::string outputDir;
	bool includeTests = false;
};

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

	std::string jsonContent = readFile(buildFilePath);
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

int main(int argc, char *argv[])
{
	if (argc < 2)
	{
		std::cerr << "Usage: tuffc [options]" << std::endl;
		std::cerr << "" << std::endl;
		std::cerr << "Options:" << std::endl;
		std::cerr << "  --build <file>           Build configuration file (default: build.json)" << std::endl;
		std::cerr << "  --profile <name>         Build profile: main (default) or test" << std::endl;
		std::cerr << "  --sources <paths>        Additional files to compile (comma-separated)" << std::endl;
		std::cerr << "  --target <target>        Compilation target (overrides build.json)" << std::endl;
		std::cerr << "  -o <output>              Write single output to file" << std::endl;
		std::cerr << "  --lib                    Compile as library (don't generate main function)" << std::endl;
		std::cerr << "  --per-file               Generate separate .h and .cpp files (experimental)" << std::endl;
		return 1;
	}

	std::string buildFile = "build.json";
	std::string profile = "main";
	std::string target = "";
	std::string outputPath = "";
	std::vector<std::string> additionalSources;
	bool isLibrary = false;
	bool perFileMode = false;

	// Parse arguments
	for (int i = 1; i < argc; i++)
	{
		std::string arg = argv[i];
		if (arg == "--build" && i + 1 < argc)
		{
			buildFile = argv[++i];
		}
		else if (arg == "--profile" && i + 1 < argc)
		{
			profile = argv[++i];
		}
		else if (arg == "--sources" && i + 1 < argc)
		{
			std::string sourcesList = argv[++i];
			auto paths = split(sourcesList, ',');
			for (const auto &p : paths)
			{
				auto expanded = expandSourcePath(p);
				additionalSources.insert(additionalSources.end(), expanded.begin(), expanded.end());
			}
		}
		else if (arg == "--target" && i + 1 < argc)
		{
			target = argv[++i];
		}
		else if (arg == "-o" && i + 1 < argc)
		{
			outputPath = argv[++i];
		}
		else if (arg == "--lib")
		{
			isLibrary = true;
		}
		else if (arg == "--per-file")
		{
			perFileMode = true;
		}
	}

	// Load build configuration
	bool includeTests = (profile == "test");
	BuildConfig config = loadBuildConfig(buildFile, includeTests);

	// Override target if specified on command line
	if (!target.empty())
	{
		config.target = target;
	}

	// Collect all source sets - but only if no explicit sources were provided
	std::vector<std::string> allSourceSets;
	if (additionalSources.empty())
	{
		allSourceSets = config.mainSourceSets;
		if (includeTests)
		{
			allSourceSets.insert(allSourceSets.end(), config.testSourceSets.begin(), config.testSourceSets.end());
		}
	}

	// Collect all source files from source sets
	std::vector<std::string> sourcePaths;
	for (const auto &sourceSet : allSourceSets)
	{
		if (fs::exists(sourceSet) && fs::is_directory(sourceSet))
		{
			auto expanded = expandSourcePath(sourceSet);
			// Only add .tuff files
			for (const auto &path : expanded)
			{
				if (path.size() >= 5 && path.substr(path.size() - 5) == ".tuff")
				{
					sourcePaths.push_back(path);
				}
			}
		}
	}

	// Add additional sources
	sourcePaths.insert(sourcePaths.end(), additionalSources.begin(), additionalSources.end());

	// Validation
	if (sourcePaths.empty())
	{
		std::cerr << "Error: no source files found. Check build.json configuration." << std::endl;
		return 1;
	}

	// Read and parse all source files
	std::vector<std::shared_ptr<ASTNode>> asts;
	std::vector<std::string> sourceFilePaths = sourcePaths; // Keep for per-file mode

	for (const auto &path : sourcePaths)
	{
		std::string sourceCode = readFile(path);

		// 1. Lexing
		Lexer lexer(sourceCode);
		auto tokens = lexer.tokenize();

		// 2. Parsing
		Parser parser(tokens);
		auto ast = parser.parse();

		asts.push_back(ast);
	}

	// ===== PER-FILE MODE (EXPERIMENTAL) =====
	if (perFileMode && config.target == "cpp")
	{
		// Generate separate .h and .cpp files for each source file
		CodeGeneratorCPP codegen;
		codegen.setIsLibrary(isLibrary);

		// Type check each AST individually
		TypeChecker checker;
		for (auto ast : asts)
		{
			checker.check(ast);
		}

		// Generate files
		for (size_t i = 0; i < asts.size(); i++)
		{
			fs::path srcPath(sourceFilePaths[i]);
			std::string moduleName = srcPath.stem().string();

			// Generate header and implementation
			FileOutput fileOutput = codegen.generateFile(asts[i], moduleName);

			// Write to console or file
			if (!outputPath.empty())
			{
				// Single file mode - write first file only
				std::cerr << "// ========== " << moduleName << ".h ==========\n";
				std::cout << fileOutput.header << "\n";
				std::cerr << "\n// ========== " << moduleName << ".cpp ==========\n";
				std::cout << fileOutput.implementation << "\n";
				break;
			}
			else
			{
				// Multiple files mode - write to dist/
				fs::path headerPath = fs::path(config.outputDir) / (moduleName + ".h");
				fs::path implPath = fs::path(config.outputDir) / (moduleName + ".cpp");

				if (!fs::exists(config.outputDir))
				{
					fs::create_directories(config.outputDir);
				}

				writeToFile(headerPath.string(), fileOutput.header);
				writeToFile(implPath.string(), fileOutput.implementation);

				std::cerr << "Generated: " << headerPath.string() << std::endl;
				std::cerr << "Generated: " << implPath.string() << std::endl;
			}
		}

		return 0; // Exit after per-file generation
	}

	// ===== LEGACY MERGED MODE =====
	// Merge ASTs (combine children from all source files)
	auto mergedAst = std::make_shared<ASTNode>();
	mergedAst->type = ASTNodeType::PROGRAM;

	for (const auto &ast : asts)
	{
		for (auto child : ast->children)
		{
			mergedAst->children.push_back(child);
		}
	}

	// Debug: check for duplicates
	std::map<std::string, int> nodeCounts;
	for (auto child : mergedAst->children)
	{
		if (child->type == ASTNodeType::IMPL_DECL)
		{
			std::string key = "IMPL " + child->value;
			nodeCounts[key]++;
		}
	}
	for (auto const &[key, val] : nodeCounts)
	{
		if (val > 1)
			std::cerr << "Duplicate node: " << key << " count=" << val << std::endl;
	}

	// 3. Type Checking
	TypeChecker checker;
	checker.check(mergedAst);

	// 4. Code Generation
	std::string output;
	if (config.target == "cpp")
	{
		CodeGeneratorCPP codegen;
		codegen.setIsLibrary(isLibrary);

		// Copy builtin headers to output directory
		if (!outputPath.empty())
		{
			fs::path outPath(outputPath);
			copyBuiltinHeaders(outPath.parent_path().string(), allSourceSets);
		}
		else
		{
			// Create output directory if it doesn't exist
			if (!fs::exists(config.outputDir))
			{
				fs::create_directories(config.outputDir);
			}
			copyBuiltinHeaders(config.outputDir, allSourceSets);
		}

		output = codegen.generate(mergedAst);
	}
	else
	{
		std::cerr << "Unknown target: " << config.target << std::endl;
		return 1;
	}

	// Write output
	if (!outputPath.empty())
	{
		writeToFile(outputPath, output);
		std::cerr << "Compiled to: " << outputPath << std::endl;
	}
	else
	{
		// Write to configured output directory
		if (sourcePaths.size() == 1)
		{
			fs::path srcPath(sourcePaths[0]);
			std::string outExtension = (config.target == "cpp") ? ".cpp" : ".js";
			fs::path outPath = fs::path(config.outputDir) / (srcPath.stem().string() + outExtension);
			writeToFile(outPath.string(), output);
			std::cerr << "Compiled to: " << outPath.string() << std::endl;
		}
		else
		{
			// Write to stdout for multiple files
			std::cout << output;
		}
	}

	return 0;
}
