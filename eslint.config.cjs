module.exports = [
  {
    ignores: ["node_modules/**", "dist/**", "coverage/**"],
  },

  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: require("@typescript-eslint/parser"),
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": require("@typescript-eslint/eslint-plugin"),
      local: {
        rules: {
          "no-this-scope-argument": {
            meta: {
              type: "suggestion",
              docs: {
                description:
                  "Disallow passing `this` into scope helper functions (use a ScopeKey instead)",
              },
              schema: [],
              messages: {
                noThisScopeArg:
                  "Do not pass `this` into scope helpers; use `this.scopeKey` (or equivalent) instead.",
              },
            },
            create(context) {
              const forbiddenCallees = new Set([
                "initScopes",
                "getValueScopes",
                "getStructTypeScopes",
                "getVarTypeScopes",
                "getVarMutabilityScopes",
                "getVarInitializedScopes",
              ]);

              function isForbiddenIdentifierCallee(node) {
                if (!node) return false;
                if (node.type !== "Identifier") return false;
                return forbiddenCallees.has(node.name);
              }

              function hasThisArgument(args) {
                if (!Array.isArray(args)) return false;
                for (const a of args) {
                  if (!a) continue;
                  if (a.type === "ThisExpression") return true;
                  if (a.type === "SpreadElement" && a.argument?.type === "ThisExpression") return true;
                }
                return false;
              }

              return {
                CallExpression(node) {
                  if (!isForbiddenIdentifierCallee(node.callee)) return;
                  if (!hasThisArgument(node.arguments)) return;
                  context.report({ node, messageId: "noThisScopeArg" });
                },
              };
            },
          },
          "max-interface-methods": {
            meta: {
              type: "suggestion",
              docs: {
                description:
                  "Disallow interfaces with too many methods (god-interface prevention)",
              },
              schema: [
                {
                  type: "object",
                  properties: {
                    max: { type: "integer", minimum: 1 },
                  },
                  additionalProperties: false,
                },
              ],
              messages: {
                tooMany:
                  "Interface '{{name}}' has {{count}} methods; maximum allowed is {{max}}.",
              },
            },
            create(context) {
              function getMax(option) {
                if (!option) return 10;
                const max = option.max;
                if (typeof max !== "number") return 10;
                if (!Number.isFinite(max)) return 10;
                if (max < 1) return 10;
                return Math.floor(max);
              }

              function isMethodLike(member) {
                const t = member.type;
                if (t === "TSMethodSignature") return true;
                if (t === "TSCallSignatureDeclaration") return true;
                if (t === "TSConstructSignatureDeclaration") return true;
                return false;
              }

              return {
                TSInterfaceDeclaration(node) {
                  const opts = context.options;
                  const firstOpt = Array.isArray(opts) ? opts[0] : undefined;
                  const max = getMax(firstOpt);

                  const body = node.body;
                  const members = body.body;
                  let methodCount = 0;
                  for (const m of members) {
                    if (isMethodLike(m)) methodCount++;
                  }

                  if (methodCount <= max) return;

                  const id = node.id;
                  const name = id ? id.name : "<anonymous>";
                  context.report({
                    node: node.id ? node.id : node,
                    messageId: "tooMany",
                    data: {
                      name,
                      count: String(methodCount),
                      max: String(max),
                    },
                  });
                },
              };
            },
          },
        },
      },
    },
    rules: {
      "local/no-this-scope-argument": "error",
      "local/max-interface-methods": ["error", { max: 10 }],
      complexity: ["error", { max: 15 }],
      // prefer interfaces over type aliases for object types
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      "@typescript-eslint/no-this-alias": "error",
      // limit function body size
      "max-lines-per-function": [
        "error",
        { max: 50, skipComments: true, skipBlankLines: true },
      ],
      // limit file length to encourage smaller modules (include comments)
      "max-lines": [
        "error",
        { max: 500, skipComments: false, skipBlankLines: true },
      ],
      // disallow throw statements; use Result<T,E> style returns instead
      "no-restricted-syntax": [
        "error",
        {
          selector: "ThrowStatement",
          message: "Do not use throw; return Result<T, E> instead.",
        },
        {
          selector:
            "VariableDeclarator > ArrowFunctionExpression, VariableDeclarator > FunctionExpression",
          message:
            "Use a function declaration `function name(...) {}` instead of assigning a function expression or arrow function to a variable.",
        },
        {
          selector:
            "FunctionDeclaration TSInterfaceDeclaration, FunctionExpression TSInterfaceDeclaration, ArrowFunctionExpression TSInterfaceDeclaration",
          message:
            "Do not declare interfaces inside functions; declare them at module scope instead.",
        },
        {
          selector: "MemberExpression[object.type='MemberExpression']",
          message:
            "Avoid chained property access (Law of Demeter): prefer retrieving necessary data via single-level access or helper methods.",
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.type='MemberExpression']",
          message:
            "Avoid chaining method/property accesses (Law of Demeter): consider extracting into helper functions or intermediate variables.",
        },
        {
          selector: "BreakStatement",
          message:
            "Avoid 'break'; prefer explicit loop conditions or refactor into smaller functions.",
        },
        {
          selector: "ContinueStatement",
          message:
            "Avoid 'continue'; prefer clearer control flow or use helper functions.",
        },
        {
          selector:
            "MemberExpression[object.type=MemberExpression], MemberExpression[object.type=CallExpression]",
          message:
            "Avoid chained property or call access (a.b.c or a.b().c); prefer Law of Demeter (tell, don't ask).",
        },
        {
          selector: "TSAsExpression",
          message:
            "Do not use 'as' type assertions; prefer typed factory helpers or explicit variable typing.",
        },
        {
          selector: "Literal[value=null]",
          message: "Do not use 'null'; prefer 'undefined' instead.",
        },
        {
          selector: "NullLiteral",
          message: "Do not use 'null'; prefer 'undefined' instead.",
        },
        {
          selector:
            "TSTypeReference[typeName.name='Result'] TSTypeParameterInstantiation > TSUndefinedKeyword",
          message:
            "Do not use Result<undefined, ...>; prefer returning 'InterpretError | undefined' instead.",
        },
      ],
      "@typescript-eslint/no-explicit-any": ["error"],
      "@typescript-eslint/no-restricted-types": [
        "error",
        {
          types: {
            object: {
              message:
                "Use 'unknown' or a specific interface instead of 'object'",
              fixWith: "Record<string, unknown>",
            },
          },
        },
      ],
      ...require("@typescript-eslint/eslint-plugin").configs.recommended.rules,
    },
  },
];
