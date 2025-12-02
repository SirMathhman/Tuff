#include "codegen_cpp.h"
#include <sstream>
#include <set>
#include <map>
#include <queue>
#include <algorithm>

// Extract type dependencies from a type string
// e.g., "Option<I32>" -> {"Option", "I32"}
// e.g., "*mut Vector<T>" -> {"Vector", "T"}
// e.g., "Some<T>|None<T>" -> {"Some", "None", "T"}
std::set<std::string> CodeGeneratorCPP::extractTypeDependencies(const std::string &typeStr)
{
	std::set<std::string> deps;
	if (typeStr.empty())
		return deps;

	// Skip primitives - they have no dependencies
	static const std::set<std::string> primitives = {
			"I8", "I16", "I32", "I64",
			"U8", "U16", "U32", "U64",
			"F32", "F64", "Bool", "Void", "USize",
			"int8_t", "int16_t", "int32_t", "int64_t",
			"uint8_t", "uint16_t", "uint32_t", "uint64_t",
			"float", "double", "bool", "void", "size_t",
			"string" // opaque type, handled externally
	};

	std::string type = typeStr;

	// Strip pointer prefixes: *, *mut, &, &mut
	while (!type.empty())
	{
		if (type[0] == '*' || type[0] == '&')
		{
			type = type.substr(1);
			// Skip "mut " if present
			if (type.substr(0, 4) == "mut ")
				type = type.substr(4);
			continue;
		}
		break;
	}

	// Handle union types: A|B|C
	if (type.find('|') != std::string::npos)
	{
		// Split by | but respect nested generics
		int depth = 0;
		std::string current;
		for (char c : type)
		{
			if (c == '<')
				depth++;
			else if (c == '>')
				depth--;
			else if (c == '|' && depth == 0)
			{
				if (!current.empty())
				{
					auto subDeps = extractTypeDependencies(current);
					deps.insert(subDeps.begin(), subDeps.end());
				}
				current.clear();
				continue;
			}
			current += c;
		}
		if (!current.empty())
		{
			auto subDeps = extractTypeDependencies(current);
			deps.insert(subDeps.begin(), subDeps.end());
		}
		return deps;
	}

	// Handle intersection types: A & B
	if (type.find(" & ") != std::string::npos)
	{
		size_t pos = type.find(" & ");
		auto left = extractTypeDependencies(type.substr(0, pos));
		auto right = extractTypeDependencies(type.substr(pos + 3));
		deps.insert(left.begin(), left.end());
		deps.insert(right.begin(), right.end());
		return deps;
	}

	// Handle array types: [T; N; M] or [T]
	if (!type.empty() && type[0] == '[')
	{
		size_t semiPos = type.find(';');
		size_t endPos = (semiPos != std::string::npos) ? semiPos : type.find(']');
		if (endPos != std::string::npos && endPos > 1)
		{
			std::string elemType = type.substr(1, endPos - 1);
			auto subDeps = extractTypeDependencies(elemType);
			deps.insert(subDeps.begin(), subDeps.end());
		}
		return deps;
	}

	// Handle generic types: Name<T, U>
	size_t anglePos = type.find('<');
	if (anglePos != std::string::npos)
	{
		std::string baseName = type.substr(0, anglePos);
		if (primitives.find(baseName) == primitives.end() && !baseName.empty())
		{
			// Check if it's a single uppercase letter (generic param)
			if (!(baseName.length() == 1 && baseName[0] >= 'A' && baseName[0] <= 'Z'))
			{
				deps.insert(baseName);
			}
		}

		// Extract generic arguments
		size_t closePos = type.rfind('>');
		if (closePos != std::string::npos && closePos > anglePos)
		{
			std::string args = type.substr(anglePos + 1, closePos - anglePos - 1);
			// Split by comma, respecting nested generics
			int depth = 0;
			std::string current;
			for (char c : args)
			{
				if (c == '<')
					depth++;
				else if (c == '>')
					depth--;
				else if (c == ',' && depth == 0)
				{
					if (!current.empty())
					{
						// Trim whitespace
						size_t start = current.find_first_not_of(" ");
						size_t end = current.find_last_not_of(" ");
						if (start != std::string::npos)
						{
							current = current.substr(start, end - start + 1);
						}
						auto subDeps = extractTypeDependencies(current);
						deps.insert(subDeps.begin(), subDeps.end());
					}
					current.clear();
					continue;
				}
				current += c;
			}
			if (!current.empty())
			{
				size_t start = current.find_first_not_of(" ");
				size_t end = current.find_last_not_of(" ");
				if (start != std::string::npos)
				{
					current = current.substr(start, end - start + 1);
				}
				auto subDeps = extractTypeDependencies(current);
				deps.insert(subDeps.begin(), subDeps.end());
			}
		}
		return deps;
	}

	// Simple type name
	if (primitives.find(type) == primitives.end() && !type.empty())
	{
		// Skip single uppercase letters (generic params like T, U, etc.)
		if (!(type.length() == 1 && type[0] >= 'A' && type[0] <= 'Z'))
		{
			deps.insert(type);
		}
	}

	return deps;
}

