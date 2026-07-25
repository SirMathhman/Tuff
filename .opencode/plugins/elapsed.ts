import type { Plugin } from "@opencode-ai/plugin";

const sessionStart = new Map<string, number>();
const lastNotified = new Map<string, number>();
const INTERVAL_MS = 60_000;

export const ElapsedTimeNotifier: Plugin = async ({ client }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.created") {
        const sessionId = event.properties.info.id;
        sessionStart.set(sessionId, Date.now());
        lastNotified.set(sessionId, 0);
      }
    },
    "tool.execute.after": async (input) => {
      const sessionId = input.sessionID;
      const start = sessionStart.get(sessionId);
      if (!start) return;

      const elapsedMs = Date.now() - start;
      const currentInterval = Math.floor(elapsedMs / INTERVAL_MS);
      const last = lastNotified.get(sessionId) ?? 0;

      if (currentInterval > last && currentInterval >= 1) {
        lastNotified.set(sessionId, currentInterval);
        await client.session.prompt({
          path: { id: sessionId },
          body: {
            noReply: true,
            parts: [
              {
                type: "text",
                text: `[System] You have been working on this task for ${currentInterval} minute(s).`,
              },
            ],
          },
        });
      }
    },
  };
};
