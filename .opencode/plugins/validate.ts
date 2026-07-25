import type { Plugin } from "@opencode-ai/plugin";

const FORMATTER_NOTE =
  " Note: the formatter runs before the linter — if a file is too long, split it rather than fiddling with whitespace.";

export const ValidateOnIdle: Plugin = async ({ $, client }) => {
  return {
    event: async ({ event }) => {
      if (event.type !== "session.idle") return;
      const sessionId = event.properties.sessionID;

      const checks = [
        { name: "test", run: () => $`npm run test`, note: "" },
        { name: "cpd", run: () => $`npm run cpd`, note: "" },
        { name: "lint", run: () => $`npm run lint`, note: FORMATTER_NOTE },
        {
          name: "circular",
          run: () => $`npm run circular`,
          note: FORMATTER_NOTE,
        },
        {
          name: "visualize",
          run: () => $`npm run visualize`,
          note: FORMATTER_NOTE,
        },
      ];

      for (const check of checks) {
        try {
          await check.run();
        } catch (err: any) {
          const detail =
            err?.stderr?.toString?.() ||
            err?.stdout?.toString?.() ||
            String(err);
          await client.session.prompt({
            path: { id: sessionId },
            body: {
              parts: [
                {
                  type: "text",
                  text: `${check.name} failed:\n${detail}${check.note}`,
                },
              ],
            },
          });
          return;
        }
      }
    },
  };
};
