// Reports a section whose own text (excluding its heading and nested sections)
// is longer than MAX_CHARACTERS.
import { bodyCharacters, collectSections } from "./sections.mjs";

const MAX_CHARACTERS = 250;

export default {
  names: ["max-section-chars"],
  description: `A section's own text may be at most ${MAX_CHARACTERS} characters`,
  tags: ["headings"],
  parser: "markdownit",
  function: (params, onError) => {
    for (const section of collectSections(
      params.parsers.markdownit.tokens,
      params.lines,
    )) {
      const characters = bodyCharacters(section, params.lines);
      if (characters > MAX_CHARACTERS) {
        onError({
          lineNumber: section.line + 1,
          detail: `The section's text has ${characters} characters; the maximum is ${MAX_CHARACTERS}.`,
        });
      }
    }
  },
};
