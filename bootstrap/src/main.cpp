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
#include "utils/build_config.h"
#include "utils/file_utils.h"

namespace fs = std::filesystem;

int main(int argc, char *argv[])
{
	if (argc < 2)
	{
		std::cerr << "Usage: tuffc [options]" << std::endl;
		std::cerr << "" << std::endl;
		std::cerr << "Options:" << std::endl;
		std::cerr << "  --build <file>           Build configuration file (default: build.json)" << std::endl;
		std::cerr << "  --profile <name>         Build profile: main (default) or test" << std::endl;
		std::cerr << "  --source-sets <paths>    Source directories to include (comma-separated)" << std::endl;
		std::cerr << "  --sources <paths>        Additional files to compile (comma-separated)" << std::endl;
		std::cerr << "  --target <target>        Compilation target (overrides build.json)" << std::endl;
		std::cerr << "  -o <output>              Write single output to file" << std::endl;
		std::cerr << "  --output-dir <dir>       Output directory for per-file generation" << std::endl;
		std::cerr << "  --lib                    Compile as library (don't generate main function)" << std::endl;
		std::cerr << "  --per-file               Generate separate .h and .cpp files (experimental)" << std::endl;
		return 1;
	}

	std::string buildFile = "build.json";
	std::string profile = "main";
	std::string target = "";
	std::string outputPath = "";
	std::string outputDir = "";
	std::vector<std::string> additionalSources;
	std::vector<std::string> explicitSourceSets;
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
		else if (arg == "--source-sets" && i + 1 < argc)
		{
			std::string sourceSetsList = argv[++i];
			auto paths = split(sourceSetsList, ',');
			explicitSourceSets.insert(explicitSourceSets.end(), paths.begin(), paths.end());
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
		else if (arg == "--output-dir" && i + 1 < argc)
		{
			outputDir = argv[++i];
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

	// Override output directory if specified
	if (!outputDir.empty())
	{
		config.outputDir = outputDir;
	}

	// Collect all source sets - but only if no explicit source sets were provided
	std::vector<std::string> allSourceSets;
	if (explicitSourceSets.empty())
	{
		// Use source sets from build.json
		if (additionalSources.empty())
		{
			allSourceSets = config.mainSourceSets;
			if (includeTests)
			{
				allSourceSets.insert(allSourceSets.end(), config.testSourceSets.begin(), config.testSourceSets.end());
			}
		}
	}
	else
	{
		// Use explicit source sets from command line
		allSourceSets = explicitSourceSets;
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
	std::vector<std::string> sourceFilePaths = sourcePaths;

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

	// ===== PER-FILE MODE (C++ WITHOUT -o FLAG) =====
	// Use per-file generation for C++ when not writing to stdout
	// This avoids duplicate declarations and enables parallel compilation
	bool usePerFileMode = (config.target == "cpp" && outputPath.empty());

	if (usePerFileMode)
	{
		// Generate separate .h and .cpp files for each source file
		CodeGeneratorCPP codegen;
		codegen.setIsLibrary(isLibrary);

		// Merge ASTs for type checking (all files need to see each other's types)
		auto mergedAst = std::make_shared<ASTNode>();
		mergedAst->type = ASTNodeType::PROGRAM;
		for (const auto &ast : asts)
		{
			for (auto child : ast->children)
			{
				mergedAst->children.push_back(child);
			}
		}

		// Type check all files together
		TypeChecker checker;
		checker.check(mergedAst);

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
				// Multiple files mode - write to dist/ preserving directory structure
				fs::path srcPath(sourceFilePaths[i]);

				// Get relative path from source root to preserve directory structure
				std::string relPath = srcPath.filename().string();
				for (const auto &sourceSet : allSourceSets)
				{
					if (sourceFilePaths[i].find(sourceSet) != std::string::npos)
					{
						size_t pos = sourceFilePaths[i].find(sourceSet);
						if (pos != std::string::npos)
						{
							relPath = sourceFilePaths[i].substr(pos + sourceSet.length());
							if (relPath.front() == '/' || relPath.front() == '\\')
								relPath = relPath.substr(1);
							break;
						}
					}
				}

				// Replace .tuff extension with .h/.cpp and add tuff_ prefix to avoid conflicts with system headers
				std::string relPathNoExt = relPath.substr(0, relPath.find_last_of('.'));
				std::string baseName = fs::path(relPathNoExt).filename().string();
				std::string parentPath = fs::path(relPathNoExt).parent_path().string();
				std::string prefixedName = "tuff_" + baseName;
				if (!parentPath.empty())
				{
					prefixedName = parentPath + "/" + prefixedName;
				}

				fs::path headerPath = fs::path(config.outputDir) / (prefixedName + ".h");
				fs::path implPath = fs::path(config.outputDir) / (prefixedName + ".cpp");

				// Create parent directories if needed
				if (!fs::exists(headerPath.parent_path()))
				{
					fs::create_directories(headerPath.parent_path());
				}

				writeToFile(headerPath.string(), fileOutput.header);
				writeToFile(implPath.string(), fileOutput.implementation);

				std::cerr << "Generated: " << headerPath.string() << std::endl;
				std::cerr << "Generated: " << implPath.string() << std::endl;
			}
		}

		// Copy builtin header files to output directory
		std::vector<std::string> builtinHeaders = {
				"argv_builtins.h",
				"file_builtins.h",
				"io_builtins.h",
				"process_builtins.h",
				"string_builtins.h"};

		for (const auto &builtinHeader : builtinHeaders)
		{
			// Find the header in source sets
			for (const auto &sourceSet : allSourceSets)
			{
				fs::path builtinPath = fs::path(sourceSet) / builtinHeader;
				if (fs::exists(builtinPath))
				{
					fs::path destPath = fs::path(config.outputDir) / builtinHeader;
					fs::copy_file(builtinPath, destPath, fs::copy_options::overwrite_existing);
					break;
				}
			}
		}

		// Generate CMakeLists.txt
		std::stringstream cmake;
		cmake << "cmake_minimum_required(VERSION 3.16)\n";
		cmake << "project(TuffGenerated)\n\n";
		cmake << "set(CMAKE_CXX_STANDARD 17)\n";
		cmake << "set(CMAKE_CXX_STANDARD_REQUIRED ON)\n\n";
		cmake << "# Source files\n";
		cmake << "set(SOURCES\n";

		for (size_t i = 0; i < asts.size(); i++)
		{
			fs::path srcPath(sourceFilePaths[i]);
			std::string relPath = srcPath.filename().string();
			for (const auto &sourceSet : allSourceSets)
			{
				if (sourceFilePaths[i].find(sourceSet) != std::string::npos)
				{
					size_t pos = sourceFilePaths[i].find(sourceSet);
					if (pos != std::string::npos)
					{
						relPath = sourceFilePaths[i].substr(pos + sourceSet.length());
						if (relPath.front() == '/' || relPath.front() == '\\')
							relPath = relPath.substr(1);
						break;
					}
				}
			}
			std::string relPathNoExt = relPath.substr(0, relPath.find_last_of('.'));
			cmake << "    " << relPathNoExt << ".cpp\n";
		}

		cmake << ")\n\n";

		if (!isLibrary)
		{
			cmake << "# Main wrapper to call tuff_main\n";
			cmake << "file(WRITE \"${CMAKE_CURRENT_BINARY_DIR}/main_wrapper.cpp\"\n";
			cmake << "\"int32_t tuff_main();\\n";
			cmake << "int main() { return tuff_main(); }\\n\")\n\n";
			cmake << "add_executable(tuff_program ${SOURCES} \"${CMAKE_CURRENT_BINARY_DIR}/main_wrapper.cpp\")\n";
		}
		else
		{
			cmake << "add_library(tuff_lib STATIC ${SOURCES})\n";
		}

		fs::path cmakePath = fs::path(config.outputDir) / "CMakeLists.txt";
		writeToFile(cmakePath.string(), cmake.str());
		std::cerr << "Generated: " << cmakePath.string() << std::endl;

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
