// Reports a heading that has more than MAX_SUBSECTIONS direct subsections.
import { collectSections } from "./sections.mjs";

const MAX_SUBSECTIONS = 5;

export default {
  names: ["max-subsections"],
  description: `A section may have at most ${MAX_SUBSECTIONS} direct subsections`,
  tags: ["headings"],
  parser: "markdownit",
  function: (params, onError) => {
    for (const section of collectSections(
      params.parsers.markdownit.tokens,
      params.lines,
    )) {
      if (section.children.length > MAX_SUBSECTIONS) {
        onError({
          lineNumber: section.line + 1,
          detail: `The section has ${section.children.length} subsections; the maximum is ${MAX_SUBSECTIONS}.`,
        });
      }
    }
  },
};
