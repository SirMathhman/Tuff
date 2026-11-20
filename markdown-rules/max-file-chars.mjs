// Reports a markdown file longer than MAX_CHARACTERS characters.

const MAX_CHARACTERS = 7500;

export default {
  names: ["max-file-chars"],
  description: `A markdown file may be at most ${MAX_CHARACTERS} characters`,
  tags: ["length"],
  parser: "none",
  function: (params, onError) => {
    const { lines } = params;
    const characters = lines.join("\n").length;
    if (characters > MAX_CHARACTERS) {
      onError({
        lineNumber: 1,
        detail: `The file has ${characters} characters; the maximum is ${MAX_CHARACTERS}.`,
      });
    }
  },
};
