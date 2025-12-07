#ifndef INTERPRET_H
#define INTERPRET_H

/*
 * interpret.h
 * Interpret a simple arithmetic expression and return the result as a
 * newly-allocated string. The caller is responsible for freeing the
 * returned string.
 */

char *interpret(const char *s);

#endif /* INTERPRET_H */
