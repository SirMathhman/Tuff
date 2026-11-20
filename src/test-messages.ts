/**
 * Expected error messages shared by the test files.
 */
export const NUMBER_WHY =
  "Every '+', '-', '*', '<', '>', '<=', '>=', '==', or '!=' must be followed by an integer, a variable, or a parenthesized or braced expression, and an expression must start with one.";
export const NUMBER_FIX =
  "Put an integer, a variable, '(' or '{' at this position, or remove the operator before it.";
export const OPERATOR_WHY =
  "Two numbers can only be combined with '+', '-', '*', '<', '>', '<=', '>=', '==', or '!='; any other character cannot follow a number.";
export const OPERATOR_FIX =
  "Insert '+', '-', '*', '<', '>', '<=', '>=', '==', or '!=' between the numbers, or remove the extra character.";
export const GROUPED_OPERATOR_WHY =
  "Two terms can only be combined with '+', '-', '*', '<', '>', '<=', '>=', '==', or '!=', and an opening bracket must be closed by its matching bracket; any other character cannot follow a number.";
export const GROUPED_OPERATOR_FIX =
  "Insert '+', '-', '*', '<', '>', '<=', '>=', '==', '!=', or a closing bracket here, or remove the extra character.";
export const UNDEFINED_WHY =
  "A variable is only visible inside the block where it was declared with 'let', and inside blocks nested in that block.";
export const MISMATCH_WHY =
  "Each opening bracket must be closed by its own kind of bracket: '(' by ')' and '{' by '}'.";
export const MISMATCH_FIX =
  "Replace this character with ')', or change the opening bracket.";
export const PAREN_CLOSE_WHY = "Every '(' must be closed by a matching ')'.";
export const PAREN_CLOSE_FIX =
  "Add a ')' at the end of the parenthesized expression.";
export const BRACE_CLOSE_WHY = "Every '{' must be closed by a matching '}'.";
export const BRACE_CLOSE_FIX = "Add a '}' at the end of the braced expression.";
export const EQUALS_WHY =
  "A 'let' statement gives its variable a value with '='.";
export const EQUALS_FIX = "Insert '=' between the name and its value.";
export const NAME_WHY =
  "A 'let' statement names the variable it declares, as in 'let x = 1;'.";
export const NAME_FIX = "Write a name made of letters after 'let'.";
export const KEYWORD_WHY =
  "'let' has a fixed meaning, so it cannot also name a variable.";
export const KEYWORD_FIX = "Choose a different name.";
export const SEMICOLON_WHY = "Every 'let' statement must end with ';'.";
export const SEMICOLON_FIX = "Add ';' after the value.";
export const STRAY_SEMICOLON_WHY = "';' only ends a 'let' statement.";
export const STRAY_SEMICOLON_FIX =
  "Remove the ';', or start the statement with 'let name ='.";
export const LET_POSITION_WHY =
  "A 'let' statement can only begin the program, a block, or follow a ';', so it cannot be part of a larger expression.";
export const LET_POSITION_FIX =
  "Move the 'let' statement out of the parentheses or operator, or remove the 'let'.";
