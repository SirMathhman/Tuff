import { type ErrorWhere } from "./errors.ts";

// Grammar, implemented by the functions below:
//   program   := body
//   body      := statement* expr
//   statement := "let" "mut"? name "=" expr ";" | name "=" expr ";" | "{" statement* "}"
//   expr      := term (("+" | "-") term)*
//   term      := factor ("*" factor)*
//   factor    := "-"? primary
//   primary   := number | name | "(" expr ")" | "{" body "}"
// A name starts with a letter or underscore and continues with letters,
// digits, or underscores; "let" and "mut" are reserved. The parser builds an
// AST; the evaluator computes its value. primary receives expr as a parameter,
// so the rules form no static cycle.

interface NumberNode {
  kind: "number";
  value: number;
}


// Grammar, implemented by the functions below:
//   program   := body
//   body      := statement* expr
//   statement := "let" "mut"? name "=" expr ";" | name "=" expr ";" | "{" statement* "}"
//   expr      := term (("+" | "-") term)*
//   term      := factor ("*" factor)*
//   factor    := "-"? primary
//   primary   := number | name | "(" expr ")" | "{" body "}"
// A name starts with a letter or underscore and continues with letters,
// digits, or underscores; "let" and "mut" are reserved. The parser builds an
// AST; the evaluator computes its value. primary receives expr as a parameter,
// so the rules form no static cycle.

interface NegateNode {
  kind: "negate";
  operand: Expr;
}


// Grammar, implemented by the functions below:
//   program   := body
//   body      := statement* expr
//   statement := "let" "mut"? name "=" expr ";" | name "=" expr ";" | "{" statement* "}"
//   expr      := term (("+" | "-") term)*
//   term      := factor ("*" factor)*
//   factor    := "-"? primary
//   primary   := number | name | "(" expr ")" | "{" body "}"
// A name starts with a letter or underscore and continues with letters,
// digits, or underscores; "let" and "mut" are reserved. The parser builds an
// AST; the evaluator computes its value. primary receives expr as a parameter,
// so the rules form no static cycle.

interface ReferenceNode {
  kind: "reference";
  name: string;
  where: ErrorWhere;
}


// Grammar, implemented by the functions below:
//   program   := body
//   body      := statement* expr
//   statement := "let" "mut"? name "=" expr ";" | name "=" expr ";" | "{" statement* "}"
//   expr      := term (("+" | "-") term)*
//   term      := factor ("*" factor)*
//   factor    := "-"? primary
//   primary   := number | name | "(" expr ")" | "{" body "}"
// A name starts with a letter or underscore and continues with letters,
// digits, or underscores; "let" and "mut" are reserved. The parser builds an
// AST; the evaluator computes its value. primary receives expr as a parameter,
// so the rules form no static cycle.

/**
 * One operator and its right-hand operand in a chain.
 */
export interface Link {
  /** The operator applied to the running value. */
  op: "+" | "-" | "*";
  /** The right-hand operand. */
  operand: Expr;
  /** Where the operator appears in the token list. */
  where: ErrorWhere;
}


// Grammar, implemented by the functions below:
//   program   := body
//   body      := statement* expr
//   statement := "let" "mut"? name "=" expr ";" | name "=" expr ";" | "{" statement* "}"
//   expr      := term (("+" | "-") term)*
//   term      := factor ("*" factor)*
//   factor    := "-"? primary
//   primary   := number | name | "(" expr ")" | "{" body "}"
// A name starts with a letter or underscore and continues with letters,
// digits, or underscores; "let" and "mut" are reserved. The parser builds an
// AST; the evaluator computes its value. primary receives expr as a parameter,
// so the rules form no static cycle.

interface ChainNode {
  kind: "chain";
  first: Expr;
  links: Link[];
}


// Grammar, implemented by the functions below:
//   program   := body
//   body      := statement* expr
//   statement := "let" "mut"? name "=" expr ";" | name "=" expr ";" | "{" statement* "}"
//   expr      := term (("+" | "-") term)*
//   term      := factor ("*" factor)*
//   factor    := "-"? primary
//   primary   := number | name | "(" expr ")" | "{" body "}"
// A name starts with a letter or underscore and continues with letters,
// digits, or underscores; "let" and "mut" are reserved. The parser builds an
// AST; the evaluator computes its value. primary receives expr as a parameter,
// so the rules form no static cycle.

