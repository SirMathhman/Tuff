// Parser facade — re-exports from split modules for backward compatibility.
import state from "./parser_state";
import { validateRefs, parseStatement } from "./statement_parser";

export default {
  get tokens() {
    return state.tokens;
  },
  set tokens(v) {
    state.tokens = v;
  },
  get pos() {
    return state.pos;
  },
  set pos(v) {
    state.pos = v;
  },

  validateRefs,
  parseStatement,
};
