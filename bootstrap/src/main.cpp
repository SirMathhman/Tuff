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

void copyBuiltinHeaders(const std::string &outputDir, const std::vector<std::string> &sourcePaths)
{
	// Find the Tuff source root by looking for src/tuff in source paths
	std::string tuffRoot;
	for (const auto &srcPath : sourcePaths)
	{
		fs::path p(srcPath);
		// Look for src/tuff in the path
		auto pathStr = p.string();
		size_t pos = pathStr.find("src");
		if (pos != std::string::npos)
		{
			tuffRoot = pathStr.substr(0, pos);
			break;
		}
	}

	if (tuffRoot.empty())
	{
		// Fallback: assume src/tuff is relative to current directory
		tuffRoot = ".";
	}

	// Copy all .h and .cpp files from src/tuff to output directory
	fs::path sourceDir = fs::path(tuffRoot) / "src" / "tuff";
	if (fs::exists(sourceDir) && fs::is_directory(sourceDir))
	{
		for (const auto &entry : fs::directory_iterator(sourceDir))
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
		std::cerr << "  --sources <paths>        Files, directories, or root directories to compile (comma-separated)" << std::endl;
		std::cerr << "  --target <target>        Compilation target (default: cpp)" << std::endl;
		std::cerr << "  -o <output>              Write single output to file (conflicts with --out-root-dir)" << std::endl;
		std::cerr << "  --out-root-dir <dir>     Write outputs to directory, preserving structure (conflicts with -o)" << std::endl;
		std::cerr << "  --lib                    Compile as library (don't generate main function)" << std::endl;
		return 1;
	}

	std::string target = "cpp";
	std::string outputPath = "";
	std::string outRootDir = "";
	std::vector<std::string> sourcePaths;
	bool isLibrary = false;

	// Parse arguments
	for (int i = 1; i < argc; i++)
	{
		std::string arg = argv[i];
		if (arg == "--sources" && i + 1 < argc)
		{
			std::string sourcesList = argv[++i];
			auto paths = split(sourcesList, ',');
			for (const auto &p : paths)
			{
				auto expanded = expandSourcePath(p);
				sourcePaths.insert(sourcePaths.end(), expanded.begin(), expanded.end());
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
		else if (arg == "--out-root-dir" && i + 1 < argc)
		{
			outRootDir = argv[++i];
		}
		else if (arg == "--lib")
		{
			isLibrary = true;
		}
	}

	// Validation
	if (sourcePaths.empty())
	{
		std::cerr << "Error: no source files specified (use --sources)" << std::endl;
		return 1;
	}

	if (!outputPath.empty() && !outRootDir.empty())
	{
		std::cerr << "Error: cannot use both -o and --out-root-dir" << std::endl;
		return 1;
	}

	// Read and parse all source files
	std::vector<std::shared_ptr<ASTNode>> asts;

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

	// 3. Type Checking
	TypeChecker checker;
	checker.check(mergedAst);

	// 4. Code Generation
	std::string output;
	if (target == "cpp")
	{
		CodeGeneratorCPP codegen;
		codegen.setIsLibrary(isLibrary);

		// Copy builtin headers to output directory
		if (!outputPath.empty())
		{
			fs::path outPath(outputPath);
			copyBuiltinHeaders(outPath.parent_path().string(), sourcePaths);
		}
		else if (!outRootDir.empty())
		{
			copyBuiltinHeaders(outRootDir, sourcePaths);
		}

		output = codegen.generate(mergedAst);
	}
	else
	{
		std::cerr << "Unknown target: " << target << std::endl;
		return 1;
	}

	// Write output
	if (!outputPath.empty())
	{
		writeToFile(outputPath, output);
		std::cerr << "Compiled to: " << outputPath << std::endl;
	}
	else if (!outRootDir.empty())
	{
		// For single file, write to outRootDir/filename
		if (sourcePaths.size() == 1)
		{
			fs::path srcPath(sourcePaths[0]);
			std::string outExtension = (target == "cpp") ? ".cpp" : ".js";
			fs::path outPath = fs::path(outRootDir) / srcPath.stem().string() += outExtension;
			writeToFile(outPath.string(), output);
			std::cerr << "Compiled to: " << outPath.string() << std::endl;
		}
		else
		{
			std::cerr << "Warning: --out-root-dir with multiple sources not yet fully supported" << std::endl;
		}
	}
	else
	{
		// Write to stdout
		std::cout << output;
	}

	return 0;
}
