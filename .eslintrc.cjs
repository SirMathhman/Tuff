module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  rules: {
    'no-restricted-syntax': [
      'error',
      { selector: "Literal[regex]", message: 'Regex literals are banned. Use string APIs or parsing utilities instead.' },
      { selector: "NewExpression[callee.name='RegExp']", message: 'RegExp constructor is banned. Use string APIs or parsing utilities instead.' },
      { selector: "CallExpression[callee.name='RegExp']", message: 'RegExp call is banned. Use string APIs or parsing utilities instead.' },
    ],
  },
};