interface LetStatement {
  kind: "let";
  name: string;
  mutable: boolean;
  value: Expr;
}


// Grammar, implemented by the functions below:
//   program   := body
//   body      := statement* expr
//   statement := "let" "mut"? name "=" expr ";" | name "=" expr ";" | "{" statement* "}"
//   expr      := term (("+" | "-") term)*
//   term      := factor ("*" factor)*
//   factor    := "-"? primary
//   primary   := number | name | "(" expr ")" | "{" body "}"
// A name starts with a letter or underscore and continues with letters,
// digits, or underscores; "let" and "mut" are reserved. The parser builds an
// AST; the evaluator computes its value. primary receives expr as a parameter,
// so the rules form no static cycle.

/**
 * An assignment to a name that an enclosing let statement declared.
 */
export interface AssignStatement {
  /** The statement kind. */
  kind: "assign";
  /** The name being assigned. */
  name: string;
  /** The expression whose value replaces the name's value. */
  value: Expr;
  /** Where the assigned name appears in the token list. */
  where: ErrorWhere;
}


// Grammar, implemented by the functions below:
//   program   := body
//   body      := statement* expr
//   statement := "let" "mut"? name "=" expr ";" | name "=" expr ";" | "{" statement* "}"
//   expr      := term (("+" | "-") term)*
//   term      := factor ("*" factor)*
//   factor    := "-"? primary
//   primary   := number | name | "(" expr ")" | "{" body "}"
// A name starts with a letter or underscore and continues with letters,
// digits, or underscores; "let" and "mut" are reserved. The parser builds an
// AST; the evaluator computes its value. primary receives expr as a parameter,
// so the rules form no static cycle.

interface ScopeStatement {
  kind: "scope";
  statements: Statement[];
}


// Grammar, implemented by the functions below:
//   program   := body
//   body      := statement* expr
//   statement := "let" "mut"? name "=" expr ";" | name "=" expr ";" | "{" statement* "}"
//   expr      := term (("+" | "-") term)*
//   term      := factor ("*" factor)*
//   factor    := "-"? primary
//   primary   := number | name | "(" expr ")" | "{" body "}"
// A name starts with a letter or underscore and continues with letters,
// digits, or underscores; "let" and "mut" are reserved. The parser builds an
// AST; the evaluator computes its value. primary receives expr as a parameter,
// so the rules form no static cycle.
/**
 * A statement inside a block body: a let declaration, an assignment, or a statement block.
 */
export type Statement = LetStatement | AssignStatement | ScopeStatement;


// Grammar, implemented by the functions below:
//   program   := body
//   body      := statement* expr
//   statement := "let" "mut"? name "=" expr ";" | name "=" expr ";" | "{" statement* "}"
//   expr      := term (("+" | "-") term)*
//   term      := factor ("*" factor)*
//   factor    := "-"? primary
//   primary   := number | name | "(" expr ")" | "{" body "}"
// A name starts with a letter or underscore and continues with letters,
// digits, or underscores; "let" and "mut" are reserved. The parser builds an
// AST; the evaluator computes its value. primary receives expr as a parameter,
// so the rules form no static cycle.

interface BlockNode {
  kind: "block";
  statements: Statement[];
  result: Expr;
}


// Grammar, implemented by the functions below:
//   program   := body
//   body      := statement* expr
//   statement := "let" "mut"? name "=" expr ";" | name "=" expr ";" | "{" statement* "}"
//   expr      := term (("+" | "-") term)*
//   term      := factor ("*" factor)*
//   factor    := "-"? primary
//   primary   := number | name | "(" expr ")" | "{" body "}"
// A name starts with a letter or underscore and continues with letters,
// digits, or underscores; "let" and "mut" are reserved. The parser builds an
// AST; the evaluator computes its value. primary receives expr as a parameter,
// so the rules form no static cycle.
/**
 * A parsed expression: a number, a name, a negation, a chain of operators, or a block.
 */
export type Expr =
  | NumberNode
  | NegateNode
  | ReferenceNode
  | ChainNode
  | BlockNode;