// Extract dependencies from an AST node (struct, type alias, etc.)
std::set<std::string> CodeGeneratorCPP::extractNodeDependencies(std::shared_ptr<ASTNode> node)
{
	std::set<std::string> deps;
	if (!node)
		return deps;

	if (node->type == ASTNodeType::STRUCT_DECL)
	{
		// Struct fields depend on their types
		for (auto field : node->children)
		{
			auto fieldDeps = extractTypeDependencies(field->inferredType);
			deps.insert(fieldDeps.begin(), fieldDeps.end());
		}
	}
	else if (node->type == ASTNodeType::TYPE_ALIAS)
	{
		// Type alias depends on the aliased type
		auto aliasDeps = extractTypeDependencies(node->inferredType);
		deps.insert(aliasDeps.begin(), aliasDeps.end());
	}
	else if (node->type == ASTNodeType::ENUM_DECL)
	{
		// Enums have no dependencies (they're primitive-like)
	}

	// Remove self-reference (a type doesn't depend on itself)
	deps.erase(node->value);

	// Remove generic parameters from dependencies
	for (auto genParam : node->genericParams)
	{
		deps.erase(genParam->value);
	}

	return deps;
}

// Topological sort using Kahn's algorithm
std::vector<std::shared_ptr<ASTNode>> CodeGeneratorCPP::topologicalSortTypes(
		const std::vector<std::shared_ptr<ASTNode>> &nodes)
{
	// Build name -> node mapping
	std::map<std::string, std::shared_ptr<ASTNode>> nodeByName;
	for (auto node : nodes)
	{
		nodeByName[node->value] = node;
	}

	// Build dependency graph and in-degree count
	std::map<std::string, std::set<std::string>> graph;			 // node -> dependencies
	std::map<std::string, std::set<std::string>> dependents; // node -> nodes that depend on it
	std::map<std::string, int> inDegree;

	for (auto node : nodes)
	{
		std::string name = node->value;
		auto deps = extractNodeDependencies(node);

		// Filter to only include dependencies that are in our node list
		std::set<std::string> filteredDeps;
		for (const auto &dep : deps)
		{
			if (nodeByName.find(dep) != nodeByName.end())
			{
				filteredDeps.insert(dep);
				dependents[dep].insert(name);
			}
		}

		graph[name] = filteredDeps;
		inDegree[name] = static_cast<int>(filteredDeps.size());
	}

	// Kahn's algorithm
	std::queue<std::string> queue;
	for (auto node : nodes)
	{
		if (inDegree[node->value] == 0)
		{
			queue.push(node->value);
		}
	}

	std::vector<std::shared_ptr<ASTNode>> sorted;
	while (!queue.empty())
	{
		std::string name = queue.front();
		queue.pop();

		if (nodeByName.find(name) != nodeByName.end())
		{
			sorted.push_back(nodeByName[name]);
		}

		// Reduce in-degree of dependents
		for (const auto &dependent : dependents[name])
		{
			inDegree[dependent]--;
			if (inDegree[dependent] == 0)
			{
				queue.push(dependent);
			}
		}
	}

	// Check for cycles (if sorted size < input size)
	if (sorted.size() < nodes.size())
	{
		// Cycle detected - fall back to original order with a warning
		std::cerr << "Warning: Circular type dependency detected, using source order" << std::endl;
		return nodes;
	}

	return sorted;
}
